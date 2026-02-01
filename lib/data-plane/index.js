/**
 * Data-Plane Pipeline Module
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * Exports all data-plane components for the LEO self-improvement pipeline.
 *
 * @module lib/data-plane
 */

// Main pipeline orchestrator
export { processFeedbackEndToEnd, getPipelineTrace, getPipelineHealth, STAGES } from './pipeline.js';

// Event utilities
export {
  EVENT_TYPES,
  ENTITY_TYPES,
  emitEvent,
  markEventProcessed,
  checkEventExists,
  getEventsByCorrelation,
  calculateStageLatency,
  generateIdempotencyKey,
  generateCorrelationId
} from './events.js';

// Worker base class
export { IdempotentWorker, fetchConfig, invalidateConfigCache } from './idempotent-worker.js';

// Individual workers
export { FeedbackToProposalWorker, processFeedbackBatch, processPendingFeedback } from './workers/feedback-to-proposal.js';
export { PrioritizationWorker, prioritizeProposalBatch, processPendingProposals } from './workers/prioritization.js';
export { ExecutionWorker, JOB_STATUS, enqueueProposalBatch, processPrioritizedProposals } from './workers/execution.js';
