import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UtensilsCrossed, X, ChevronUp, ChevronDown, Copy, FileDown } from "lucide-react";
import Papa from 'papaparse';

const RecipePage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [excludedProducts, setExcludedProducts] = useState(new Set());
  const [servings, setServings] = useState(4);
  const exampleRecipes = [
    {
      name: "Tarte aux Pommes Classique",
      content: `Tarte aux pommes pour 4 personnes
200g de farine
100g de beurre
4 pommes
50g de sucre
1 pincée de sel
60ml d'eau`
    },
    {
      name: "Quiche Lorraine",
      content: `Quiche lorraine pour 6 personnes
200g de pâte brisée
200g de lardons
4 oeufs
20cl de crème fraîche
20cl de lait
1 pincée de sel
1 pincée de poivre`
    }
  ];

  // Load product data on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/products_v2_curated_deduplicated_change_cat_names.csv');
        const text = await response.text();
        
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          transform: (value) => {
            if (value === '') return null;
            if (value === 'True') return true;
            if (value === 'False') return false;
            return value;
          },
          complete: (results) => {
            setProducts(results.data);
            setLoading(false);
          },
          error: (error) => {
            setError('Error loading product data: ' + error.message);
            setLoading(false);
          }
        });
      } catch (error) {
        setError('Error loading data: ' + error.message);
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  const analyzeRecipe = async () => {
    setAnalyzing(true);
    setError(null);
    
    try {
      // Parse recipe into ingredients
      const parseResponse = await fetch('http://localhost:3000/api/parse-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      });
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || 'Failed to parse recipe');
      }
      
      const { ingredients, servings } = await parseResponse.json();
      
      // Process each ingredient
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
        
        // Find matching products
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
        
        // Get best match
        const matchResponse = await fetch('http://localhost:3000/api/select-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredient, candidates: candidateProducts })
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
      setResults({ matches, servings });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleExcludeProduct = (productId) => {
    setExcludedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const getTotalCost = () => {
    if (!results) return 0;
    return results.matches.reduce((total, match) => {
      if (!match.selectedProduct?.price_eur || excludedProducts.has(match.selectedProduct.productId)) {
        return total;
      }
      return total + match.selectedProduct.price_eur;
    }, 0).toFixed(2);
  };

  const adjustServings = (newServings) => {
    if (newServings < 1) return;
    const ratio = newServings / servings;
    
    if (!results) return;
    
    const adjustedResults = {
      ...results,
      servings: newServings,
      matches: results.matches.map(match => ({
        ...match,
        ingredient: {
          ...match.ingredient,
          amount: (match.ingredient.amount * ratio).toFixed(1)
        }
      }))
    };
    
    setServings(newServings);
    setResults(adjustedResults);
  };

  const exportShoppingList = () => {
    if (!results) return;
    
    const list = [
      `Liste de courses - ${new Date().toLocaleDateString('fr-FR')}`,
      `Pour ${results.servings} personnes`,
      '',
      ...results.matches
        .filter(m => !excludedProducts.has(m.selectedProduct?.productId))
        .map(m => {
          if (!m.selectedProduct) return `${m.ingredient.name} - Produit non trouvé`;
          return `${m.selectedProduct.name} - ${m.ingredient.amount}${m.ingredient.unit} - €${m.selectedProduct.price_eur?.toFixed(2)}`;
        }),
      '',
      `Total: €${getTotalCost()}`
    ].join('\n');
    
    const blob = new Blob([list], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liste-courses.txt';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Recipe Input Section */}
        <Card className="mb-8 overflow-hidden border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Entrez Votre Recette</h2>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Voir des Exemples
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Exemples de Recettes</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4">
                    {exampleRecipes.map((example, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        onClick={() => {
                          setRecipe(example.content);
                          // Close dialog automatically
                        }}
                      >
                        {example.name}
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <Textarea
              placeholder="Ex: Tarte aux pommes pour 4 personnes
200g de farine
100g de beurre
4 pommes
..."
              value={recipe}
              onChange={(e) => setRecipe(e.target.value)}
              className="min-h-40 text-lg mb-4 border-gray-200 focus:ring-2 focus:ring-blue-500"
            />
            
            <Button 
              onClick={analyzeRecipe} 
              disabled={analyzing || !recipe.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 font-medium py-3"
            >
              {analyzing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                'Calculer le Coût'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {results && (
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Coût Total: €{getTotalCost()}
                    </h2>
                    <p className="text-gray-600">
                      {(getTotalCost() / results.servings).toFixed(2)}€ par personne
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => adjustServings(servings - 1)}
                      disabled={servings <= 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <span className="w-16 text-center">
                      {servings} pers.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => adjustServings(servings + 1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(recipe);
                    }}
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copier la Recette
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportShoppingList}
                    className="flex-1"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Exporter la Liste
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.matches.map((match, index) => (
                <Card 
                  key={index}
                  className={`border-0 shadow-md transition-all duration-200 ${
                    excludedProducts.has(match.selectedProduct?.productId) 
                      ? 'opacity-50' 
                      : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium text-lg">
                          {match.ingredient.name}
                        </h3>
                        <p className="text-gray-500">
                          {match.ingredient.amount} {match.ingredient.unit}
                        </p>
                      </div>
                      
                      {match.selectedProduct && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExcludeProduct(match.selectedProduct.productId)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {match.selectedProduct ? (
                      <div className="flex items-center gap-4">
                        {match.selectedProduct.image_src && (
                          <img
                            src={match.selectedProduct.image_src}
                            alt={match.selectedProduct.name}
                            className="w-20 h-20 object-cover rounded-lg border border-gray-100"
                          />
                        )}
                        
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 mb-1">
                            {match.selectedProduct.name}
                          </p>
                          <p className="text-lg font-semibold text-blue-600">
                            €{match.selectedProduct.price_eur?.toFixed(2)}
                          </p>
                          {!match.compatible && (
                            <p className="text-yellow-600 text-sm mt-1 flex items-center gap-1">
                              ⚠️ Quantité différente disponible
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">
                        Produit non trouvé
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipePage;