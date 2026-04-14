/**
 * Imagen Logo Renderer
 * SD: SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 *
 * Renders logo images from S11 logoSpec using Google Imagen 3 via Gemini API.
 * Returns a PNG buffer or null on failure (never throws).
 */

const IMAGEN_MODEL = 'imagen-3.0-generate-002';
const FALLBACK_MODEL = 'imagen-3.0-generate-001';

/**
 * Render a logo image from a logoSpec using Google Imagen 3.
 *
 * @param {Object} logoSpec - From S11 output: {textTreatment, primaryColor, accentColor, typography, iconConcept, svgPrompt}
 * @param {Object} [options]
 * @param {string} [options.ventureName] - Venture name for fallback prompt
 * @param {number} [options.maxRetries=2] - Max retry attempts
 * @param {Object} [options.logger=console]
 * @returns {Promise<{buffer: Buffer, mimeType: string}|null>} PNG image buffer or null
 */
export async function renderLogo(logoSpec, { ventureName = 'Venture', maxRetries = 2, logger = console } = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    logger.warn('[ImagenLogo] No GEMINI_API_KEY or GOOGLE_AI_API_KEY — skipping logo generation');
    return null;
  }

  if (!logoSpec || typeof logoSpec !== 'object') {
    logger.warn('[ImagenLogo] No logoSpec provided — skipping');
    return null;
  }

  const prompts = buildPromptVariants(logoSpec, ventureName);

  for (let attempt = 0; attempt < Math.min(prompts.length, maxRetries + 1); attempt++) {
    try {
      const result = await callImagenAPI(apiKey, prompts[attempt], logger);
      if (result) {
        logger.log('[ImagenLogo] Logo generated successfully', { attempt, model: IMAGEN_MODEL });
        return result;
      }
    } catch (err) {
      logger.warn(`[ImagenLogo] Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  logger.warn('[ImagenLogo] All attempts exhausted — no logo generated');
  return null;
}

/**
 * Build prompt variants from logoSpec (most specific → most generic).
 */
function buildPromptVariants(logoSpec, ventureName) {
  const name = logoSpec.textTreatment || ventureName;
  const primary = logoSpec.primaryColor || '#2563EB';
  const accent = logoSpec.accentColor || '#10B981';
  const font = logoSpec.typography || 'Inter';

  const prompts = [];

  // Attempt 1: Full prompt from svgPrompt
  if (logoSpec.svgPrompt) {
    prompts.push(sanitizePrompt(logoSpec.svgPrompt));
  }

  // Attempt 2: Structured prompt from individual fields
  prompts.push(sanitizePrompt(
    `Professional minimalist logo for "${name}". ` +
    `Colors: ${primary} primary, ${accent} accent. Font: ${font} bold. ` +
    (logoSpec.iconConcept ? `Icon: ${logoSpec.iconConcept}. ` : '') +
    'Clean vector style on white background. 512x512 pixels.'
  ));

  // Attempt 3: Simple text logo (safest for content policy)
  prompts.push(sanitizePrompt(
    `Simple text logo reading "${name}" in ${font} bold font, color ${primary}, on white background. Clean minimalist design. 512x512 pixels.`
  ));

  return prompts;
}

/**
 * Sanitize prompt to reduce content policy rejection risk.
 */
function sanitizePrompt(prompt) {
  return String(prompt)
    .replace(/[<>{}]/g, '')       // Remove angle brackets and braces
    .replace(/\s+/g, ' ')         // Collapse whitespace
    .substring(0, 1000)           // Cap length
    .trim();
}

/**
 * Call Google Imagen 3 API to generate an image.
 */
async function callImagenAPI(apiKey, prompt, logger) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateImages?key=${apiKey}`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1',
      personGeneration: 'DONT_ALLOW',
    },
  };

  logger.log('[ImagenLogo] Calling Imagen API', { promptLength: prompt.length });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    // Try fallback model on 404 (model not found)
    if (response.status === 404) {
      return callImagenFallback(apiKey, prompt, logger);
    }
    throw new Error(`Imagen API ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const predictions = data.predictions || data.generatedImages || [];
  if (predictions.length === 0) {
    logger.warn('[ImagenLogo] Imagen returned no predictions');
    return null;
  }

  const imageData = predictions[0].bytesBase64Encoded || predictions[0].image?.bytesBase64Encoded;
  if (!imageData) {
    logger.warn('[ImagenLogo] No image data in prediction');
    return null;
  }

  return {
    buffer: Buffer.from(imageData, 'base64'),
    mimeType: predictions[0].mimeType || 'image/png',
  };
}

/**
 * Fallback to older Imagen model if primary returns 404.
 */
async function callImagenFallback(apiKey, prompt, logger) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateImages?key=${apiKey}`;
  logger.log('[ImagenLogo] Trying fallback model', { model: FALLBACK_MODEL });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1', personGeneration: 'DONT_ALLOW' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const predictions = data.predictions || data.generatedImages || [];
  if (predictions.length === 0) return null;

  const imageData = predictions[0].bytesBase64Encoded || predictions[0].image?.bytesBase64Encoded;
  if (!imageData) return null;

  return {
    buffer: Buffer.from(imageData, 'base64'),
    mimeType: predictions[0].mimeType || 'image/png',
  };
}

export { buildPromptVariants, sanitizePrompt };
