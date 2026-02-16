/**
 * Marketing Engine - Module Index
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001 + SD-EVA-FEAT-MARKETING-AI-001
 *
 * Central exports for the marketing subsystem.
 */

export { generateContent, transitionContentState } from './content-generator.js';
export { publish, getSupportedPlatforms } from './publisher/index.js';
export { generateUTMParams, buildUTMQueryString, appendUTMToUrl } from './utm.js';
export { checkBudget, recordSpend, getBudgetSummary, resetDailySpend } from './budget-governor.js';
export { createQueues, createWorkers, addJob, getQueueHealth, shutdown, getQueueConfigs } from './queues/index.js';

// AI-powered marketing (SD-EVA-FEAT-MARKETING-AI-001)
export {
  createSampler,
  createOptimizationLoop,
  createImageGenerator,
  createVideoGenerator,
  createEmailCampaigns,
  createMetricsIngestor
} from './ai/index.js';

// Content pipeline orchestration (SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L)
export { executePipeline, getAvailableChannels, getPipelineHistory, PIPELINE_STATUS } from './content-pipeline.js';

// PostHog analytics integration (SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L)
export {
  createPostHogClient,
  VENTURE_EVENTS,
  trackVentureEvent,
  trackStageTransition,
  trackContentGenerated,
  trackContentPublished
} from './posthog-integration.js';

// Feedback loop (SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L)
export { analyzeAndAdjust, evaluateChannel, getFeedbackHistory, FEEDBACK_ACTION } from './feedback-loop.js';

// Marketing dashboard (SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L)
export { buildDashboard, getCampaigns, METRIC_TYPE } from './dashboard.js';
