import express from 'express';
import cors from 'cors';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Products data cache
let productsCache = null;

// Set up enhanced logging
const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Logger helper
const logger = {
  debug: (message, data = null) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      message,
      data
    };
    console.log(`DEBUG: ${message}`);
    logToFile('debug', logEntry);
  },
  
  info: (message, data = null) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      data
    };
    console.log(`INFO: ${message}`);
    logToFile('info', logEntry);
  },
  
  error: (message, err = null) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: err ? (err.stack || err.message || err) : null
    };
    console.error(`ERROR: ${message}`, err || '');
    logToFile('error', logEntry);
  },
  
  match: (ingredient, candidates, result) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ingredient,
      candidateCount: candidates.length,
      selectedProduct: result.selectedProduct,
      confidence: result.confidence,
      compatible: result.compatible,
      substitutionNotes: result.substitutionNotes
    };
    logToFile('matches', logEntry);
  }
};

function logToFile(type, data) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `${type}_${today}.log`);
    fs.appendFileSync(logFile, JSON.stringify(data) + '\n');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

const app = express();
// Configure CORS with explicit options
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 1. Enhanced Parse recipe endpoint
app.post('/api/parse-recipe', async (req, res) => {
  try {
    logger.info('Received recipe parsing request');
    const { recipe } = req.body;
    
    if (!recipe || typeof recipe !== 'string') {
      logger.error('Invalid recipe format received', { recipe, type: typeof recipe });
      return res.status(400).json({ 
        error: 'Recipe must be a non-empty string',
        details: { receivedType: typeof recipe }
      });
    }

    logger.info('Sending request to Claude for recipe parsing', { recipeLength: recipe.length });
    const parseMessage = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Parse this recipe into a structured ingredients list. Only provide the JSON output, no other text.
Recipe: "${recipe}"

Expected format:
{
  "ingredients": [
    {
      "name": "flour",
      "amount": 200,
      "unit": "g",
      "possibleAlternatives": ["farine complète", "farine de blé"],
      "isCritical": true
    }
  ],
  "recipeType": "dessert",
  "cuisineOrigin": "french",
  "servings": 4,
  "title": "Tarte aux pommes"
}

Requirements:
- Ingredient names must be in French
- Ingredient names must be in singular form (e.g., "pomme" not "pommes")
- Ingredient names should be simple and generic (e.g., "farine" not "farine multi-usage")
- Units should be standardized (g, ml, l, cl, tsp, tbsp, piece)
- Amounts should be numbers only
- Servings should be a number
- possibleAlternatives should list 1-3 common substitutes for the ingredient
- isCritical should be true for essential ingredients and false for optional ones
- recipeType should be a category like "dessert", "main dish", "soup", etc.
- cuisineOrigin should indicate the style of cuisine if determinable
- title should be the recipe name if included, or a generated appropriate title
- Return valid JSON only, no explanatory text`
      }]
    });

    console.log('Received response from Claude:', parseMessage.content[0].text);

    let recipeData;
    try {
      recipeData = JSON.parse(parseMessage.content[0].text.trim());
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Raw response:', parseMessage.content[0].text);
      return res.status(500).json({ 
        error: 'Failed to parse LLM response as JSON',
        details: parseMessage.content[0].text
      });
    }

    // Validate the parsed data structure
    if (!recipeData.ingredients || !Array.isArray(recipeData.ingredients)) {
      console.error('Invalid data structure:', recipeData);
      return res.status(500).json({ 
        error: 'Invalid recipe data structure',
        details: recipeData
      });
    }

    // Validate each ingredient
    for (const ingredient of recipeData.ingredients) {
      if (!ingredient.name || !ingredient.amount || !ingredient.unit) {
        console.error('Invalid ingredient format:', ingredient);
        return res.status(500).json({ 
          error: 'Invalid ingredient format',
          details: ingredient
        });
      }
    }

    console.log('Successfully parsed recipe:', recipeData);
    res.json(recipeData);
    
  } catch (error) {
    console.error('Server error in recipe parsing:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

// 2. Enhanced Category suggestion endpoint
// Common food category knowledge base
const INGREDIENT_CATEGORIES = {
  // Baking ingredients
  "farine": ["Épicerie Sucrée", "Farine, Sucre, Aides Pâtissières"],
  "sucre": ["Épicerie Sucrée", "Farine, Sucre, Aides Pâtissières"],
  "levure": ["Épicerie Sucrée", "Farine, Sucre, Aides Pâtissières"],
  
  // Dairy products
  "lait": ["Produits Laitiers", "Lait, Œufs, Beurre"],
  "beurre": ["Produits Laitiers", "Lait, Œufs, Beurre"],
  "crème": ["Produits Laitiers", "Lait, Œufs, Beurre"],
  "fromage": ["Produits Laitiers", "Fromage"],
  "yaourt": ["Produits Laitiers"],
  
  // Proteins
  "viande": ["Boucherie", "Viandes"],
  "poulet": ["Boucherie", "Volaille"],
  "boeuf": ["Boucherie", "Viandes"],
  "porc": ["Boucherie", "Viandes"],
  "poisson": ["Poissonnerie", "Poissons et Fruits de Mer"],
  
  // Fruits & Vegetables
  "pomme": ["Fruits et Légumes", "Fruits"],
  "orange": ["Fruits et Légumes", "Fruits"],
  "banane": ["Fruits et Légumes", "Fruits"],
  "tomate": ["Fruits et Légumes", "Légumes"],
  "carotte": ["Fruits et Légumes", "Légumes"],
  "salade": ["Fruits et Légumes", "Légumes"]
};

app.post('/api/suggest-category', async (req, res) => {
  try {
    console.log('Received category suggestion request:', req.body);
    const { ingredient, categories } = req.body;
    if (!ingredient || !categories || !Array.isArray(categories)) {
      console.error('Invalid request format:', { ingredient, categories });
      return res.status(400).json({
        error: 'Invalid request format',
        details: { ingredient, categoriesType: typeof categories }
      });
    }
    
    // Check if we have this ingredient in our knowledge base
    const ingredientLower = ingredient.toLowerCase();
    const knownCategories = Object.keys(INGREDIENT_CATEGORIES).find(key => 
      ingredientLower.includes(key)
    );
    
    // If we have this in our knowledge base, filter the categories to match
    if (knownCategories) {
      const preferredCategories = INGREDIENT_CATEGORIES[knownCategories];
      // Find matches in the provided categories list
      const matchedCategories = categories.filter(cat => 
        preferredCategories.some(preferred => 
          cat.toLowerCase().includes(preferred.toLowerCase())
        )
      );
      
      // If we found matches, return them
      if (matchedCategories.length > 0) {
        // Add other categories as fallbacks up to 3 total
        const result = {
          categories: [
            ...matchedCategories,
            ...categories.filter(cat => !matchedCategories.includes(cat))
          ].slice(0, 3)
        };
        return res.json(result);
      }
    }

    // Fall back to LLM if knowledge base doesn't have a match or no matches in provided categories
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `# Task: Categorize a Recipe Ingredient

## Ingredient to Categorize
"${ingredient}"

## Available Categories
${JSON.stringify(categories)}

## Instructions
- Analyze the ingredient and determine which supermarket department(s) would stock it
- Select the most relevant categories from the provided list
- Return categories in order of relevance (most likely first)
- Only include categories from the provided list
- Consider both general and specific categories (e.g., "Dairy" and "Cheese")

## Output Format
Return only a JSON object with the format: 
{"categories": ["primary-category", "fallback-category1", "fallback-category2"]}

- Limit to 3 most relevant categories maximum
- For specialized ingredients, include both specific and general categories
- Return only the JSON, no other text.`
      }]
    });

    const result = JSON.parse(message.content[0].text.trim());
    console.log(result);
    res.json(result);

  } catch (error) {
    console.error('Error in category suggestion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function for ingredient-product matching
function preFilterCandidates(ingredient, candidates) {
  // Early return if no candidates
  if (!candidates || candidates.length === 0) {
    return [];
  }

  // Convert everything to lowercase for better matching
  const ingredientName = ingredient.name.toLowerCase();
  const ingredientTokens = ingredientName.split(/\s+/).filter(token => token.length > 2);
  
  // First pass: direct name matches (highest relevance)
  const exactMatches = candidates.filter(product => 
    product.name?.toLowerCase().includes(ingredientName)
  );
  
  if (exactMatches.length >= 5) {
    return exactMatches.slice(0, 10); // Return top 10 exact matches if we have enough
  }
  
  // Second pass: token-based matching (match any word in the ingredient name)
  const tokenMatches = candidates.filter(product => {
    if (!product.name) return false;
    const productNameLower = product.name.toLowerCase();
    return ingredientTokens.some(token => productNameLower.includes(token));
  });
  
  // Try alternatives if defined
  let alternativeMatches = [];
  if (ingredient.possibleAlternatives && Array.isArray(ingredient.possibleAlternatives) && 
      ingredient.possibleAlternatives.length > 0) {
    
    for (const alternative of ingredient.possibleAlternatives) {
      const altLower = alternative.toLowerCase();
      const altMatches = candidates.filter(product => 
        product.name?.toLowerCase().includes(altLower)
      );
      alternativeMatches = [...alternativeMatches, ...altMatches];
      if (alternativeMatches.length >= 5) break;
    }
  }
  
  // Combine matches, remove duplicates, and limit to 10
  const combinedMatches = [...new Set([...exactMatches, ...tokenMatches, ...alternativeMatches])];
  
  // If we still don't have enough, add some from the original category
  if (combinedMatches.length < 5 && candidates.length > 0) {
    return [...combinedMatches, ...candidates.filter(p => !combinedMatches.includes(p))].slice(0, 10);
  }
  
  return combinedMatches.slice(0, 10);
}

// Helper to determine if a product quantity is compatible with recipe needs
function isQuantityCompatible(ingredient, product) {
  // Skip if no size information
  if (!product.size_value) return true;
  
  const ingredientUnit = ingredient.unit.toLowerCase();
  const productSize = product.size_value.toLowerCase();
  
  // Unit conversion helpers
  const unitMultipliers = {
    'kg': 1000, 'g': 1, 'mg': 0.001,
    'l': 1000, 'ml': 1, 'cl': 10,
    'piece': 1, 'pièce': 1, 'pieces': 1, 'pièces': 1
  };
  
  // Try to extract numbers and units from product size
  const productMatch = productSize.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl|piece|pièce|pieces|pièces)/i);
  if (!productMatch) return true; // Can't determine compatibility
  
  const productValue = parseFloat(productMatch[1]);
  const productUnit = productMatch[2].toLowerCase();
  
  // Check if units are comparable
  const isWeightToWeight = 
    ['kg', 'g', 'mg'].includes(ingredientUnit) && 
    ['kg', 'g', 'mg'].includes(productUnit);
    
  const isVolumeToVolume = 
    ['l', 'ml', 'cl'].includes(ingredientUnit) && 
    ['l', 'ml', 'cl'].includes(productUnit);
    
  const isPieceToPiece = 
    ['piece', 'pièce', 'pieces', 'pièces'].includes(ingredientUnit) && 
    ['piece', 'pièce', 'pieces', 'pièces'].includes(productUnit);
  
  if (!isWeightToWeight && !isVolumeToVolume && !isPieceToPiece) {
    return true; // Different unit types, can't compare
  }
  
  // Normalize to base units
  const ingredientValueNormalized = ingredient.amount * (unitMultipliers[ingredientUnit] || 1);
  const productValueNormalized = productValue * (unitMultipliers[productUnit] || 1);
  
  // For weight and volume, too large is worse than too small
  if (isWeightToWeight || isVolumeToVolume) {
    const ratio = productValueNormalized / ingredientValueNormalized;
    return ratio <= 3 && ratio >= 0.5; // Product should be within 50%-300% of needed amount
  }
  
  // For pieces, exact match is best
  if (isPieceToPiece) {
    return productValueNormalized >= ingredient.amount;
  }
  
  return true;
}

// 3. Enhanced Product selection endpoint
app.post('/api/select-product', async (req, res) => {
  try {
    const { ingredient, candidates } = req.body;
    
    logger.info('Processing product selection request', { 
      ingredient: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      candidateCount: candidates.length 
    });
    
    // Step 1: Pre-filter candidates to reduce tokens and improve matching
    const filteredCandidates = preFilterCandidates(ingredient, candidates);
    logger.debug('Pre-filtered candidates', { 
      originalCount: candidates.length,
      filteredCount: filteredCandidates.length 
    });
    
    // Step 2: Do quick compatibility check
    const compatibilityInfo = filteredCandidates.map(product => ({
      productId: product.productId,
      compatible: isQuantityCompatible(ingredient, product)
    }));
    
    const compatibleCount = compatibilityInfo.filter(info => info.compatible).length;
    logger.debug('Compatibility check results', { 
      totalProducts: compatibilityInfo.length,
      compatibleProducts: compatibleCount
    });
    
    // Step 3: Enhanced prompt with more context and examples
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `
# Task: Select the best product match for a recipe ingredient

## Ingredient Information
- Name: "${ingredient.name}"
- Amount: ${ingredient.amount} ${ingredient.unit}

## Available Products (${filteredCandidates.length})
${JSON.stringify(filteredCandidates)}

## Compatibility Information
${JSON.stringify(compatibilityInfo)}

## Selection Criteria (in order of importance)
1. Exact ingredient name match - The product should specifically be the requested ingredient
2. Appropriate size/amount - The product should be close to the required quantity
3. Generic over branded - Prefer basic/generic versions over specialty products unless the recipe clearly needs the specialty version
4. Reasonable price - If multiple good matches exist, prefer more economical options

## Output Format
Return a JSON object with:
1. selectedProduct: The best matching product object
2. confidence: A score between 0-1 indicating match quality
3. compatible: Boolean indicating if the product size is appropriate for the recipe amount
4. substitutionNotes: Short string explaining any compromises if not a perfect match (or null if perfect match)

Only return the JSON, no additional text.`
      }]
    });
    
    const result = JSON.parse(message.content[0].text.trim());
    
    // Log the match for analysis
    logger.match(ingredient, filteredCandidates, result);
    
    // Add timestamp for tracking performance
    const enhancedResult = {
      ...result,
      timestamp: new Date().toISOString()
    };
    
    res.json(enhancedResult);
  } catch (error) {
    logger.error('Error in enhanced product selection', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch endpoint for parallel ingredient processing
app.post('/api/batch-analyze-ingredients', async (req, res) => {
  try {
    const { ingredients, categories, limit = 5 } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Invalid ingredients array' });
    }
    
    logger.info(`Processing batch of ${ingredients.length} ingredients`);
    
    // Process all ingredients in parallel
    const results = await Promise.all(ingredients.map(async (ingredient) => {
      try {
        // 1. Get categories for this ingredient
        let ingredientCategories;
        
        // Check if we have this ingredient in our knowledge base
        const ingredientLower = ingredient.name.toLowerCase();
        const knownCategory = Object.keys(INGREDIENT_CATEGORIES).find(key => 
          ingredientLower.includes(key)
        );
        
        if (knownCategory) {
          const preferredCategories = INGREDIENT_CATEGORIES[knownCategory];
          const matchedCategories = categories.filter(cat => 
            preferredCategories.some(preferred => 
              cat.toLowerCase().includes(preferred.toLowerCase())
            )
          );
          
          if (matchedCategories.length > 0) {
            ingredientCategories = {
              categories: [
                ...matchedCategories,
                ...categories.filter(cat => !matchedCategories.includes(cat))
              ].slice(0, 3)
            };
          }
        }
        
        // If not in knowledge base, query the LLM
        if (!ingredientCategories) {
          const categoryMessage = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            temperature: 0,
            messages: [{
              role: "user",
              content: `# Task: Categorize Ingredient
              
              ## Ingredient: "${ingredient.name}"
              ## Categories: ${JSON.stringify(categories)}
              
              Select the most relevant categories from the provided list that might contain this ingredient.
              Return only a JSON object with the format: {"categories": ["category1", "category2", "category3"]}
              Limit to 3 most relevant categories.
              Return only the JSON, no other text.`
            }]
          });
          
          ingredientCategories = JSON.parse(categoryMessage.content[0].text.trim());
        }
        
        return {
          ingredient,
          categories: ingredientCategories.categories,
          status: 'success'
        };
      } catch (error) {
        logger.error(`Error processing ingredient ${ingredient.name}`, error);
        return {
          ingredient,
          status: 'error',
          error: error.message
        };
      }
    }));
    
    logger.info(`Successfully processed ${results.filter(r => r.status === 'success').length}/${ingredients.length} ingredients`);
    res.json({ results });
    
  } catch (error) {
    logger.error('Error in batch ingredient processing', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to ensure consistent number formats in product data
function sanitizeProductData(product) {
  if (!product) return product;
  
  // Create a copy to avoid modifying the original
  const sanitized = {...product};
  
  // Ensure price fields are numbers
  if (sanitized.price_eur && typeof sanitized.price_eur !== 'number') {
    const parsed = parseFloat(sanitized.price_eur);
    sanitized.price_eur = isNaN(parsed) ? null : parsed;
  }
  
  if (sanitized.price_per_kg_eur && typeof sanitized.price_per_kg_eur !== 'number') {
    const parsed = parseFloat(sanitized.price_per_kg_eur);
    sanitized.price_per_kg_eur = isNaN(parsed) ? null : parsed;
  }
  
  // Ensure size_value is properly processed
  if (sanitized.size_value && typeof sanitized.size_value === 'string') {
    const sizeMatch = sanitized.size_value.match(/^([\d.]+)/);
    if (sizeMatch) {
      const numericPart = parseFloat(sizeMatch[1]);
      if (!isNaN(numericPart)) {
        sanitized.size_value_numeric = numericPart;
      }
    }
  }
  
  return sanitized;
}

// Parallel product matching endpoint
app.post('/api/parallel-match-products', async (req, res) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Invalid ingredients array' });
    }
    
    logger.info(`Starting parallel product matching for ${ingredients.length} ingredients`);
    
    // Use the products from the server cache (will be populated from first request)
    const allProducts = productsCache || req.app.locals.products;
    
    if (!allProducts || allProducts.length === 0) {
      return res.status(500).json({ error: 'Product data not available on server' });
    }
    
    // Match products for all ingredients in parallel
    const matches = await Promise.all(ingredients.map(async (ingredientData) => {
      try {
        const { ingredient, categories } = ingredientData;
        
        // Find candidate products from each category
        let candidateProducts = [];
        let usedCategory = null;
        
        for (const category of categories) {
          // Filter products by this category
          const categoryProducts = allProducts.filter(p => p.main_category === category);
          
          // Apply pre-filtering to find good matches
          const filteredProducts = preFilterCandidates(ingredient, categoryProducts);
          
          if (filteredProducts.length > 0) {
            candidateProducts = filteredProducts;
            usedCategory = category;
            break;
          }
        }
        
        // If no candidates found, try a broader search
        if (candidateProducts.length === 0) {
          candidateProducts = preFilterCandidates(ingredient, allProducts).slice(0, 10);
        }
        
        // Check compatibility
        const compatibilityInfo = candidateProducts.map(product => ({
          productId: product.productId,
          compatible: isQuantityCompatible(ingredient, product)
        }));
        
        // Get best match using LLM
        // Sanitize candidate products to ensure consistent number formats
        const sanitizedCandidates = candidateProducts.map(sanitizeProductData);

        const message = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          temperature: 0,
          messages: [{
            role: "user",
            content: `
# Task: Select best product match
            
## Ingredient: ${JSON.stringify(ingredient)}
## Candidates: ${JSON.stringify(sanitizedCandidates)}
## Compatibility: ${JSON.stringify(compatibilityInfo)}

Select the best matching product. Consider name match, size, and price.
Return only a JSON object with:
{
  "selectedProduct": <product-object>,
  "confidence": <0.0-1.0>,
  "compatible": <boolean>,
  "substitutionNotes": <string-or-null>
}
Return only the JSON, no other text.`
          }]
        });
        
        let result = JSON.parse(message.content[0].text.trim());
        
        // Ensure numeric types in the result
        if (result.selectedProduct) {
          result.selectedProduct = sanitizeProductData(result.selectedProduct);
        }
        
        // Ensure confidence is a numeric value
        if (typeof result.confidence !== 'number') {
          result.confidence = parseFloat(result.confidence) || 0.5;
        }
        
        // Log the match for analysis
        logger.match(ingredient, candidateProducts, result);
        
        return {
          ingredient,
          category: usedCategory || categories[0],
          ...result,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error matching product for ${ingredientData.ingredient.name}`, error);
        return {
          ingredient: ingredientData.ingredient,
          error: error.message,
          status: 'error',
          timestamp: new Date().toISOString()
        };
      }
    }));
    
    const successCount = matches.filter(m => !m.error).length;
    logger.info(`Successfully matched ${successCount}/${ingredients.length} ingredients with products`);
    
    res.json({ matches });
    
  } catch (error) {
    logger.error('Error in parallel product matching', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to fetch all products (used by client to get complete list)
app.get('/api/products', async (req, res) => {
  try {
    // If products are already cached in memory, send them
    if (req.app.locals.products && req.app.locals.products.length > 0) {
      return res.json({ products: req.app.locals.products });
    }
    
    // Load products from CSV file
    const csvPath = path.join(process.cwd(), 'public', 'products_v2_curated_deduplicated_change_cat_names.csv');
    const csvData = fs.readFileSync(csvPath, 'utf8');
    
    // Parse CSV data
    const products = [];
    const rows = csvData.split('\n');
    const headers = rows[0].split(',');
    
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      
      const values = rows[i].split(',');
      const product = {};
      
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j].trim();
        let value = values[j] ? values[j].trim() : null;
        
        // Convert numeric values
        if (key === 'price_eur' || key === 'price_per_kg_eur' || key === 'size_value') {
          if (value && !isNaN(parseFloat(value))) {
            value = parseFloat(value);
          }
        }
        
        // Convert boolean values
        if (value === 'True') value = true;
        if (value === 'False') value = false;
        
        product[key] = value;
      }
      
      products.push(product);
    }
    
    // Cache the products for future requests
    req.app.locals.products = products;
    productsCache = products;
    
    logger.info(`Loaded ${products.length} products from CSV`);
    res.json({ products });
    
  } catch (error) {
    logger.error('Error loading products', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});