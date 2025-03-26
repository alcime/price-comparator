import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const RecipeAnalyzer = ({ products }) => {
  const [recipe, setRecipe] = useState('');
  const [loading, setLoading] = useState(false);
  const [matchedProducts, setMatchedProducts] = useState(null);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState(null);

  const analyzeRecipe = async () => {
    console.log('Starting recipe analysis...');
    setLoading(true);
    setError(null);
    setDebug(null);
    
    try {
      // Step 1: Parse recipe into ingredients with enhanced data
      const parseResponse = await fetch('http://localhost:3000/api/parse-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      });
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        console.error('Recipe parsing error:', errorData);
        throw new Error(`Failed to parse recipe: ${errorData.error}${errorData.details ? '\nDetails: ' + JSON.stringify(errorData.details) : ''}`);
      }
      
      // Extract the enhanced recipe data
      const recipeData = await parseResponse.json();
      const { ingredients, servings, title, recipeType, cuisineOrigin } = recipeData;
      
      setDebug(prev => ({ 
        ...prev, 
        ingredients,
        recipeInfo: { title, recipeType, cuisineOrigin, servings }
      }));
      
      // Step 2: Process each ingredient
      const matchPromises = ingredients.map(async ingredient => {
        // Get ingredient categories with our enhanced endpoint
        const categoryResponse = await fetch('http://localhost:3000/api/suggest-category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ingredient: ingredient.name,
            categories: products.map(p => p.main_category).filter((v, i, a) => a.indexOf(v) === i)
          })
        });
        
        if (!categoryResponse.ok) {
          throw new Error(`Failed to get category for ${ingredient.name}`);
        }
        
        const { categories } = await categoryResponse.json();
        setDebug(prev => ({ 
          ...prev, 
          categories: { ...(prev?.categories || {}), [ingredient.name]: categories } 
        }));
        
        // Try each category until we find candidate products
        let candidateProducts = [];
        let usedCategory = null;
        
        for (const category of categories) {
          // Get products from this category (improved filtering by considering possible alternatives)
          let categoryProducts = products.filter(product => product.main_category === category);
          
          // First try exact name matches
          candidateProducts = categoryProducts.filter(product => 
            product.name?.toLowerCase().includes(ingredient.name.toLowerCase())
          );
          
          // If we don't have enough matches, try alternatives
          if (candidateProducts.length < 5 && ingredient.possibleAlternatives) {
            for (const alternative of ingredient.possibleAlternatives) {
              const altMatches = categoryProducts.filter(product => 
                product.name?.toLowerCase().includes(alternative.toLowerCase())
              );
              candidateProducts = [...candidateProducts, ...altMatches];
              if (candidateProducts.length >= 10) break;
            }
          }
          
          // Limit results and move to next step if we have enough
          candidateProducts = candidateProducts.slice(0, 10);
          if (candidateProducts.length > 0) {
            usedCategory = category;
            break;
          }
        }
        
        // If we still don't have candidates, try broader search
        if (candidateProducts.length === 0) {
          candidateProducts = products
            .filter(product => product.name?.toLowerCase().includes(ingredient.name.toLowerCase()))
            .slice(0, 10);
        }
        
        // Final matching with enhanced LLM endpoint
        const matchResponse = await fetch('http://localhost:3000/api/select-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredient,
            candidates: candidateProducts
          })
        });
        
        if (!matchResponse.ok) {
          throw new Error(`Failed to match product for ${ingredient.name}`);
        }
        
        const match = await matchResponse.json();
        return {
          ...match,
          ingredient,
          category: usedCategory || categories[0],
          isCritical: ingredient.isCritical || true
        };
      });
      
      const matches = await Promise.all(matchPromises);
      setMatchedProducts(matches);
      setDebug(prev => ({ ...prev, finalMatches: matches }));
      
    } catch (err) {
      console.error('Error analyzing recipe:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTotalCost = () => {
    if (!matchedProducts) return 0;
    return matchedProducts.reduce((total, match) => {
      const product = match.selectedProduct;
      if (!product?.price_eur) return total;
      return total + product.price_eur;
    }, 0).toFixed(2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe Cost Calculator</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Textarea
            placeholder="Entrez votre recette (e.g., 'Tarte aux pommes pour 4 personnes')"
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
            className="min-h-32"
          />
          
          <Button 
            onClick={analyzeRecipe} 
            disabled={loading || !recipe.trim()}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Analyze Recipe
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {matchedProducts && debug?.recipeInfo && (
            <>
              {/* Recipe information card */}
              <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-0 shadow-sm">
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-700">
                        {debug.recipeInfo.title || "Recipe Analysis"}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                          {debug.recipeInfo.recipeType || "Recipe"}
                        </span>
                        {debug.recipeInfo.cuisineOrigin && (
                          <span className="text-sm px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
                            {debug.recipeInfo.cuisineOrigin}
                          </span>
                        )}
                        <span className="text-sm px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                          {debug.recipeInfo.servings} servings
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end items-center">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Total Cost</div>
                        <div className="text-2xl font-bold text-blue-700">
                          €{getTotalCost()}
                        </div>
                        <div className="text-sm text-gray-600">
                          €{(getTotalCost() / debug.recipeInfo.servings).toFixed(2)} per serving
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    View Detailed Analysis
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Recipe Analysis Results: {debug.recipeInfo.title || "Recipe"}</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Matched Product</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchedProducts.map((match, index) => (
                          <TableRow 
                            key={index}
                            className={match.ingredient.isCritical === false ? "bg-gray-50 text-gray-500" : ""}
                          >
                            <TableCell>
                              {match.ingredient.name}
                              {match.ingredient.isCritical === false && (
                                <span className="text-xs ml-2 text-gray-500">(optional)</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {match.ingredient.amount} {match.ingredient.unit}
                            </TableCell>
                            <TableCell>{match.category}</TableCell>
                            <TableCell>
                              {match.selectedProduct?.name || 'No match found'}
                              {match.selectedProduct && (
                                <div className="flex flex-col gap-1 mt-1">
                                  <div className="flex items-center gap-2">
                                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${
                                          match.confidence > 0.8 ? 'bg-green-500' : 
                                          match.confidence > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${match.confidence * 100}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {Math.round(match.confidence * 100)}%
                                    </span>
                                  </div>
                                  
                                  {!match.compatible && (
                                    <span className="text-yellow-500 text-xs flex items-center">
                                      ⚠️ Quantity mismatch
                                    </span>
                                  )}
                                  
                                  {match.substitutionNotes && (
                                    <span className="text-blue-500 text-xs flex items-center">
                                      ℹ️ {match.substitutionNotes}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {match.selectedProduct?.price_eur?.toFixed(2) || '-'}€
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          
          {debug && (
            <div className="mt-4 p-4 bg-gray-100 rounded-md">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecipeAnalyzer;