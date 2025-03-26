import express from 'express';
import cors from 'cors';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

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
    console.log('Received recipe parsing request:', req.body);
    const { recipe } = req.body;
    
    if (!recipe || typeof recipe !== 'string') {
      console.error('Invalid recipe format received:', recipe);
      return res.status(400).json({ 
        error: 'Recipe must be a non-empty string',
        details: { receivedType: typeof recipe }
      });
    }

    console.log('Sending request to Claude for recipe parsing');
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
      "unit": "g"
    }
  ],
  "servings": 4
}

Requirements:
- Ingredient names must be in French
- Ingredient names must be in singular (e.g., "pomme" not "pommes")
- Ingredient names should be simple and generic (e.g., "farine" not "farine multi-usage")
- Units should be standardized (g, ml, tsp, tbsp, piece)
- Amounts should be numbers only
- Servings should be a number
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

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Given this ingredient: "${ingredient}"
And these categories: ${JSON.stringify(categories)}
Select the most relevant categories that might contain this ingredient, in order of relevance.
Return only a JSON object with the format: {"categories": ["primary-category", "fallback-category1", "fallback-category2"]}
All categories must be from the provided list.
Limit to 3 most relevant categories.
Return only the JSON, no other text.`
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

// 3. Product selection endpoint
app.post('/api/select-product', async (req, res) => {
  try {
    const { ingredient, candidates } = req.body;
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Ingredient needed: ${JSON.stringify(ingredient)}
Available products: ${JSON.stringify(candidates)}
Select best match and return only JSON:
{
  "selectedProduct": <product-object>,
  "confidence": 0.95,
  "compatible": true
}`
      }]
    });
    
    const result = JSON.parse(message.content[0].text.trim());
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});