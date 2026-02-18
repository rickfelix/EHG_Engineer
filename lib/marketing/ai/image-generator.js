/**
 * AI Image Generation Pipeline
 * SD-EVA-FEAT-MARKETING-AI-001 (US-003)
 *
 * Generates marketing images using Gemini generateContent API
 * (Nano Banana Pro / gemini-3-pro-image-preview) with Sharp.js
 * brand overlay compositing.
 * Falls back to branded placeholder on API failure.
 */

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 628;
const GENERATION_TIMEOUT_MS = 30_000;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

/**
 * Create an image generator instance.
 *
 * @param {object} deps
 * @param {object} [deps.geminiClient] - Gemini API client (for testing injection)
 * @param {object} [deps.sharp] - Sharp module (for testing injection)
 * @param {string} [deps.apiKey] - Gemini API key
 * @param {object} [deps.logger] - Logger
 * @returns {ImageGenerator}
 */
export function createImageGenerator(deps = {}) {
  const { logger = console, apiKey, geminiClient, sharp: sharpModule } = deps;

  return {
    /**
     * Generate a marketing image with brand overlays.
     *
     * @param {object} params
     * @param {string} params.prompt - Text prompt for image generation
     * @param {object} params.brand - Brand config
     * @param {string} [params.brand.logoPath] - Path to logo file
     * @param {string} [params.brand.primaryColor] - Hex color (e.g., '#FF6600')
     * @param {string} [params.brand.tagline] - Tagline text
     * @param {number} [params.width] - Image width (default 1200)
     * @param {number} [params.height] - Image height (default 628)
     * @returns {Promise<{buffer: Buffer, metadata: object}>}
     */
    async generate(params) {
      const { prompt, brand = {}, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = params;
      const startTime = Date.now();
      let buffer;
      let provider = 'gemini';

      try {
        buffer = await generateWithGemini({ prompt, width, height, apiKey, geminiClient });
      } catch (err) {
        logger.warn('Gemini image generation failed, using placeholder:', err.message);
        provider = 'placeholder';
        buffer = await generatePlaceholder({ width, height, brand, sharpModule });
      }

      // Apply brand overlays if we have Sharp and brand config
      if (provider === 'gemini' && (brand.logoPath || brand.primaryColor || brand.tagline)) {
        try {
          buffer = await applyBrandOverlay({ buffer, brand, width, height, sharpModule });
        } catch (err) {
          logger.warn('Brand overlay failed, using unbranded image:', err.message);
        }
      }

      const generationTimeMs = Date.now() - startTime;

      return {
        buffer,
        metadata: {
          generationPrompt: prompt,
          dimensionsPx: `${width}x${height}`,
          fileSizeBytes: buffer.length,
          providerName: provider,
          generationTimeMs,
          createdAt: new Date().toISOString()
        }
      };
    }
  };
}

/**
 * Generate base image via Gemini generateContent API (Nano Banana Pro).
 * Uses the same API pattern as scripts/lib/visualization-provider.js.
 */
async function generateWithGemini({ prompt, width, height, apiKey, geminiClient }) {
  if (geminiClient) {
    // Use injected client (testing)
    return geminiClient.generateImage({ prompt, width, height });
  }

  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${prompt} (${width}x${height})`
          }]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const candidates = data.candidates || [];
    if (candidates.length === 0) {
      throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0].content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) {
      throw new Error('No image data in Gemini response');
    }

    return Buffer.from(imagePart.inlineData.data, 'base64');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a branded placeholder image when Gemini is unavailable.
 */
async function generatePlaceholder({ width, height, brand, sharpModule }) {
  const sharp = sharpModule ?? (await import('sharp')).default;
  const bgColor = brand.primaryColor || '#2563EB';

  // Create a solid color image with the brand's primary color
  const svg = `<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${bgColor}" />
    <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white"
          text-anchor="middle" dominant-baseline="middle">
      ${brand.tagline || 'Marketing Image'}
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Apply brand overlays (logo, colors, tagline) to a generated image.
 */
async function applyBrandOverlay({ buffer, brand, width, height, sharpModule }) {
  const sharp = sharpModule ?? (await import('sharp')).default;
  const composites = [];

  // Add colored border
  if (brand.primaryColor) {
    const borderSvg = `<svg width="${width}" height="${height}">
      <rect x="0" y="${height - 6}" width="100%" height="6" fill="${brand.primaryColor}" />
    </svg>`;
    composites.push({
      input: Buffer.from(borderSvg),
      top: 0,
      left: 0
    });
  }

  // Add tagline
  if (brand.tagline) {
    const taglineSvg = `<svg width="${width}" height="40">
      <text x="20" y="28" font-family="Arial" font-size="18" fill="white"
            filter="url(#shadow)">
        <defs><filter id="shadow"><feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.5"/></filter></defs>
        ${brand.tagline}
      </text>
    </svg>`;
    composites.push({
      input: Buffer.from(taglineSvg),
      top: height - 50,
      left: 0
    });
  }

  // Add logo if path provided
  if (brand.logoPath) {
    try {
      const logoBuffer = await sharp(brand.logoPath)
        .resize(120, 40, { fit: 'inside' })
        .toBuffer();
      composites.push({
        input: logoBuffer,
        top: 10,
        left: width - 130
      });
    } catch {
      // Logo load failed, skip silently
    }
  }

  if (composites.length === 0) return buffer;

  return sharp(buffer).composite(composites).toBuffer();
}

export { DEFAULT_WIDTH, DEFAULT_HEIGHT, GENERATION_TIMEOUT_MS, GEMINI_IMAGE_MODEL };
