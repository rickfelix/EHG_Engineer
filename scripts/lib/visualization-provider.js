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
 * @version 1.1.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// Gemini: Default to Nano Banana Pro (Gemini 3 Pro Image)
const GEMINI_IMAGE_MODEL = process.env.VISION_VISUALIZATION_MODEL || 'gemini-3-pro-image-preview';

// OpenAI: DALL-E 3 as fallback
const OPENAI_IMAGE_MODEL = process.env.VISION_IMAGE_MODEL || 'dall-e-3';
const OPENAI_IMAGE_SIZE = process.env.VISION_IMAGE_SIZE || '1024x1024';

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
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = OPENAI_IMAGE_MODEL;
  }

  get name() {
    return 'openai';
  }

  /**
   * Generate image using DALL-E (via fetch — no SDK dependency)
   * @param {string} prompt - Image generation prompt
   * @returns {Promise<ImageGenerationResult>}
   */
  async generateImage(prompt) {
    console.log(`   Generating image with OpenAI ${this.model}...`);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: OPENAI_IMAGE_SIZE,
        response_format: 'b64_json'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Images API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const base64Data = data.data[0].b64_json;
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
 * Provider selection modes
 * @readonly
 * @enum {string}
 */
export const ProviderMode = {
  AUTO: 'auto',      // Gemini first, fallback to OpenAI
  GEMINI: 'gemini',  // Gemini only, fail if unavailable
  OPENAI: 'openai'   // OpenAI only, fail if unavailable
};

/**
 * Get the appropriate visualization provider based on mode and environment
 *
 * @param {string} mode - Provider mode: 'auto' | 'gemini' | 'openai'
 * @returns {{ provider: OpenAIProvider | GeminiProvider, reason: string }}
 */
export function getVisualizationProvider(mode = ProviderMode.AUTO) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  // Log available providers
  console.log(`   Available providers: ${[hasGemini ? 'gemini' : null, hasOpenAI ? 'openai' : null].filter(Boolean).join(', ') || 'none'}`);

  // Explicit provider selection
  if (mode === ProviderMode.GEMINI) {
    if (!hasGemini) {
      throw new Error('Gemini requested but GEMINI_API_KEY not configured');
    }
    const provider = new GeminiProvider();
    const reason = 'explicit --provider gemini';
    console.log(`   Selected: ${provider.name} (${reason})`);
    console.log(`   Model: ${provider.model}`);
    return { provider, reason };
  }

  if (mode === ProviderMode.OPENAI) {
    if (!hasOpenAI) {
      throw new Error('OpenAI requested but OPENAI_API_KEY not configured');
    }
    const provider = new OpenAIProvider();
    const reason = 'explicit --provider openai';
    console.log(`   Selected: ${provider.name} (${reason})`);
    console.log(`   Model: ${provider.model}`);
    return { provider, reason };
  }

  // Auto mode: Gemini first, OpenAI fallback
  if (hasGemini) {
    try {
      const provider = new GeminiProvider();
      const reason = 'auto: GEMINI_API_KEY configured (primary)';
      console.log(`   Selected: ${provider.name} (${reason})`);
      console.log(`   Model: ${provider.model}`);
      return { provider, reason };
    } catch (error) {
      console.warn(`   Gemini init failed: ${error.message}`);
      if (!hasOpenAI) {
        throw new Error(`Gemini failed and no OpenAI fallback: ${error.message}`);
      }
      console.log('   Falling back to OpenAI...');
    }
  }

  if (hasOpenAI) {
    const provider = new OpenAIProvider();
    const reason = hasGemini
      ? 'auto: fallback after Gemini failure'
      : 'auto: only OPENAI_API_KEY configured';
    console.log(`   Selected: ${provider.name} (${reason})`);
    console.log(`   Model: ${provider.model}`);
    return { provider, reason };
  }

  throw new Error(
    'No visualization provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in environment.'
  );
}

/**
 * Generate image with automatic fallback (for auto mode)
 *
 * @param {string} prompt - Image generation prompt
 * @param {string} mode - Provider mode
 * @returns {Promise<ImageGenerationResult & { reason: string }>}
 */
export async function generateWithFallback(prompt, mode = ProviderMode.AUTO) {
  const { provider, reason } = getVisualizationProvider(mode);

  // For explicit modes, no fallback
  if (mode !== ProviderMode.AUTO) {
    const result = await provider.generateImage(prompt);
    return { ...result, reason };
  }

  // Auto mode: try primary, fallback on failure
  try {
    const result = await provider.generateImage(prompt);
    return { ...result, reason };
  } catch (primaryError) {
    console.warn(`   Primary provider (${provider.name}) failed: ${primaryError.message}`);

    // Check if fallback is available
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    if (provider.name === 'gemini' && hasOpenAI) {
      console.log('   Attempting OpenAI fallback...');
      try {
        const fallbackProvider = new OpenAIProvider();
        const result = await fallbackProvider.generateImage(prompt);
        return {
          ...result,
          reason: `auto: fallback to openai after gemini error (${primaryError.message.substring(0, 50)})`
        };
      } catch (fallbackError) {
        throw new Error(`Both providers failed. Gemini: ${primaryError.message}. OpenAI: ${fallbackError.message}`);
      }
    }

    throw primaryError;
  }
}

/**
 * Check if any visualization provider is available
 * @returns {boolean}
 */
export function isVisualizationAvailable() {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Get provider info without initializing (for preview/dry-run)
 * @param {string} mode - Provider mode
 * @returns {{ name: string, model: string, reason: string }}
 */
export function getProviderInfo(mode = ProviderMode.AUTO) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (mode === ProviderMode.GEMINI) {
    return {
      name: 'gemini',
      model: GEMINI_IMAGE_MODEL,
      reason: 'explicit --provider gemini',
      available: hasGemini
    };
  }

  if (mode === ProviderMode.OPENAI) {
    return {
      name: 'openai',
      model: OPENAI_IMAGE_MODEL,
      reason: 'explicit --provider openai',
      available: hasOpenAI
    };
  }

  // Auto mode
  if (hasGemini) {
    return {
      name: 'gemini',
      model: GEMINI_IMAGE_MODEL,
      reason: 'auto: GEMINI_API_KEY configured (primary)',
      available: true
    };
  }

  if (hasOpenAI) {
    return {
      name: 'openai',
      model: OPENAI_IMAGE_MODEL,
      reason: 'auto: only OPENAI_API_KEY configured',
      available: true
    };
  }

  return {
    name: 'none',
    model: 'n/a',
    reason: 'no API keys configured',
    available: false
  };
}

export default getVisualizationProvider;
