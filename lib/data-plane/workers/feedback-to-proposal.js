/**
 * Feedback to Proposal Worker
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * FR-2: Wire feedback_inbox → leo_proposals stage
 * - Emits feedback.received event
 * - Creates proposal from feedback
 * - Emits proposal.created event
 * - Uses idempotency to ensure exactly-once processing
 *
 * @module lib/data-plane/workers/feedback-to-proposal
 */

import { IdempotentWorker } from '../idempotent-worker.js';
import { EVENT_TYPES, ENTITY_TYPES } from '../events.js';

/**
 * Worker that processes feedback items and creates proposals
 */
export class FeedbackToProposalWorker extends IdempotentWorker {
  constructor(supabase = null) {
    super({
      stageName: 'feedback_to_proposal',
      entityType: ENTITY_TYPES.FEEDBACK_INTAKE,
      supabase
    });
  }

  /**
   * Process a feedback item and create a proposal
   *
   * @param {Object} feedback - Feedback item to process
   * @param {string} feedback.id - Feedback UUID
   * @param {string} feedback.title - Feedback title
   * @param {string} feedback.description - Feedback description
   * @param {string} feedback.type - Feedback type (issue, suggestion, etc.)
   * @param {string} feedback.priority - Feedback priority
   * @param {Object} [feedback.metadata] - Additional metadata
   * @returns {Promise<Object>} Processing result with proposal_id
   */
  async process(feedback) {
    const feedbackId = feedback.id;
    const correlationId = this.getCorrelationId(feedbackId);

    // Generate idempotency keys for both events
    const receivedKey = this.getIdempotencyKey(feedbackId, EVENT_TYPES.FEEDBACK_RECEIVED);
    const proposalKey = this.getIdempotencyKey(feedbackId, EVENT_TYPES.PROPOSAL_CREATED);

    // Check if already processed
    if (await this.wasAlreadyProcessed(proposalKey)) {
      console.log(`[FeedbackToProposal] Already processed feedback ${feedbackId}`);

      // Find existing proposal
      const { data: existingProposal } = await this.supabase
        .from('leo_proposals')
        .select('id')
        .eq('source_id', feedbackId)
        .single();

      return {
        success: true,
        duplicate: true,
        proposalId: existingProposal?.id,
        correlationId
      };
    }

    // Step 1: Emit feedback.received event
    const receivedResult = await this.emit({
      eventType: EVENT_TYPES.FEEDBACK_RECEIVED,
      entityType: ENTITY_TYPES.FEEDBACK_INTAKE,
      entityId: feedbackId,
      correlationId,
      idempotencyKey: receivedKey,
      payload: {
        feedback_id: feedbackId,
        source: feedback.source_type || 'manual',
        submitted_at: feedback.created_at || new Date().toISOString(),
        title: feedback.title,
        type: feedback.type
      }
    });

    if (!receivedResult.success && !receivedResult.duplicate) {
      throw new Error(`Failed to emit feedback.received: ${receivedResult.error}`);
    }

    // Step 2: Create proposal from feedback
    // Check if proposal already exists (idempotent check)
    const { data: existingProposal } = await this.supabase
      .from('leo_proposals')
      .select('id')
      .eq('source_id', feedbackId)
      .maybeSingle();

    let proposalId;

    if (existingProposal) {
      // Proposal already exists
      proposalId = existingProposal.id;
    } else {
      // Create new proposal
      // leo_proposals actual schema: id, title, body, proposer_id, status, vetting_status (required)
      // Plus our added columns: source_type, source_id, priority_score, priority_queue
      const proposalData = {
        title: feedback.title || 'Untitled Proposal',
        body: feedback.description || `Auto-generated from feedback. Type: ${feedback.type || 'unknown'}`,
        proposer_id: feedbackId, // Use feedback ID as proposer (system-generated)
        status: 'draft',
        vetting_status: 'not_started',
        source_type: 'feedback',
        source_id: feedbackId,
        priority: this.mapPriorityToTier(feedback.priority),
        category: feedback.type || 'general',
        tags: [feedback.type || 'feedback', 'pipeline_generated']
      };

      const { data: newProposal, error: insertError } = await this.supabase
        .from('leo_proposals')
        .insert(proposalData)
        .select('id')
        .single();

      if (insertError) {
        // Check if it's a unique constraint violation (concurrent insert)
        if (insertError.code === '23505') {
          // Another process created it, fetch the existing one
          const { data: concurrent } = await this.supabase
            .from('leo_proposals')
            .select('id')
            .eq('source_id', feedbackId)
            .single();
          proposalId = concurrent?.id;
        } else {
          throw new Error(`Failed to create proposal: ${insertError.message}`);
        }
      } else {
        proposalId = newProposal.id;
      }
    }

    // Step 3: Emit proposal.created event
    const createdResult = await this.emit({
      eventType: EVENT_TYPES.PROPOSAL_CREATED,
      entityType: ENTITY_TYPES.PROPOSAL_CREATION,
      entityId: proposalId,
      correlationId,
      idempotencyKey: proposalKey,
      payload: {
        feedback_id: feedbackId,
        proposal_id: proposalId,
        creation_reason: 'feedback_pipeline',
        priority_tier: this.mapPriorityToTier(feedback.priority)
      }
    });

    // Mark received event as processed
    if (receivedResult.id) {
      await this.markProcessed(receivedResult.id);
    }

    // Mark created event as processed
    if (createdResult.id) {
      await this.markProcessed(createdResult.id);
    }

    return {
      success: true,
      duplicate: false,
      proposalId,
      correlationId,
      events: {
        feedbackReceived: receivedResult.id || 'duplicate',
        proposalCreated: createdResult.id || 'duplicate'
      }
    };
  }

  /**
   * Map feedback priority to proposal tier
   *
   * @param {string} priority - Feedback priority (P0, P1, P2, etc.)
   * @returns {string} Proposal priority tier
   */
  mapPriorityToTier(priority) {
    const mapping = {
      'P0': 'critical',
      'P1': 'high',
      'P2': 'medium',
      'P3': 'low',
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    return mapping[priority] || 'medium';
  }

  /**
   * Map feedback priority to risk level for leo_proposals
   * Risk levels: 'low', 'medium', 'high'
   *
   * @param {string} priority - Feedback priority (P0, P1, P2, etc.)
   * @returns {string} Risk level
   */
  mapPriorityToRiskLevel(priority) {
    const mapping = {
      'P0': 'high',
      'P1': 'high',
      'P2': 'medium',
      'P3': 'low',
      'critical': 'high',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    return mapping[priority] || 'medium';
  }
}

/**
 * Process a batch of feedback items
 *
 * @param {Array} feedbackItems - Array of feedback items to process
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<Object>} Batch processing results
 */
export async function processFeedbackBatch(feedbackItems, supabase = null) {
  const worker = new FeedbackToProposalWorker(supabase);
  const results = [];

  for (const feedback of feedbackItems) {
    const result = await worker.run(feedback);
    results.push({
      feedbackId: feedback.id,
      ...result
    });
  }

  return {
    total: feedbackItems.length,
    successful: results.filter(r => r.success).length,
    duplicates: results.filter(r => r.duplicate).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

/**
 * Process pending feedback items from the database
 *
 * @param {Object} [options] - Processing options
 * @param {number} [options.limit=10] - Maximum items to process
 * @param {Object} [options.supabase] - Optional Supabase client
 * @returns {Promise<Object>} Processing results
 */
export async function processPendingFeedback(options = {}) {
  const { limit = 10, supabase } = options;
  const worker = new FeedbackToProposalWorker(supabase);

  // Fetch feedback items that don't have proposals yet
  const { data: pendingFeedback, error } = await worker.supabase
    .from('feedback')
    .select('*')
    .eq('status', 'new')
    .is('proposal_id', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch pending feedback: ${error.message}`);
  }

  if (!pendingFeedback || pendingFeedback.length === 0) {
    return {
      total: 0,
      processed: 0,
      message: 'No pending feedback to process'
    };
  }

  return processFeedbackBatch(pendingFeedback, worker.supabase);
}

export default {
  FeedbackToProposalWorker,
  processFeedbackBatch,
  processPendingFeedback
};
