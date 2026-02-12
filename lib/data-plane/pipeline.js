/**
 * Data-Plane Pipeline Orchestrator
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * Main entry point for the LEO self-improvement pipeline.
 * Coordinates all stages: feedback → proposal → prioritization → execution
 *
 * @module lib/data-plane/pipeline
 */

import { FeedbackToProposalWorker } from './workers/feedback-to-proposal.js';
import { PrioritizationWorker } from './workers/prioritization.js';
import { ExecutionWorker, JOB_STATUS } from './workers/execution.js';
import {
  getEventsByCorrelation,
  calculateStageLatency,
  EVENT_TYPES
} from './events.js';
import { invalidateConfigCache } from './idempotent-worker.js';

/**
 * Pipeline stage identifiers
 */
export const STAGES = {
  FEEDBACK_INTAKE: 'feedback_intake',
  PROPOSAL_CREATION: 'proposal_creation',
  PRIORITIZATION: 'prioritization',
  EXECUTION_ENQUEUE: 'execution_enqueue'
};

/**
 * Process a feedback item through the entire pipeline
 * End-to-end: feedback → proposal → prioritized → execution queued
 *
 * @param {Object} feedback - Feedback item to process
 * @param {Object} [options] - Processing options
 * @param {Object} [options.supabase] - Optional Supabase client
 * @param {boolean} [options.stopAfterProposal=false] - Stop after proposal creation
 * @param {boolean} [options.stopAfterPrioritization=false] - Stop after prioritization
 * @returns {Promise<Object>} Pipeline result with all stage outputs
 */
export async function processFeedbackEndToEnd(feedback, options = {}) {
  const { supabase, stopAfterProposal = false, stopAfterPrioritization = false } = options;

  const startTime = Date.now();
  const result = {
    feedbackId: feedback.id,
    stages: {},
    events: [],
    latencies: {},
    success: false
  };

  try {
    // Stage 1: Feedback → Proposal
    const feedbackWorker = new FeedbackToProposalWorker(supabase);
    const proposalResult = await feedbackWorker.run(feedback);

    result.stages.feedbackToProposal = proposalResult;

    if (!proposalResult.success) {
      result.error = proposalResult.error || 'Failed at feedback_to_proposal stage';
      return result;
    }

    result.proposalId = proposalResult.proposalId;
    result.correlationId = proposalResult.correlationId;

    if (stopAfterProposal) {
      result.success = true;
      result.stoppedAt = 'proposal';
      return result;
    }

    // Stage 2: Proposal → Prioritization
    // Fetch the created proposal
    const { data: proposal, error: fetchError } = await feedbackWorker.supabase
      .from('leo_proposals')
      .select('*')
      .eq('id', proposalResult.proposalId)
      .single();

    if (fetchError || !proposal) {
      result.error = `Failed to fetch proposal: ${fetchError?.message || 'not found'}`;
      return result;
    }

    // Inject correlation ID for cross-stage tracing
    proposal._pipeline_correlation_id = proposalResult.correlationId;

    const prioritizationWorker = new PrioritizationWorker(supabase);
    const prioritizationResult = await prioritizationWorker.run(proposal);

    result.stages.prioritization = prioritizationResult;

    if (!prioritizationResult.success) {
      result.error = prioritizationResult.error || 'Failed at prioritization stage';
      return result;
    }

    result.priorityScore = prioritizationResult.score;
    result.queueName = prioritizationResult.queueName;

    if (stopAfterPrioritization) {
      result.success = true;
      result.stoppedAt = 'prioritization';
      return result;
    }

    // Stage 3: Prioritization → Execution
    // Refetch proposal with updated fields
    const { data: prioritizedProposal } = await feedbackWorker.supabase
      .from('leo_proposals')
      .select('*')
      .eq('id', proposalResult.proposalId)
      .single();

    // Inject correlation ID for cross-stage tracing
    prioritizedProposal._pipeline_correlation_id = proposalResult.correlationId;

    const executionWorker = new ExecutionWorker(supabase);
    const executionResult = await executionWorker.run(prioritizedProposal);

    result.stages.execution = executionResult;

    if (!executionResult.success) {
      result.error = executionResult.error || 'Failed at execution stage';
      return result;
    }

    result.executionJobId = executionResult.executionJobId;
    result.success = true;

    // Calculate latencies
    result.totalTimeMs = Date.now() - startTime;
    result.latencies = await calculatePipelineLatencies(
      result.correlationId,
      feedbackWorker.supabase
    );

  } catch (error) {
    result.error = error.message;
    result.success = false;
  }

  return result;
}

/**
 * Calculate latencies between pipeline stages
 *
 * @param {string} correlationId - Correlation ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Latency measurements
 */
async function calculatePipelineLatencies(correlationId, supabase) {
  const latencies = {};

  // Feedback → Proposal
  const feedbackToProposal = await calculateStageLatency(
    correlationId,
    EVENT_TYPES.FEEDBACK_RECEIVED,
    EVENT_TYPES.PROPOSAL_CREATED,
    supabase
  );
  latencies.feedbackToProposalMs = feedbackToProposal.latencyMs;

  // Proposal → Prioritization
  const proposalToPrioritization = await calculateStageLatency(
    correlationId,
    EVENT_TYPES.PROPOSAL_CREATED,
    EVENT_TYPES.PRIORITIZATION_COMPLETED,
    supabase
  );
  latencies.proposalToPrioritizationMs = proposalToPrioritization.latencyMs;

  // Prioritization → Execution
  const prioritizationToExecution = await calculateStageLatency(
    correlationId,
    EVENT_TYPES.PRIORITIZATION_COMPLETED,
    EVENT_TYPES.EXECUTION_ENQUEUED,
    supabase
  );
  latencies.prioritizationToExecutionMs = prioritizationToExecution.latencyMs;

  // End-to-end
  const endToEnd = await calculateStageLatency(
    correlationId,
    EVENT_TYPES.FEEDBACK_RECEIVED,
    EVENT_TYPES.EXECUTION_ENQUEUED,
    supabase
  );
  latencies.endToEndMs = endToEnd.latencyMs;

  return latencies;
}

/**
 * Get full event trace for a pipeline run
 *
 * @param {string} correlationId - Correlation ID
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<Object>} Event trace with timeline
 */
export async function getPipelineTrace(correlationId, supabase = null) {
  const events = await getEventsByCorrelation(correlationId, supabase);

  const trace = {
    correlationId,
    eventCount: events.length,
    timeline: [],
    stages: {
      feedback: null,
      proposal: null,
      prioritization: null,
      execution: null
    }
  };

  for (const event of events) {
    const eventInfo = {
      id: event.id,
      type: event.event_name,
      entityType: event.entity_type,
      timestamp: event.created_at,
      processed: event.processed_at !== null,
      payload: event.payload
    };

    trace.timeline.push(eventInfo);

    // Categorize by stage
    if (event.event_name.startsWith('feedback.')) {
      trace.stages.feedback = trace.stages.feedback || [];
      trace.stages.feedback.push(eventInfo);
    } else if (event.event_name.startsWith('proposal.')) {
      trace.stages.proposal = trace.stages.proposal || [];
      trace.stages.proposal.push(eventInfo);
    } else if (event.event_name.startsWith('prioritization.')) {
      trace.stages.prioritization = trace.stages.prioritization || [];
      trace.stages.prioritization.push(eventInfo);
    } else if (event.event_name.startsWith('execution.')) {
      trace.stages.execution = trace.stages.execution || [];
      trace.stages.execution.push(eventInfo);
    }
  }

  return trace;
}

/**
 * Get pipeline health metrics
 *
 * @param {Object} [options] - Options
 * @param {number} [options.windowMinutes=60] - Time window in minutes
 * @param {Object} [options.supabase] - Optional Supabase client
 * @returns {Promise<Object>} Pipeline health metrics
 */
export async function getPipelineHealth(options = {}) {
  const { windowMinutes = 60, supabase } = options;

  const { createClient } = await import('@supabase/supabase-js');
  const client = supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  // Count events by type in window
  const { data: eventCounts, error } = await client
    .from('leo_events')
    .select('event_name')
    .gte('created_at', windowStart);

  if (error) {
    throw new Error(`Failed to fetch pipeline metrics: ${error.message}`);
  }

  const counts = {};
  for (const event of eventCounts || []) {
    counts[event.event_name] = (counts[event.event_name] || 0) + 1;
  }

  // Calculate conversion rates
  const feedbackReceived = counts[EVENT_TYPES.FEEDBACK_RECEIVED] || 0;
  const proposalsCreated = counts[EVENT_TYPES.PROPOSAL_CREATED] || 0;
  const prioritizationCompleted = counts[EVENT_TYPES.PRIORITIZATION_COMPLETED] || 0;
  const executionEnqueued = counts[EVENT_TYPES.EXECUTION_ENQUEUED] || 0;

  return {
    window: {
      minutes: windowMinutes,
      start: windowStart,
      end: new Date().toISOString()
    },
    eventCounts: counts,
    totals: {
      feedbackReceived,
      proposalsCreated,
      prioritizationCompleted,
      executionEnqueued
    },
    conversionRates: {
      feedbackToProposal: feedbackReceived > 0 ? (proposalsCreated / feedbackReceived) : 0,
      proposalToPrioritization: proposalsCreated > 0 ? (prioritizationCompleted / proposalsCreated) : 0,
      prioritizationToExecution: prioritizationCompleted > 0 ? (executionEnqueued / prioritizationCompleted) : 0,
      endToEnd: feedbackReceived > 0 ? (executionEnqueued / feedbackReceived) : 0
    }
  };
}

/**
 * Refresh pipeline configuration
 */
export function refreshConfig() {
  invalidateConfigCache();
}

export default {
  STAGES,
  processFeedbackEndToEnd,
  getPipelineTrace,
  getPipelineHealth,
  refreshConfig,
  // Re-export workers for direct access
  FeedbackToProposalWorker,
  PrioritizationWorker,
  ExecutionWorker,
  JOB_STATUS
};
