import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UtensilsCrossed, X, Plus, ChevronUp, ChevronDown, Copy, FileDown, Sparkles, CheckCircle2 } from "lucide-react";
import Papa from 'papaparse';


const BackgroundPattern = () => (
  <div className="fixed inset-0 z-0 opacity-[0.015]" aria-hidden="true">
    <svg width="100%" height="100%">
      <pattern id="pattern-circles" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="25" cy="25" r="15" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="25" cy="25" r="10" fill="none" stroke="currentColor" strokeWidth="0.5"/>
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-circles)"/>
    </svg>
  </div>
);


const RecipePage = () => {
  // Existing state declarations
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [excludedProducts, setExcludedProducts] = useState(new Set());
  const [servings, setServings] = useState(4);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);

  // Animation helpers
  const handleCopy = async () => {
    await navigator.clipboard.writeText(recipe);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    exportShoppingList();
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const PIECE_TO_WEIGHT = {
    'oignon': 150,    // 150g per onion
    'pomme': 200,     // 200g per apple
    'ail': 30,        // 30g per garlic head
    'citron': 100,    // 100g per lemon
    'orange': 150,    // 150g per orange
    'banane': 120,    // 120g per banana
    'poireau': 200,   // 200g per leek
    'carotte': 100,   // 100g per carrot
    'courgette': 200  // 200g per zucchini
  };

  // Example recipes data
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

  // Helper functions
  const standardizeUnit = (value, unit) => {
    unit = unit.toLowerCase();
    // Weight conversions
    if (unit === 'kg') return value * 1000;
    if (unit === 'g') return value;
    // Volume conversions
    if (unit === 'l') return value * 1000;
    if (unit === 'ml' || unit === 'cl') return unit === 'cl' ? value * 10 : value;
    // Handle teaspoon/tablespoon approximations
    if (unit === 'tsp' || unit === 'càc') return value * 5; // ~5g per teaspoon
    if (unit === 'tbsp' || unit === 'càs') return value * 15; // ~15g per tablespoon
    // Keep original for pieces/units
    return value;
  };
  const parseProductSize = (sizeStr) => {
    if (!sizeStr) return null;
    
    // Common patterns: "1kg", "500g", "1L", "500ml", "6x1.5L", "pack 6", etc.
    const sizeRegex = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl|piece|pièce|pieces|pièces)/i;
    const match = sizeStr.toLowerCase().match(sizeRegex);
    
    if (!match) return null;
    
    const [_, value, unit] = match;
    return {
      value: parseFloat(value),
      unit: unit.toLowerCase()
    };
  };

  const parsePackSize = (sizeStr) => {
    // Early return if sizeStr is undefined, null, or not a string
    if (!sizeStr || typeof sizeStr !== 'string') return null;
    
    // Handle "X par pack" format
    const packMatch = sizeStr.match(/(\d+)\s*par\s*pack/i);
    if (packMatch) {
      return {
        value: parseInt(packMatch[1]),
        unit: 'piece',
        isPackaging: true
      };
    }
    
    // Handle standard measurements
    const sizeRegex = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl|piece|pièce|pieces|pièces)/i;
    const match = sizeStr.match(sizeRegex);
    
    if (!match) return null;
    
    const [_, value, unit] = match;
    return {
      value: parseFloat(value),
      unit: unit.toLowerCase(),
      isPackaging: false
    };
  };

  const calculateProportionalPrice = (match) => {
    if (!match.selectedProduct || !match.selectedProduct.price_eur) return 0;
  
    const product = match.selectedProduct;
    const ingredient = match.ingredient;
    const productSize = parsePackSize(product.size_value);
  
    // If we can't parse the product size, return the full product price
    if (!productSize) return product.price_eur;
  
    // Handle items sold in pieces/packs
    if (ingredient.unit.toLowerCase().includes('piece') || 
        ingredient.unit.toLowerCase().includes('pièce')) {
      
      if (productSize.isPackaging) {
        // For packaged items (like eggs sold in dozens)
        const ratio = ingredient.amount / productSize.value;
        return product.price_eur * ratio;
      } else if (productSize.unit.includes('g') || productSize.unit.includes('kg')) {
        // For items sold by weight but recipe asks for pieces
        const averageWeight = PIECE_TO_WEIGHT[ingredient.name.toLowerCase()];
        if (averageWeight) {
          // Convert pieces to weight and calculate ratio
          const totalWeightNeeded = ingredient.amount * averageWeight;
          const productWeight = standardizeUnit(productSize.value, productSize.unit);
          return (totalWeightNeeded / productWeight) * product.price_eur;
        }
      }
    }
  
    // Handle weight-based measurements
    const isWeight = ['g', 'kg'].includes(ingredient.unit.toLowerCase());
    const isVolume = ['ml', 'l', 'cl', 'tsp', 'tbsp', 'càc', 'càs'].includes(ingredient.unit.toLowerCase());
    const isProductWeight = ['g', 'kg'].includes(productSize.unit);
    const isProductVolume = ['ml', 'l', 'cl'].includes(productSize.unit);
  
    // Convert everything to standard unit (grams or milliliters)
    const requiredAmount = standardizeUnit(ingredient.amount, ingredient.unit);
    const productAmount = standardizeUnit(productSize.value, productSize.unit);
  
    // Handle measurement conversions
    if ((isWeight && isProductWeight) || (isVolume && isProductVolume)) {
      return (requiredAmount / productAmount) * product.price_eur;
    }
  
    // If we can't convert between units, return the full product price
    return product.price_eur;
  };

  const getTotalCost = () => {
    if (!results) return 0;
    return results.matches.reduce((total, match) => {
      if (excludedProducts.has(match.selectedProduct?.productId)) {
        return total;
      }
      return total + calculateProportionalPrice(match);
    }, 0).toFixed(2);
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
          return `${m.selectedProduct.name} - ${m.ingredient.amount}${m.ingredient.unit} - €${calculateProportionalPrice(m).toFixed(2)}`;
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

  const renderProductCard = (match, index) => (
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
                {match.selectedProduct.size_value && (
                  <span className="text-gray-500"> • {match.selectedProduct.size_value}</span>
                )}
              </p>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-blue-600">
                  €{calculateProportionalPrice(match).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">
                  (Prix du produit: €{match.selectedProduct.price_eur?.toFixed(2)})
                </p>
              </div>
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
  );

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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-lg text-gray-600">Chargement des données...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 relative">
      {/* Background Pattern */}
      <div className="fixed inset-0 z-0 opacity-[0.015]" aria-hidden="true">
        <svg width="100%" height="100%">
          <pattern id="pattern-circles" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
            <circle cx="25" cy="25" r="15" fill="none" stroke="currentColor" strokeWidth="0.5"/>
            <circle cx="25" cy="25" r="10" fill="none" stroke="currentColor" strokeWidth="0.5"/>
          </pattern>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-circles)"/>
        </svg>
      </div>
      
      {/* Animated floating shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"/>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"/>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"/>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxIDAgNiAyLjY5IDYgNnMtMi42OSA2LTYgNi02LTIuNjktNi02IDIuNjktNiA2LTZ6IiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9nPjwvc3ZnPg==')] opacity-10" />
        <div className="max-w-4xl mx-auto px-6 py-16 relative">
          <h1 className="text-4xl font-bold text-white mb-4 text-center animate-fade-in">
            Le vrai prix de vos envies
          </h1>
          <p className="text-lg text-orange-50 max-w-3xl mx-auto text-center leading-relaxed animate-fade-in animation-delay-200">
            Transformez n'importe quelle recette en liste de course intelligente, et découvrez son coût réel
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 relative z-10">
        {/* Recipe Input Card */}
        <Card className="mb-8 border-0 shadow-xl bg-white/90 backdrop-blur-md hover:shadow-2xl transition-all duration-500 animate-slide-up">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2 rounded-lg shadow-lg">
                  <UtensilsCrossed className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Entrez Votre Recette</h2>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-orange-200 hover:bg-orange-50 font-medium transition-colors"
                  >
                    <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
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
                        }}
                        className="hover:bg-orange-50 transition-colors"
                      >
                        {example.name}
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <Textarea
              placeholder="Ex: Tarte aux pommes pour 4 personnes&#10;200g de farine&#10;100g de beurre&#10;4 pommes..."
              value={recipe}
              onChange={(e) => setRecipe(e.target.value)}
              className="min-h-40 text-lg mb-6 bg-white/90 border-gray-200 focus:ring-2 focus:ring-orange-500 rounded-xl shadow-inner"
            />
            
            <Button 
              onClick={analyzeRecipe} 
              disabled={analyzing || !recipe.trim()}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                'Calculer le Coût'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {results && (
          <div className="space-y-6 animate-fade-in">
            <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white transform hover:scale-[1.02] transition-all duration-300">
              <CardContent className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div className="animate-slide-left">
                    <h2 className="text-3xl font-bold mb-2">
                      €{getTotalCost()}
                    </h2>
                    <p className="text-blue-100 text-lg">
                      {(getTotalCost() / results.servings).toFixed(2)}€ par personne
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-white/10 rounded-lg p-2 animate-slide-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => adjustServings(servings - 1)}
                      disabled={servings <= 1}
                      className="hover:bg-white/20 text-white transform active:scale-95 transition-transform"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <span className="w-16 text-center font-medium">
                      {servings} pers.
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => adjustServings(servings + 1)}
                      className="hover:bg-white/20 text-white transform active:scale-95 transition-transform"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleCopy}
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0 transform active:scale-95 transition-all duration-300"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 animate-zoom-in" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copied ? 'Copié!' : 'Copier la Recette'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleExport}
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0 transform active:scale-95 transition-all duration-300"
                  >
                    {exported ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 animate-zoom-in" />
                    ) : (
                      <FileDown className="h-4 w-4 mr-2" />
                    )}
                    {exported ? 'Exporté!' : 'Exporter la Liste'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results?.matches.map((match, index) => {
            const isExcluded = excludedProducts.has(match.selectedProduct?.productId);
            
            return (
              <div 
                key={index}
                style={{
                  animationDelay: `${index * 100}ms`,
                  '--card-opacity': isExcluded ? '0.3' : '1',
                  opacity: 'var(--card-opacity)',
                  transition: 'opacity 0.2s ease-in-out'
                }}
              >
                <Card className="border-0 shadow-lg transition-all duration-500 bg-white/90 backdrop-blur hover:shadow-xl transform hover:-translate-y-1 animate-slide-up">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
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
                        className={`
                          transition-colors
                          ${isExcluded 
                            ? 'text-green-500 hover:text-green-600' 
                            : 'text-gray-500 hover:text-red-600'
                          }
                        `}
                      >
                        {isExcluded ? (
                          <Plus className="h-5 w-5" />
                        ) : (
                          <X className="h-5 w-5" />
                        )}
                      </Button>
                    )}
                  </div>

                  {match.selectedProduct ? (
                    <div className="flex items-center gap-4">
                      {match.selectedProduct.image_src && (
                        <div className="relative w-24 h-24 rounded-xl overflow-hidden shadow-md">
                          <img
                            src={match.selectedProduct.image_src}
                            alt={match.selectedProduct.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                          {match.selectedProduct.name}
                          {match.selectedProduct.size_value && (
                            <span className="text-gray-500"> • {match.selectedProduct.size_value}</span>
                          )}
                        </p>
                        <div className="space-y-1">
                          <p className="text-xl font-bold text-blue-600">
                            €{calculateProportionalPrice(match).toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">
                            Prix unitaire: €{match.selectedProduct.price_eur?.toFixed(2)}
                          </p>
                        </div>
                        {!match.compatible && (
                          <p className="text-yellow-600 text-sm mt-2 flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-md">
                            ⚠️ Quantité différente disponible
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm font-medium">
                      Produit non trouvé
                    </div>
                  )}
        </CardContent>
      </Card>
    </div>
  );
})}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipePage;