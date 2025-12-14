/**
 * Visualization Provider Abstraction
 *
 * Factory pattern for image generation providers.
 * Supports Gemini (primary) and OpenAI DALL-E (fallback).
 *
 * Part of: SD-VISION-BRIEF-VISUALIZATION-001
 * Related: generate-vision-visualization.js
 *
 * @module visualization-provider
 * @version 1.0.0
 */

import OpenAI from 'openai';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_IMAGE_MODEL = process.env.VISION_IMAGE_MODEL || 'dall-e-3';
const OPENAI_IMAGE_SIZE = process.env.VISION_IMAGE_SIZE || '1024x1024';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Base provider interface
 * @typedef {Object} ImageGenerationResult
 * @property {Buffer} imageBuffer - Raw image bytes
 * @property {string} mimeType - Image MIME type (e.g., 'image/png')
 * @property {string} provider - Provider name
 * @property {string} model - Model used
 */

// ============================================================================
// OPENAI PROVIDER (DALL-E)
// ============================================================================

class OpenAIProvider {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = OPENAI_IMAGE_MODEL;
  }

  get name() {
    return 'openai';
  }

  /**
   * Generate image using DALL-E
   * @param {string} prompt - Image generation prompt
   * @returns {Promise<ImageGenerationResult>}
   */
  async generateImage(prompt) {
    console.log(`   Generating image with OpenAI ${this.model}...`);

    const response = await this.openai.images.generate({
      model: this.model,
      prompt: prompt,
      n: 1,
      size: OPENAI_IMAGE_SIZE,
      response_format: 'b64_json'
    });

    const base64Data = response.data[0].b64_json;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    return {
      imageBuffer,
      mimeType: 'image/png',
      provider: 'openai',
      model: this.model
    };
  }
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

class GeminiProvider {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = GEMINI_IMAGE_MODEL;
  }

  get name() {
    return 'gemini';
  }

  /**
   * Generate image using Gemini
   * @param {string} prompt - Image generation prompt
   * @returns {Promise<ImageGenerationResult>}
   */
  async generateImage(prompt) {
    console.log(`   Generating image with Gemini ${this.model}...`);

    // Use fetch for Gemini API (avoids requiring @google/generative-ai package)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Extract image from response
    const candidates = data.candidates || [];
    if (candidates.length === 0) {
      throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0].content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      throw new Error('Gemini response contains no image data');
    }

    const base64Data = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    return {
      imageBuffer,
      mimeType,
      provider: 'gemini',
      model: this.model
    };
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * Get the appropriate visualization provider based on environment configuration
 *
 * Priority:
 * 1. GEMINI_API_KEY => Gemini provider
 * 2. OPENAI_API_KEY => OpenAI provider
 * 3. Neither => throw error
 *
 * @returns {{ provider: OpenAIProvider | GeminiProvider, name: string }}
 */
export function getVisualizationProvider() {
  // Priority 1: Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const provider = new GeminiProvider();
      console.log('   Provider: Gemini (GEMINI_API_KEY configured)');
      return provider;
    } catch (error) {
      console.warn(`   Gemini initialization failed: ${error.message}`);
      // Fall through to OpenAI
    }
  }

  // Priority 2: OpenAI
  if (process.env.OPENAI_API_KEY) {
    const provider = new OpenAIProvider();
    console.log('   Provider: OpenAI DALL-E (OPENAI_API_KEY configured)');
    return provider;
  }

  // No provider available
  throw new Error(
    'No visualization provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in environment.'
  );
}

/**
 * Check if any visualization provider is available
 * @returns {boolean}
 */
export function isVisualizationAvailable() {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Get provider name without initializing
 * @returns {string}
 */
export function getProviderName() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

export default getVisualizationProvider;
