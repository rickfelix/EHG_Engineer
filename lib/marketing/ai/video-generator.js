/**
 * Image-to-Video (I2V) Generation Pipeline
 * SD-EVA-FEAT-MARKETING-AI-001 (US-004)
 *
 * Converts marketing images to 5-15 second video clips
 * using a cascading provider chain: Kling → Veo → Runway.
 * Includes cost tracking per provider.
 */

const DEFAULT_DURATION_SECONDS = 10;
const PROVIDER_TIMEOUT_MS = 60_000;

const PROVIDERS = [
  { name: 'kling', priority: 1 },
  { name: 'veo', priority: 2 },
  { name: 'runway', priority: 3 }
];

/**
 * Create a video generator instance.
 *
 * @param {object} deps
 * @param {object} [deps.providerClients] - Map of provider name → client (for testing)
 * @param {object} [deps.logger] - Logger
 * @returns {VideoGenerator}
 */
export function createVideoGenerator(deps = {}) {
  const { providerClients = {}, logger = console } = deps;

  return {
    /**
     * Generate a video from an image using the I2V provider chain.
     *
     * @param {object} params
     * @param {Buffer} params.imageBuffer - Source image
     * @param {string} params.imageId - Asset registry ID of source image
     * @param {number} [params.durationSeconds] - Target duration (5-15s)
     * @param {string} [params.style] - Video style hint (e.g., 'zoom-in', 'pan-right')
     * @returns {Promise<{success: boolean, videoBuffer?: Buffer, metadata?: object, errors?: Array}>}
     */
    async generate(params) {
      const {
        imageBuffer,
        imageId,
        durationSeconds = DEFAULT_DURATION_SECONDS,
        style
      } = params;

      const clampedDuration = Math.max(5, Math.min(15, durationSeconds));
      const errors = [];

      for (const provider of PROVIDERS) {
        const client = providerClients[provider.name];
        if (!client) {
          errors.push({
            provider: provider.name,
            error: 'No client configured',
            timestamp: new Date().toISOString()
          });
          continue;
        }

        const startTime = Date.now();
        try {
          const result = await generateWithProvider(client, {
            imageBuffer,
            durationSeconds: clampedDuration,
            style
          });

          const generationTimeMs = Date.now() - startTime;

          return {
            success: true,
            videoBuffer: result.buffer,
            metadata: {
              sourceImageId: imageId,
              providerName: provider.name,
              durationSeconds: clampedDuration,
              generationTimeMs,
              creditUsage: result.creditUsage ?? null,
              estimatedCostUsd: result.estimatedCostUsd ?? null,
              format: 'mp4',
              createdAt: new Date().toISOString()
            }
          };
        } catch (err) {
          const generationTimeMs = Date.now() - startTime;
          logger.warn(`I2V provider ${provider.name} failed (${generationTimeMs}ms):`, err.message);
          errors.push({
            provider: provider.name,
            error: err.message,
            durationMs: generationTimeMs,
            timestamp: new Date().toISOString()
          });
        }
      }

      // All providers failed
      logger.error('All I2V providers failed', { errors });
      return {
        success: false,
        errors
      };
    },

    /**
     * Get the provider chain configuration.
     * @returns {Array<{name: string, priority: number}>}
     */
    getProviders() {
      return [...PROVIDERS];
    }
  };
}

/**
 * Generate video with a single provider, with timeout.
 */
async function generateWithProvider(client, params) {
  return Promise.race([
    client.imageToVideo(params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Provider timeout')), PROVIDER_TIMEOUT_MS)
    )
  ]);
}

export { PROVIDERS, DEFAULT_DURATION_SECONDS, PROVIDER_TIMEOUT_MS };
