/**
 * Prioritization Worker
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * FR-3: Wire proposal → prioritization stage
 * - Emits prioritization.started event
 * - Computes/stores priority score
 * - Enqueues to prioritized queue
 * - Emits prioritization.completed event
 * - Latency < 500ms requirement
 *
 * @module lib/data-plane/workers/prioritization
 */

import { IdempotentWorker } from '../idempotent-worker.js';
import { EVENT_TYPES, ENTITY_TYPES } from '../events.js';

/**
 * Priority scoring weights
 */
const SCORING_WEIGHTS = {
  criticalTier: 100,
  highTier: 75,
  mediumTier: 50,
  lowTier: 25,
  hasSource: 10,
  recentFeedback: 5
};

/**
 * Worker that processes proposals and assigns priority scores
 */
export class PrioritizationWorker extends IdempotentWorker {
  constructor(supabase = null) {
    super({
      stageName: 'prioritization',
      entityType: ENTITY_TYPES.PRIORITIZATION,
      supabase
    });
  }

  /**
   * Process a proposal and compute priority score
   *
   * @param {Object} proposal - Proposal to process
   * @param {string} proposal.id - Proposal UUID
   * @param {string} proposal.title - Proposal title
   * @param {string} proposal.priority - Initial priority tier
   * @param {Object} [proposal.metadata] - Proposal metadata
   * @param {string} [proposal.correlation_id] - Correlation ID from previous stage
   * @returns {Promise<Object>} Processing result with score
   */
  async process(proposal) {
    const proposalId = proposal.id;
    // Use injected correlation ID from pipeline, or derive from source_id, or fallback to proposal ID
    const correlationId = proposal._pipeline_correlation_id ||
      (proposal.source_id ? this.getCorrelationId(proposal.source_id) : this.getCorrelationId(proposalId));
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Generate idempotency keys
    const startedKey = this.getIdempotencyKey(proposalId, EVENT_TYPES.PRIORITIZATION_STARTED);
    const completedKey = this.getIdempotencyKey(proposalId, EVENT_TYPES.PRIORITIZATION_COMPLETED);

    // Check if already processed
    if (await this.wasAlreadyProcessed(completedKey)) {
      console.log(`[Prioritization] Already processed proposal ${proposalId}`);

      // Fetch existing score
      const { data: existing } = await this.supabase
        .from('leo_proposals')
        .select('priority_score, priority_queue')
        .eq('id', proposalId)
        .single();

      return {
        success: true,
        duplicate: true,
        proposalId,
        score: existing?.priority_score,
        queueName: existing?.priority_queue,
        correlationId
      };
    }

    // Step 1: Emit prioritization.started event
    const startedResult = await this.emit({
      eventType: EVENT_TYPES.PRIORITIZATION_STARTED,
      entityType: ENTITY_TYPES.PRIORITIZATION,
      entityId: proposalId,
      correlationId,
      idempotencyKey: startedKey,
      payload: {
        proposal_id: proposalId,
        run_id: runId,
        started_at: new Date().toISOString()
      }
    });

    if (!startedResult.success && !startedResult.duplicate) {
      throw new Error(`Failed to emit prioritization.started: ${startedResult.error}`);
    }

    // Step 2: Compute priority score
    const score = this.computeScore(proposal);
    const queueName = this.determineQueue(score);

    // Step 3: Update proposal with score and queue
    // leo_proposals: status enum values are: draft, submitted, pending_vetting, vetted, approved, rejected, quarantined
    // We use 'submitted' to indicate it's ready for execution
    const { error: updateError } = await this.supabase
      .from('leo_proposals')
      .update({
        priority_score: score,
        priority_queue: queueName,
        status: 'submitted', // Ready for execution (valid enum value)
        updated_at: new Date().toISOString()
        // Note: no 'metadata' column exists - prioritization data stored in events
      })
      .eq('id', proposalId);

    if (updateError) {
      throw new Error(`Failed to update proposal: ${updateError.message}`);
    }

    // Step 4: Emit prioritization.completed event
    const completedResult = await this.emit({
      eventType: EVENT_TYPES.PRIORITIZATION_COMPLETED,
      entityType: ENTITY_TYPES.PRIORITIZATION,
      entityId: proposalId,
      correlationId,
      idempotencyKey: completedKey,
      payload: {
        proposal_id: proposalId,
        run_id: runId,
        score,
        queue_name: queueName,
        completed_at: new Date().toISOString()
      }
    });

    // Mark events as processed
    if (startedResult.id) {
      await this.markProcessed(startedResult.id);
    }
    if (completedResult.id) {
      await this.markProcessed(completedResult.id);
    }

    return {
      success: true,
      duplicate: false,
      proposalId,
      score,
      queueName,
      runId,
      correlationId,
      events: {
        started: startedResult.id || 'duplicate',
        completed: completedResult.id || 'duplicate'
      }
    };
  }

  /**
   * Compute priority score for a proposal
   *
   * @param {Object} proposal - Proposal to score
   * @returns {number} Priority score (0-100)
   */
  computeScore(proposal) {
    let score = 0;

    // Base score from priority tier
    const tierScores = {
      'critical': SCORING_WEIGHTS.criticalTier,
      'high': SCORING_WEIGHTS.highTier,
      'medium': SCORING_WEIGHTS.mediumTier,
      'low': SCORING_WEIGHTS.lowTier
    };
    score += tierScores[proposal.priority] || SCORING_WEIGHTS.mediumTier;

    // Bonus for having source reference
    if (proposal.source_id || proposal.source_type) {
      score += SCORING_WEIGHTS.hasSource;
    }

    // Bonus for recent creation (within 24 hours)
    if (proposal.created_at) {
      const ageHours = (Date.now() - new Date(proposal.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) {
        score += SCORING_WEIGHTS.recentFeedback;
      }
    }

    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Get detailed score breakdown for auditing
   *
   * @param {Object} proposal - Proposal to analyze
   * @returns {Object} Score breakdown
   */
  getScoreBreakdown(proposal) {
    return {
      tierScore: {
        tier: proposal.priority,
        points: this.getTierPoints(proposal.priority)
      },
      sourceBonus: proposal.source_id ? SCORING_WEIGHTS.hasSource : 0,
      recencyBonus: this.getRecencyBonus(proposal),
      weights: SCORING_WEIGHTS
    };
  }

  /**
   * Get points for priority tier
   * @param {string} tier - Priority tier
   * @returns {number} Points
   */
  getTierPoints(tier) {
    const tierScores = {
      'critical': SCORING_WEIGHTS.criticalTier,
      'high': SCORING_WEIGHTS.highTier,
      'medium': SCORING_WEIGHTS.mediumTier,
      'low': SCORING_WEIGHTS.lowTier
    };
    return tierScores[tier] || SCORING_WEIGHTS.mediumTier;
  }

  /**
   * Calculate recency bonus
   * @param {Object} proposal - Proposal
   * @returns {number} Recency bonus points
   */
  getRecencyBonus(proposal) {
    if (!proposal.created_at) return 0;
    const ageHours = (Date.now() - new Date(proposal.created_at).getTime()) / (1000 * 60 * 60);
    return ageHours < 24 ? SCORING_WEIGHTS.recentFeedback : 0;
  }

  /**
   * Determine queue name based on score
   *
   * @param {number} score - Priority score
   * @returns {string} Queue name
   */
  determineQueue(score) {
    if (score >= 90) return 'critical_queue';
    if (score >= 70) return 'high_priority_queue';
    if (score >= 40) return 'standard_queue';
    return 'low_priority_queue';
  }
}

/**
 * Process a batch of proposals for prioritization
 *
 * @param {Array} proposals - Array of proposals to process
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<Object>} Batch processing results
 */
export async function prioritizeProposalBatch(proposals, supabase = null) {
  const worker = new PrioritizationWorker(supabase);
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
 * Process pending proposals that need prioritization
 *
 * @param {Object} [options] - Processing options
 * @param {number} [options.limit=10] - Maximum items to process
 * @param {Object} [options.supabase] - Optional Supabase client
 * @returns {Promise<Object>} Processing results
 */
export async function processPendingProposals(options = {}) {
  const { limit = 10, supabase } = options;
  const worker = new PrioritizationWorker(supabase);

  // Fetch proposals that need prioritization (status = draft, no priority_score)
  const { data: pendingProposals, error } = await worker.supabase
    .from('leo_proposals')
    .select('*')
    .eq('status', 'draft')
    .is('priority_score', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch pending proposals: ${error.message}`);
  }

  if (!pendingProposals || pendingProposals.length === 0) {
    return {
      total: 0,
      processed: 0,
      message: 'No pending proposals to prioritize'
    };
  }

  return prioritizeProposalBatch(pendingProposals, worker.supabase);
}

export default {
  PrioritizationWorker,
  prioritizeProposalBatch,
  processPendingProposals
};
