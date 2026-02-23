#!/usr/bin/env node

/**
 * Multimodal AI Client for Vision-Based Testing
 * Supports Google Gemini, OpenAI GPT-5, Anthropic Claude, and local models
 */

const fs = require('fs').promises;
const axios = require('axios').default;
require('dotenv').config();

class MultimodalClient {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || process.env.AI_PROVIDER || 'google',
      model: config.model || process.env.AI_MODEL || 'gemini-3.1-pro-preview',
      apiKey: config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.OPENAI_API_KEY,
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || 1000,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    // Token-based pricing (per 1M tokens as of 2025)
    this.tokenPricing = {
      'gpt-5': { input: 2.50, output: 10.00 },  // GPT-5 flagship
      'gpt-5-mini': { input: 0.15, output: 0.60 },  // GPT-5 mini - cheap/fast
      'gpt-5-nano': { input: 0.05, output: 0.20 },  // GPT-5 nano - ultra-cheap
      'gpt-4.1': { input: 2.00, output: 8.00 },  // GPT-4.1 current gen
      'gpt-4o': { input: 2.50, output: 10.00 },  // GPT-4 Omni
      'gpt-4o-mini': { input: 0.15, output: 0.60 },  // GPT-4 Omni Mini
      'claude-sonnet-4': { input: 3.00, output: 15.00 },  // Claude Sonnet 4
      'claude-sonnet-3.7': { input: 3.00, output: 15.00 },  // Claude Sonnet 3.7
      'claude-opus-4': { input: 15.00, output: 75.00 },  // Claude Opus 4
      'claude-haiku-3': { input: 0.25, output: 1.25 },  // Claude Haiku 3
      'gemini-3.1-pro-preview': { input: 1.25, output: 10.00 },  // Gemini 3.1 Pro
      'gemini-3-flash-preview': { input: 0.10, output: 0.40 },  // Gemini 3 Flash
      'local': { input: 0, output: 0 }
    };

    // Image generation costs (for DALL-E/image generation, not vision analysis)
    this.imageGenerationCosts = {
      'dall-e-3': {
        '1024x1024': { standard: 0.040, hd: 0.080 },
        '1024x1792': { standard: 0.080, hd: 0.120 },
        '1792x1024': { standard: 0.080, hd: 0.120 }
      },
      'dall-e-2': {
        '256x256': 0.016,
        '512x512': 0.018,
        '1024x1024': 0.020
      }
    };

    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.apiKey && this.config.provider !== 'local') {
      throw new Error(`API key required for provider: ${this.config.provider}`);
    }
  }

  /**
   * Analyze a screenshot with vision capabilities
   */
  async analyzeScreenshot(screenshot, context) {
    const startTime = Date.now();
    
    try {
      // Convert screenshot to base64 if needed
      const imageData = await this.prepareImage(screenshot);
      
      // Build the prompt
      const prompt = this.buildPrompt(context);
      
      // Call appropriate provider
      let response;
      switch (this.config.provider) {
        case 'openai':
          response = await this.callOpenAI(imageData, prompt);
          break;
        case 'anthropic':
          response = await this.callAnthropic(imageData, prompt);
          break;
        case 'gemini':
        case 'google':
          response = await this.callGemini(imageData, prompt);
          break;
        case 'local':
          response = await this.callLocalModel(imageData, prompt);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
      
      // Parse and enhance response
      const analysis = this.parseResponse(response);
      
      // Add metadata
      analysis.duration = Date.now() - startTime;
      const costData = this.calculateCost(imageData, response);
      analysis.cost = costData.total;
      analysis.costBreakdown = costData.breakdown;
      analysis.provider = this.config.provider;
      analysis.model = this.config.model;
      
      return analysis;
      
    } catch (error) {
      console.error('Vision analysis failed:', error);
      
      // Retry logic
      if (this.config.retryAttempts > 0) {
        console.log(`Retrying... (${this.config.retryAttempts} attempts left)`);
        await this.sleep(this.config.retryDelay);
        this.config.retryAttempts--;
        return this.analyzeScreenshot(screenshot, context);
      }
      
      throw error;
    }
  }

  /**
   * Build analysis prompt
   */
  buildPrompt(context) {
    return `You are an expert QA engineer testing a web application.

Current Goal: ${context.goal}
Current URL: ${context.currentUrl}
Iteration: ${context.iteration}

Previous Actions (last 5):
${context.previousActions.map(a => `- ${a.description}`).join('\n')}

Analyze the screenshot and:
1. Describe what you see on the page
2. Identify any visual bugs (overlapping elements, broken layouts, missing images, etc.)
3. Determine the next action to achieve the goal
4. Provide your confidence level (0-1) in the suggested action
5. Note if the goal appears to be achieved

Respond in JSON format:
{
  "pageDescription": "Brief description of what's visible",
  "bugs": ["List of any visual bugs found"],
  "nextAction": {
    "type": "click|type|scroll|wait|navigate",
    "selector": "CSS selector or description",
    "value": "For type actions",
    "description": "Human-readable description"
  },
  "reasoning": "Why this action makes sense",
  "confidence": 0.95,
  "goalAchieved": false,
  "additionalObservations": "Any other relevant notes"
}`;
  }

  /**
   * Call OpenAI Vision API
   */
  async callOpenAI(imageData, prompt) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageData}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      }
    );
    
    return response.data.choices[0].message.content;
  }

  /**
   * Call Anthropic Claude Vision API
   */
  async callAnthropic(imageData, prompt) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageData
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      },
      {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      }
    );
    
    return response.data.content[0].text;
  }

  /**
   * Call Google Gemini Vision API
   */
  async callGemini(imageData, prompt) {
    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const model = this.config.model || 'gemini-3.1-pro-preview';
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageData
              }
            }
          ]
        }],
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens,
          responseMimeType: 'application/json'
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.timeout
      }
    );
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Call local vision model (placeholder for LLaVA, etc.)
   */
  async callLocalModel(_imageData, _prompt) {
    // This would integrate with local models like LLaVA, BLIP, etc.
    // For now, return a mock response
    console.log('Local model processing (mock)...');
    
    return JSON.stringify({
      pageDescription: 'Mock analysis from local model',
      bugs: [],
      nextAction: {
        type: 'click',
        selector: 'button',
        description: 'Click the first button'
      },
      reasoning: 'Local model analysis',
      confidence: 0.7,
      goalAchieved: false
    });
  }

  /**
   * Parse AI response
   */
  parseResponse(response) {
    try {
      // Handle both string and object responses
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      
      // Validate required fields
      if (!parsed.nextAction || !parsed.confidence) {
        throw new Error('Invalid response format');
      }
      
      // Ensure confidence is a number
      parsed.confidence = parseFloat(parsed.confidence);
      
      // Default values
      parsed.bugs = parsed.bugs || [];
      parsed.goalAchieved = parsed.goalAchieved || false;
      
      return parsed;
      
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      
      // Return safe default
      return {
        pageDescription: 'Failed to analyze',
        bugs: [],
        nextAction: {
          type: 'wait',
          description: 'Wait due to parsing error'
        },
        reasoning: 'Parse error - waiting',
        confidence: 0,
        goalAchieved: false,
        error: error.message
      };
    }
  }

  /**
   * Prepare image for API
   */
  async prepareImage(screenshot) {
    // If already base64
    if (typeof screenshot === 'string') {
      return screenshot;
    }
    
    // If buffer, convert to base64
    if (Buffer.isBuffer(screenshot)) {
      return screenshot.toString('base64');
    }
    
    // If file path, read and convert
    if (screenshot.startsWith('/') || screenshot.startsWith('./')) {
      const buffer = await fs.readFile(screenshot);
      return buffer.toString('base64');
    }
    
    throw new Error('Invalid screenshot format');
  }

  /**
   * Calculate image tokens based on resolution and detail
   * Following OpenAI's image token calculation
   */
  calculateImageTokens(imageData, detail = 'high') {
    // Base64 to approximate dimensions (rough estimation)
    const imageSizeBytes = Buffer.from(imageData, 'base64').length;
    
    if (detail === 'low') {
      // Low detail: fixed 85 tokens
      return 85;
    }
    
    // High detail calculation
    // Estimate dimensions from file size (very rough)
    const estimatedPixels = imageSizeBytes * 2; // Rough approximation
    const estimatedWidth = Math.sqrt(estimatedPixels);
    const estimatedHeight = estimatedWidth;
    
    // Calculate tiles (512x512 each)
    const tilesWide = Math.ceil(estimatedWidth / 512);
    const tilesHigh = Math.ceil(estimatedHeight / 512);
    const totalTiles = Math.min(tilesWide * tilesHigh, 16); // Max 16 tiles
    
    // Each tile costs 170 tokens, plus base 85
    return 85 + (totalTiles * 170);
  }

  /**
   * Calculate API cost using token-based pricing
   */
  calculateCost(imageData, response) {
    const model = this.config.model;
    const pricing = this.tokenPricing[model];
    
    if (!pricing) {
      console.warn(`No pricing data for model: ${model}`);
      return 0.01; // Default fallback
    }
    
    // Calculate input tokens
    const imageTokens = this.calculateImageTokens(imageData, this.config.imageDetail || 'high');
    const promptTokens = this.config.maxTokens || 1000; // Rough estimate
    const totalInputTokens = imageTokens + promptTokens;
    
    // Calculate output tokens (rough estimation from response length)
    const outputTokens = response.length / 4; // ~4 chars per token
    
    // Calculate costs (pricing is per 1M tokens)
    const inputCost = (totalInputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    
    return {
      total: inputCost + outputCost,
      breakdown: {
        inputTokens: totalInputTokens,
        outputTokens: outputTokens,
        inputCost: inputCost,
        outputCost: outputCost,
        imageTokens: imageTokens
      }
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available models for provider
   */
  getAvailableModels() {
    const models = {
      openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
      anthropic: ['claude-sonnet-4', 'claude-sonnet-3.7', 'claude-opus-4', 'claude-haiku-3'],
      google: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
      gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
      local: ['llava', 'blip', 'cogvlm']
    };
    
    return models[this.config.provider] || [];
  }

  /**
   * Estimate cost for a test run
   */
  estimateCost(expectedIterations, avgScreenshotSize = 100000) {
    const model = this.config.model;
    const pricing = this.tokenPricing[model];
    
    if (!pricing) {
      return {
        provider: this.config.provider,
        model: this.config.model,
        error: 'No pricing data available',
        withinBudget: false
      };
    }
    
    // Estimate tokens per iteration
    const imageTokens = this.calculateImageTokens(
      Buffer.alloc(avgScreenshotSize).toString('base64'),
      this.config.imageDetail || 'high'
    );
    const promptTokens = 500; // Average prompt size
    const responseTokens = 250; // Average response size
    
    // Calculate cost per iteration
    const inputCostPerIteration = ((imageTokens + promptTokens) / 1_000_000) * pricing.input;
    const outputCostPerIteration = (responseTokens / 1_000_000) * pricing.output;
    const costPerIteration = inputCostPerIteration + outputCostPerIteration;
    
    // Total estimated cost
    const estimatedTotal = costPerIteration * expectedIterations;
    
    return {
      provider: this.config.provider,
      model: this.config.model,
      costPerIteration,
      expectedIterations,
      estimatedTotal,
      costLimit: this.config.costLimit || 5.00,
      withinBudget: estimatedTotal <= (this.config.costLimit || 5.00),
      breakdown: {
        imageTokensPerIteration: imageTokens,
        totalTokensPerIteration: imageTokens + promptTokens + responseTokens,
        inputCostPerIteration,
        outputCostPerIteration
      }
    };
  }

  /**
   * Get recommended model based on use case
   */
  getRecommendedModel(useCase = 'default') {
    const recommendations = {
      'high-accuracy': 'gemini-3.1-pro-preview',  // Best accuracy, multimodal native
      'balanced': 'gemini-3-flash-preview',  // Good balance of cost and performance
      'low-cost': 'gemini-3-flash-preview',  // Cheapest option
      'complex-reasoning': 'claude-opus-4',  // Complex analysis
      'fast-screening': 'gemini-3-flash-preview',  // Quick checks
      'default': 'gemini-3.1-pro-preview'
    };
    
    return recommendations[useCase] || recommendations.default;
  }
}

module.exports = MultimodalClient;