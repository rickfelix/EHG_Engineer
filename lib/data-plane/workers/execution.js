/**
 * Execution Worker
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * FR-4: Wire prioritization → execution stage
 * - Emits execution.enqueued event
 * - Creates execution work item
 * - Emits execution.started event (when job begins)
 * - Emits execution.completed event (on completion)
 * - Latency < 500ms requirement (prioritization → enqueue)
 *
 * @module lib/data-plane/workers/execution
 */

import { IdempotentWorker } from '../idempotent-worker.js';
import { EVENT_TYPES, ENTITY_TYPES } from '../events.js';

/**
 * Execution job status constants
 */
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Worker that enqueues prioritized proposals for execution
 */
export class ExecutionWorker extends IdempotentWorker {
  constructor(supabase = null) {
    super({
      stageName: 'execution',
      entityType: ENTITY_TYPES.EXECUTION_ENQUEUE,
      supabase
    });
  }

  /**
   * Enqueue a prioritized proposal for execution
   *
   * @param {Object} proposal - Prioritized proposal
   * @param {string} proposal.id - Proposal UUID
   * @param {number} proposal.priority_score - Computed priority score
   * @param {string} proposal.priority_queue - Queue name
   * @param {Object} [proposal.metadata] - Proposal metadata
   * @returns {Promise<Object>} Processing result with execution_job_id
   */
  async process(proposal) {
    const proposalId = proposal.id;
    // Use injected correlation ID from pipeline, or derive from source_id, or fallback to proposal ID
    const correlationId = proposal._pipeline_correlation_id ||
      (proposal.source_id ? this.getCorrelationId(proposal.source_id) : this.getCorrelationId(proposalId));

    // Generate idempotency key for enqueue
    const enqueueKey = this.getIdempotencyKey(proposalId, EVENT_TYPES.EXECUTION_ENQUEUED);

    // Check if already processed
    if (await this.wasAlreadyProcessed(enqueueKey)) {
      console.log(`[Execution] Already enqueued proposal ${proposalId}`);

      // Find existing execution job
      const { data: existingJob } = await this.supabase
        .from('leo_execution_jobs')
        .select('id, status')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      return {
        success: true,
        duplicate: true,
        proposalId,
        executionJobId: existingJob?.id,
        status: existingJob?.status,
        correlationId
      };
    }

    // Step 1: Create execution job
    const executionJobData = {
      proposal_id: proposalId,
      status: JOB_STATUS.PENDING,
      priority: proposal.priority_score || 50,
      queue_name: proposal.priority_queue || 'standard_queue',
      metadata: {
        correlation_id: correlationId,
        enqueued_at: new Date().toISOString(),
        proposal_title: proposal.title,
        source_type: proposal.source_type
      }
    };

    // Try to insert (check if table exists, otherwise use alternative)
    let executionJobId;

    try {
      const { data: newJob, error: insertError } = await this.supabase
        .from('leo_execution_jobs')
        .insert(executionJobData)
        .select('id')
        .single();

      if (insertError) {
        // Table might not exist, log event anyway for observability
        if (insertError.code === '42P01') {
          console.log('[Execution] leo_execution_jobs table does not exist, using fallback');
          executionJobId = `virtual-${Date.now()}-${proposalId.slice(0, 8)}`;
        } else if (insertError.code === '23505') {
          // Duplicate, fetch existing
          const { data: existing } = await this.supabase
            .from('leo_execution_jobs')
            .select('id')
            .eq('proposal_id', proposalId)
            .single();
          executionJobId = existing?.id;
        } else {
          throw new Error(`Failed to create execution job: ${insertError.message}`);
        }
      } else {
        executionJobId = newJob.id;
      }
    } catch (err) {
      // Fallback: create virtual job ID for event tracking
      console.log('[Execution] Using virtual job ID:', err.message);
      executionJobId = `virtual-${Date.now()}-${proposalId.slice(0, 8)}`;
    }

    // Step 2: Update proposal status
    await this.supabase
      .from('leo_proposals')
      .update({
        status: 'pending_vetting',
        execution_job_id: executionJobId.startsWith('virtual-') ? null : executionJobId,
        updated_at: new Date().toISOString()
      })
      .eq('id', proposalId);

    // Step 3: Emit execution.enqueued event
    const enqueueResult = await this.emit({
      eventType: EVENT_TYPES.EXECUTION_ENQUEUED,
      entityType: ENTITY_TYPES.EXECUTION_ENQUEUE,
      entityId: proposalId,
      correlationId,
      idempotencyKey: enqueueKey,
      payload: {
        proposal_id: proposalId,
        execution_job_id: executionJobId,
        queue_name: proposal.priority_queue || 'standard_queue',
        priority: proposal.priority_score || 50,
        enqueued_at: new Date().toISOString()
      }
    });

    // Mark event as processed
    if (enqueueResult.id) {
      await this.markProcessed(enqueueResult.id);
    }

    return {
      success: true,
      duplicate: false,
      proposalId,
      executionJobId,
      queueName: proposal.priority_queue || 'standard_queue',
      correlationId,
      events: {
        enqueued: enqueueResult.id || 'duplicate'
      }
    };
  }

  /**
   * Mark an execution job as started
   *
   * @param {string} executionJobId - Execution job ID
   * @param {string} correlationId - Correlation ID for tracing
   * @returns {Promise<Object>} Result
   */
  async markStarted(executionJobId, correlationId) {
    const startedKey = this.getIdempotencyKey(executionJobId, EVENT_TYPES.EXECUTION_STARTED);

    // Check if already emitted
    if (await this.wasAlreadyProcessed(startedKey)) {
      return { success: true, duplicate: true };
    }

    // Update job status if table exists
    try {
      await this.supabase
        .from('leo_execution_jobs')
        .update({
          status: JOB_STATUS.RUNNING,
          started_at: new Date().toISOString()
        })
        .eq('id', executionJobId);
    } catch {
      // Ignore if table doesn't exist
    }

    // Emit event
    const result = await this.emit({
      eventType: EVENT_TYPES.EXECUTION_STARTED,
      entityType: ENTITY_TYPES.EXECUTION_ENQUEUE,
      entityId: executionJobId,
      correlationId,
      idempotencyKey: startedKey,
      payload: {
        execution_job_id: executionJobId,
        started_at: new Date().toISOString()
      }
    });

    if (result.id) {
      await this.markProcessed(result.id);
    }

    return { success: true, duplicate: false, eventId: result.id };
  }

  /**
   * Mark an execution job as completed
   *
   * @param {string} executionJobId - Execution job ID
   * @param {string} correlationId - Correlation ID for tracing
   * @param {string} status - Final status (completed, failed, cancelled)
   * @param {Object} [result] - Execution result data
   * @returns {Promise<Object>} Result
   */
  async markCompleted(executionJobId, correlationId, status = JOB_STATUS.COMPLETED, result = null) {
    const completedKey = this.getIdempotencyKey(executionJobId, EVENT_TYPES.EXECUTION_COMPLETED);

    // Check if already emitted
    if (await this.wasAlreadyProcessed(completedKey)) {
      return { success: true, duplicate: true };
    }

    // Update job status if table exists
    try {
      await this.supabase
        .from('leo_execution_jobs')
        .update({
          status,
          completed_at: new Date().toISOString(),
          result: result || {}
        })
        .eq('id', executionJobId);
    } catch {
      // Ignore if table doesn't exist
    }

    // Emit event
    const emitResult = await this.emit({
      eventType: EVENT_TYPES.EXECUTION_COMPLETED,
      entityType: ENTITY_TYPES.EXECUTION_ENQUEUE,
      entityId: executionJobId,
      correlationId,
      idempotencyKey: completedKey,
      payload: {
        execution_job_id: executionJobId,
        status,
        completed_at: new Date().toISOString(),
        result: result || {}
      }
    });

    if (emitResult.id) {
      await this.markProcessed(emitResult.id);
    }

    return { success: true, duplicate: false, eventId: emitResult.id };
  }
}

/**
 * Process a batch of prioritized proposals for execution
 *
 * @param {Array} proposals - Array of prioritized proposals
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<Object>} Batch processing results
 */
export async function enqueueProposalBatch(proposals, supabase = null) {
  const worker = new ExecutionWorker(supabase);
  const results = [];

  for (const proposal of proposals) {
    const result = await worker.run(proposal);
    results.push({
      proposalId: proposal.id,
      ...result
    });
  }

  return {
    total: proposals.length,
    successful: results.filter(r => r.success).length,
    duplicates: results.filter(r => r.duplicate).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

/**
 * Process pending prioritized proposals for execution
 *
 * @param {Object} [options] - Processing options
 * @param {number} [options.limit=10] - Maximum items to process
 * @param {Object} [options.supabase] - Optional Supabase client
 * @returns {Promise<Object>} Processing results
 */
export async function processPrioritizedProposals(options = {}) {
  const { limit = 10, supabase } = options;
  const worker = new ExecutionWorker(supabase);

  // Fetch prioritized proposals that haven't been enqueued
  const { data: pendingProposals, error } = await worker.supabase
    .from('leo_proposals')
    .select('*')
    .eq('status', 'submitted')
    .not('priority_score', 'is', null)
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch prioritized proposals: ${error.message}`);
  }

  if (!pendingProposals || pendingProposals.length === 0) {
    return {
      total: 0,
      processed: 0,
      message: 'No prioritized proposals to enqueue'
    };
  }

  return enqueueProposalBatch(pendingProposals, worker.supabase);
}

export default {
  ExecutionWorker,
  JOB_STATUS,
  enqueueProposalBatch,
  processPrioritizedProposals
};
