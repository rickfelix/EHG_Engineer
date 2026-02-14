/**
 * AI Marketing Engine - Module Index
 * SD-EVA-FEAT-MARKETING-AI-001
 *
 * Barrel exports for the AI-powered marketing subsystem.
 */

export { createSampler, sampleBeta, MIN_IMPRESSIONS_FOR_DECLARATION, EXPLORATION_FLOOR } from './thompson-sampler.js';
export { createOptimizationLoop, CADENCES, ROI_THRESHOLD, BUDGET_SHIFT_MIN, CHAMPION_CONFIDENCE } from './optimization-loop.js';
export { createImageGenerator, DEFAULT_WIDTH, DEFAULT_HEIGHT, GENERATION_TIMEOUT_MS } from './image-generator.js';
export { createVideoGenerator, PROVIDERS, DEFAULT_DURATION_SECONDS, PROVIDER_TIMEOUT_MS } from './video-generator.js';
export { createEmailCampaigns, ENROLLMENT_STATUS, MAX_RETRY_ATTEMPTS, RETRY_DELAYS_MS, DEFAULT_STEP_DELAY_HOURS } from './email-campaigns.js';
export { createMetricsIngestor, normalizeMetric, MAX_RETRIES, RETRY_DELAY_MS, WEBHOOK_PROCESSING_TARGET_MS } from './metrics-ingestor.js';
