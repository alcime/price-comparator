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
      // Step 1: Parse recipe into ingredients
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
      
      const { ingredients, servings } = await parseResponse.json();
      setDebug(prev => ({ ...prev, ingredients }));
      
      // Step 2: Process each ingredient
      const matchPromises = ingredients.map(async ingredient => {
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
        
        // Try each category until we find products
        let candidateProducts = [];
        let usedCategory = null;
        
        for (const category of categories) {
          candidateProducts = products
            .filter(product => 
              product.main_category === category && 
              product.name.toLowerCase().includes(ingredient.name.toLowerCase())
            )
            .slice(0, 10);
          
          if (candidateProducts.length > 0) {
            usedCategory = category;
            break;
          }
        }
        
        // Final matching with LLM
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
          category: usedCategory || categories[0]
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

          {matchedProducts && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  View Detailed Analysis (€{getTotalCost()})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Recipe Analysis Results</DialogTitle>
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
                        <TableRow key={index}>
                          <TableCell>{match.ingredient.name}</TableCell>
                          <TableCell>
                            {match.ingredient.amount} {match.ingredient.unit}
                          </TableCell>
                          <TableCell>{match.category}</TableCell>
                          <TableCell>
                            {match.selectedProduct?.name || 'No match found'}
                            {match.selectedProduct && (
                              <div className="text-sm text-gray-500">
                                Confidence: {(match.confidence * 100).toFixed(1)}%
                                {!match.compatible && (
                                  <span className="text-yellow-500 ml-2">
                                    ⚠️ Quantity mismatch
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