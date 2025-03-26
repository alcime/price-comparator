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
  const [analysisProgress, setAnalysisProgress] = useState({ step: 0, total: 5, message: '', matches: [] });
  const [showLoadingTip, setShowLoadingTip] = useState(0);

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
  
  // Loading tips and facts to display during recipe analysis
  const LOADING_TIPS = [
    { icon: "🍎", tip: "Les pommes flottent car elles sont composées à 25% d'air." },
    { icon: "🧂", tip: "Le sel était si précieux dans l'Antiquité qu'il servait de monnaie d'échange." },
    { icon: "🍞", tip: "La première miche de pain a été cuite il y a environ 30 000 ans." },
    { icon: "🥚", tip: "La couleur de la coquille d'un œuf dépend de la race de la poule, pas de sa qualité." },
    { icon: "🧀", tip: "La France produit plus de 1 500 variétés de fromage." },
    { icon: "🍷", tip: "Faire 'tchin-tchin' vient d'une tradition chinoise pour se protéger des empoisonnements." },
    { icon: "🍋", tip: "Il y a plus de vitamine C dans un kiwi que dans un citron." },
    { icon: "🥕", tip: "Les carottes n'étaient pas orange à l'origine, mais plutôt violettes ou blanches." },
    { icon: "🍝", tip: "Marco Polo n'a pas rapporté les pâtes d'Asie, elles existaient déjà en Italie." },
    { icon: "🍅", tip: "La tomate était considérée comme toxique en Europe jusqu'au 18ème siècle." },
    { icon: "🍫", tip: "Le chocolat fait fondre dans la bouche car son point de fusion est légèrement inférieur à la température corporelle." },
    { icon: "🥔", tip: "La pomme de terre a plus de chromosomes que l'être humain." }
  ];

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
    if (!match.selectedProduct || typeof match.selectedProduct.price_eur !== 'number') return 0;
  
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
      const price = calculateProportionalPrice(match);
      return typeof price === 'number' ? total + price : total;
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
          amount: typeof match.ingredient.amount === 'number' 
            ? (match.ingredient.amount * ratio).toFixed(1)
            : match.ingredient.amount
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
          const price = calculateProportionalPrice(m);
          return `${m.selectedProduct.name} - ${m.ingredient.amount}${m.ingredient.unit} - €${typeof price === 'number' ? price.toFixed(2) : '0.00'}`;
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
        // First try to load products from the server API
        try {
          const response = await fetch('http://localhost:3000/api/products');
          if (response.ok) {
            const data = await response.json();
            if (data.products && data.products.length > 0) {
              console.log(`Loaded ${data.products.length} products from server API`);
              setProducts(data.products);
              setLoading(false);
              return;
            }
          }
        } catch (apiError) {
          console.warn('Failed to load products from API, falling back to CSV:', apiError);
        }
        
        // Fall back to parsing the CSV directly
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
            console.log(`Loaded ${results.data.length} products from CSV`);
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
    // Reset states
    setAnalyzing(true);
    setError(null);
    setResults(null);
    setAnalysisProgress({ 
      step: 1, 
      total: 5, 
      message: 'Analyse de la recette...', 
      matches: [],
      startTime: new Date().getTime()
    });
    
    // Start cycling through tips
    const tipInterval = setInterval(() => {
      setShowLoadingTip(current => (current + 1) % LOADING_TIPS.length);
    }, 5000);
    
    try {
      // Step 1: Parse recipe
      setAnalysisProgress(prev => ({ ...prev, step: 1, message: 'Analyse de la recette...' }));
      console.time('Recipe Analysis - Total');
      console.time('Step 1: Recipe Parsing');
      
      const parseResponse = await fetch('http://localhost:3000/api/parse-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      });
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || 'Failed to parse recipe');
      }
      
      const recipeData = await parseResponse.json();
      const { ingredients, servings, title, recipeType, cuisineOrigin } = recipeData;
      
      console.timeEnd('Step 1: Recipe Parsing');
      
      // Step 2: Begin ingredient categorization in parallel
      setAnalysisProgress(prev => ({ 
        ...prev, 
        step: 2, 
        message: `Analyse des ${ingredients.length} ingrédients en parallèle...`,
        recipeInfo: { title, servings, recipeType, cuisineOrigin } 
      }));
      
      console.time('Step 2: Batch Ingredient Categorization');
      
      // Get unique categories from products
      const uniqueCategories = products
        .map(p => p.main_category)
        .filter((v, i, a) => a.indexOf(v) === i);
      
      // Batch process all ingredients at once to get categories
      const batchCategoryResponse = await fetch('http://localhost:3000/api/batch-analyze-ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ingredients: ingredients,
          categories: uniqueCategories
        })
      });
      
      if (!batchCategoryResponse.ok) {
        const errorData = await batchCategoryResponse.json();
        throw new Error(errorData.error || 'Failed to categorize ingredients');
      }
      
      const { results: categorizedIngredients } = await batchCategoryResponse.json();
      console.timeEnd('Step 2: Batch Ingredient Categorization');
      
      // Store successful categorizations and fallback plan for errors
      const successfulCategorizations = categorizedIngredients.filter(r => r.status === 'success');
      const failedCategorizations = categorizedIngredients.filter(r => r.status === 'error');
      
      // Update progress to show categorization results
      setAnalysisProgress(prev => ({ 
        ...prev, 
        step: 3, 
        message: `Catégorisation: ${successfulCategorizations.length}/${ingredients.length} réussis` 
      }));
      
      // Display current ingredients being processed
      const displayedIngredients = successfulCategorizations.slice(0, 5).map(r => r.ingredient.name);
      
      setAnalysisProgress(prev => ({ 
        ...prev, 
        message: `Recherche de produits pour ${displayedIngredients.join(', ')}...` 
      }));
      
      // Step 3: Parallel product matching
      console.time('Step 3: Parallel Product Matching');
      
      // We don't need to send the entire product database to the backend
      // Just send the categorized ingredients with their categories
      const parallelMatchResponse = await fetch('http://localhost:3000/api/parallel-match-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ingredients: successfulCategorizations
        })
      });
      
      if (!parallelMatchResponse.ok) {
        const errorData = await parallelMatchResponse.json();
        throw new Error(errorData.error || 'Failed to match products');
      }
      
      const { matches } = await parallelMatchResponse.json();
      console.timeEnd('Step 3: Parallel Product Matching');
      
      // Update progress with results in batches to create a more dynamic UI experience
      const batchSize = Math.max(1, Math.ceil(matches.length / 5));
      
      for (let i = 0; i < matches.length; i += batchSize) {
        const currentBatch = matches.slice(0, i + batchSize);
        
        // Update progress
        setAnalysisProgress(prev => ({ 
          ...prev, 
          step: 3 + ((i + batchSize) / matches.length) * 1.5, // Step 3-4.5 progress
          matches: currentBatch, 
          message: `${i + batchSize >= matches.length ? matches.length : i + batchSize}/${matches.length} ingrédients analysés...`
        }));
        
        // Small delay to show batched updates
        if (i + batchSize < matches.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Step 5: Finalize calculations
      setAnalysisProgress(prev => ({ 
        ...prev, 
        step: 5, 
        message: 'Calcul du prix total...',
        endTime: new Date().getTime(),
        duration: (new Date().getTime() - prev.startTime) / 1000
      }));
      
      // Small delay to show the final calculation step
      await new Promise(resolve => setTimeout(resolve, 800));
      
      console.timeEnd('Recipe Analysis - Total');
      
      // Set final results with duration info
      setResults({ 
        matches, 
        servings,
        analysisDuration: (new Date().getTime() - analysisProgress.startTime) / 1000
      });
      
    } catch (err) {
      console.error('Recipe analysis error:', err);
      setError(err.message);
    } finally {
      clearInterval(tipInterval);
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
      
      {/* Animated floating shapes - adjusted for better mobile view */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-16 sm:-top-32 -right-16 sm:-right-32 w-32 sm:w-64 h-32 sm:h-64 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"/>
        <div className="absolute -bottom-16 sm:-bottom-32 -left-16 sm:-left-32 w-32 sm:w-64 h-32 sm:h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"/>
        <div className="absolute top-1/2 left-1/2 w-32 sm:w-64 h-32 sm:h-64 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"/>
      </div>

      {/* Hero Section - optimized for mobile */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxIDAgNiAyLjY5IDYgNnMtMi42OSA2LTYgNi02LTIuNjktNi02IDIuNjktNiA2LTZ6IiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9nPjwvc3ZnPg==')] opacity-10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 relative">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 text-center animate-fade-in">
            Le vrai prix de vos envies
          </h1>
          <p className="text-base sm:text-lg text-orange-50 max-w-3xl mx-auto text-center leading-relaxed animate-fade-in animation-delay-200">
            Transformez n'importe quelle recette en liste de course intelligente, et découvrez son coût réel
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 relative z-10">
        {/* Recipe Input Card - mobile optimized */}
        <Card className="mb-8 border-0 shadow-xl bg-white/90 backdrop-blur-md hover:shadow-2xl transition-all duration-500 animate-slide-up">
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2 rounded-lg shadow-lg">
                  <UtensilsCrossed className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Entrez Votre Recette</h2>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-orange-200 hover:bg-orange-50 font-medium transition-colors w-full sm:w-auto"
                  >
                    <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                    Voir des Exemples
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[90vw] sm:max-w-lg p-4 sm:p-6">
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
                        className="hover:bg-orange-50 transition-colors text-xs sm:text-sm text-start h-auto py-3"
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
              className="min-h-40 text-base sm:text-lg mb-4 sm:mb-6 bg-white/90 border-gray-200 focus:ring-2 focus:ring-orange-500 rounded-xl shadow-inner"
            />
            
            <Button 
              onClick={analyzeRecipe} 
              disabled={analyzing || !recipe.trim()}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium py-3 sm:py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
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
        
        {/* Recipe Analysis Loading UI */}
        {analyzing && (
          <Card className="mb-8 border-0 shadow-xl bg-white/95 backdrop-blur-md animate-fade-in">
            <CardContent className="p-4 sm:p-6 md:p-8">
              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-700">
                    {analysisProgress.message}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {Math.round((analysisProgress.step / analysisProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(analysisProgress.step / analysisProgress.total) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Cooking tip card */}
              <div className="mb-6 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-4 border border-orange-100 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">
                    {LOADING_TIPS[showLoadingTip].icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-orange-700 mb-1">Le saviez-vous ?</h4>
                    <p className="text-sm text-gray-700">
                      {LOADING_TIPS[showLoadingTip].tip}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Performance stats display */}
              <div className="mb-6 grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="text-xs text-blue-600 font-medium">Ingrédients</div>
                  <div className="text-xl font-bold text-blue-700">
                    {analysisProgress.matches?.length || 0}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                  <div className="text-xs text-green-600 font-medium">Temps écoulé</div>
                  <div className="text-xl font-bold text-green-700">
                    {((new Date().getTime() - analysisProgress.startTime) / 1000).toFixed(1)}s
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <div className="text-xs text-purple-600 font-medium">Vitesse</div>
                  <div className="text-xl font-bold text-purple-700">
                    {analysisProgress.matches?.length 
                      ? (analysisProgress.matches.length / ((new Date().getTime() - analysisProgress.startTime) / 1000)).toFixed(1)
                      : '0.0'}
                    <span className="text-xs font-normal">/s</span>
                  </div>
                </div>
              </div>
              
              {/* Partial results grid */}
              {analysisProgress.matches && analysisProgress.matches.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Ingrédients trouvés ({analysisProgress.matches.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {analysisProgress.matches.map((match, index) => (
                      <div 
                        key={index}
                        className="bg-white rounded-lg border border-gray-200 p-2 text-center animate-slide-up flex flex-col items-center"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <span className="text-xs text-gray-800 font-medium truncate w-full">
                          {match.ingredient.name}
                        </span>
                        <span className="text-2xl my-1">
                          {match.selectedProduct ? '✅' : '🔍'}
                        </span>
                        <span className="text-xs text-gray-500 truncate w-full">
                          {typeof match.selectedProduct?.price_eur === 'number' 
                            ? match.selectedProduct.price_eur.toFixed(2) + '€'
                            : '-€'}
                        </span>
                        {match.timestamp && (
                          <span className="text-xs text-blue-400 mt-1">
                            {((new Date(match.timestamp).getTime() - analysisProgress.startTime) / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    ))}
                    
                    {/* Pending ingredients animation */}
                    {analysisProgress.matches.length < (analysisProgress.recipeInfo?.ingredients?.length || 0) && (
                      <div className="bg-white rounded-lg border border-orange-200 p-2 text-center animate-pulse flex flex-col items-center">
                        <span className="text-xs text-orange-600 font-medium truncate w-full">
                          Traitement en parallèle...
                        </span>
                        <span className="text-2xl my-1">
                          <Loader2 className="h-5 w-5 animate-spin text-orange-500 mx-auto" />
                        </span>
                        <span className="text-xs text-gray-500 truncate w-full">
                          En cours...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Section - mobile responsive */}
        {results && (
          <div className="space-y-6 animate-fade-in">
            <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white transform hover:scale-[1.02] transition-all duration-300">
              <CardContent className="p-4 sm:p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 mb-3">
                  <div className="animate-slide-left">
                    <h2 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
                      €{getTotalCost()}
                    </h2>
                    <p className="text-blue-100 text-sm sm:text-base md:text-lg">
                      {(parseFloat(getTotalCost()) / results.servings).toFixed(2)}€ par personne
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-center gap-3 bg-white/10 rounded-lg p-2 animate-slide-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => adjustServings(servings - 1)}
                      disabled={servings <= 1}
                      className="hover:bg-white/20 text-white transform active:scale-95 transition-transform"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <span className="w-14 sm:w-16 text-center font-medium">
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
                
                {/* Performance stats */}
                {results.analysisDuration && (
                  <div className="flex flex-wrap gap-2 mt-2 bg-white/10 rounded-lg p-2">
                    <div className="flex-1 text-center">
                      <p className="text-white/70 text-xs">Temps total</p>
                      <p className="text-white font-medium">{results.analysisDuration.toFixed(1)}s</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-white/70 text-xs">Ingrédients</p>
                      <p className="text-white font-medium">{results.matches.length}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-white/70 text-xs">Vitesse</p>
                      <p className="text-white font-medium">
                        {(results.matches.length / results.analysisDuration).toFixed(1)}/s
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleCopy}
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0 transform active:scale-95 transition-all duration-300 text-xs sm:text-sm py-3"
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
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0 transform active:scale-95 transition-all duration-300 text-xs sm:text-sm py-3"
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
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-3 sm:mb-4">
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-gray-900">
                        {match.ingredient.name}
                      </h3>
                      <p className="text-gray-500 text-sm sm:text-base">
                        {match.ingredient.amount} {match.ingredient.unit}
                      </p>
                    </div>
                    
                    {match.selectedProduct && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExcludeProduct(match.selectedProduct.productId)}
                        className={`
                          transition-colors p-1 sm:p-2
                          ${isExcluded 
                            ? 'text-green-500 hover:text-green-600' 
                            : 'text-gray-500 hover:text-red-600'
                          }
                        `}
                      >
                        {isExcluded ? (
                          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                        ) : (
                          <X className="h-4 w-4 sm:h-5 sm:w-5" />
                        )}
                      </Button>
                    )}
                  </div>

                  {match.selectedProduct ? (
                    <div className="flex items-center gap-3 sm:gap-4">
                      {match.selectedProduct.image_src && (
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-lg sm:rounded-xl overflow-hidden shadow-md flex-shrink-0">
                          <img
                            src={match.selectedProduct.image_src}
                            alt={match.selectedProduct.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2 line-clamp-2 overflow-hidden text-ellipsis">
                          {match.selectedProduct.name}
                          {match.selectedProduct.size_value && (
                            <span className="text-gray-500 hidden sm:inline"> • {match.selectedProduct.size_value}</span>
                          )}
                        </p>
                        <div className="space-y-1">
                          <p className="text-lg sm:text-xl font-bold text-blue-600">
                            €{typeof calculateProportionalPrice(match) === 'number' 
                              ? calculateProportionalPrice(match).toFixed(2) 
                              : '0.00'}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500">
                            Prix unitaire: €{typeof match.selectedProduct.price_eur === 'number' 
                              ? match.selectedProduct.price_eur.toFixed(2) 
                              : '0.00'}
                          </p>
                        </div>
                        
                        {/* Show compatibility warnings */}
                        {!match.compatible && (
                          <p className="text-yellow-600 text-xs sm:text-sm mt-1 sm:mt-2 flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-md">
                            ⚠️ Quantité différente
                          </p>
                        )}
                        
                        {/* Display substitution notes if available */}
                        {match.substitutionNotes && (
                          <p className="text-blue-600 text-xs sm:text-sm mt-1 sm:mt-2 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md">
                            ℹ️ {match.substitutionNotes}
                          </p>
                        )}
                        
                        {/* Display confidence indicator */}
                        {match.confidence && (
                          <div className="mt-1 sm:mt-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-grow h-1.5 bg-gray-200 rounded-full overflow-hidden">
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
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-600 rounded-lg sm:rounded-xl p-3 sm:p-4 text-xs sm:text-sm font-medium">
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