/**
 * VentureStateMachine - CEO-owned venture stage transitions
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 10
 *
 * CEO owns state machine:
 * - Only CEO can commit stage transitions
 * - VPs propose handoffs, CEO reviews and commits
 * - Integrates with fn_advance_venture_stage()
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handoff package structure for VP -> CEO handoffs
 */
const REQUIRED_HANDOFF_FIELDS = [
  'artifacts',
  'key_decisions',
  'open_questions',
  'risks_identified'
];

/**
 * VentureStateMachine - Manages CEO-owned venture stage transitions
 */
export class VentureStateMachine {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.ventureId = options.ventureId;
    this.ceoAgentId = options.ceoAgentId;

    // In-memory state cache
    this.currentStage = null;
    this.stageStates = new Map();
    this.pendingHandoffs = new Map();
  }

  /**
   * Initialize state machine by loading current venture state
   */
  async initialize() {
    console.log(`\n📊 Initializing state machine for venture ${this.ventureId}`);

    // Load venture current stage
    const { data: venture, error } = await this.supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage, status')
      .eq('id', this.ventureId)
      .single();

    if (error || !venture) {
      throw new Error(`Failed to load venture: ${error?.message || 'Not found'}`);
    }

    this.currentStage = venture.current_lifecycle_stage || 1;
    console.log(`   Current stage: ${this.currentStage}`);

    // Load stage work status
    const { data: stageWork } = await this.supabase
      .from('venture_stage_work')
      .select('lifecycle_stage, stage_status, health_score')
      .eq('venture_id', this.ventureId);

    if (stageWork) {
      for (const sw of stageWork) {
        this.stageStates.set(sw.lifecycle_stage, {
          status: sw.stage_status,
          health_score: sw.health_score
        });
      }
    }

    console.log(`   Stages loaded: ${this.stageStates.size}`);
    return this;
  }

  /**
   * Get current venture stage
   */
  getCurrentStage() {
    return this.currentStage;
  }

  /**
   * Get stage state
   */
  getStageState(stageId) {
    return this.stageStates.get(stageId) || { status: 'pending', health_score: null };
  }

  /**
   * VP proposes handoff - CEO must review and commit
   * @param {Object} proposal - Handoff proposal from VP
   */
  async proposeHandoff(proposal) {
    const {
      vpAgentId,
      fromStage,
      artifacts = [],
      key_decisions = [],
      open_questions = [],
      risks_identified = []
    } = proposal;

    console.log(`\n📋 Handoff proposal received from VP for stage ${fromStage}`);

    // Validate proposal completeness
    const validation = this._validateHandoffPackage({
      artifacts,
      key_decisions,
      open_questions,
      risks_identified
    });

    if (!validation.valid) {
      console.log(`   ❌ Invalid handoff: ${validation.errors.join(', ')}`);
      return {
        accepted: false,
        errors: validation.errors,
        status: 'rejected'
      };
    }

    // Store pending handoff for CEO review
    const handoffId = uuidv4();
    const handoff = {
      id: handoffId,
      vp_agent_id: vpAgentId,
      from_stage: fromStage,
      to_stage: fromStage + 1,
      package: {
        artifacts,
        key_decisions,
        open_questions,
        risks_identified
      },
      proposed_at: new Date().toISOString(),
      status: 'pending_review'
    };

    this.pendingHandoffs.set(handoffId, handoff);

    console.log(`   ✅ Handoff ${handoffId} queued for CEO review`);

    return {
      accepted: true,
      handoff_id: handoffId,
      status: 'pending_ceo_review'
    };
  }

  /**
   * CEO reviews and commits stage transition
   * CRITICAL: Only CEO agent type can call this
   */
  async commitStageTransition(commitRequest) {
    const {
      handoffId,
      ceoAgentId,
      decision, // 'approve', 'reject', 'request_changes'
      ceo_notes = ''
    } = commitRequest;

    console.log(`\n🔐 CEO committing stage transition decision: ${decision}`);

    // CRITICAL: Verify caller is CEO
    const isValidCeo = await this._verifyCeoAuthority(ceoAgentId);
    if (!isValidCeo) {
      throw new Error('UNAUTHORIZED: Only CEO agent can commit stage transitions');
    }

    // Get pending handoff
    const handoff = this.pendingHandoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found or already processed`);
    }

    // Process based on decision
    switch (decision) {
      case 'approve':
        return this._approveHandoff(handoff, ceo_notes);

      case 'reject':
        return this._rejectHandoff(handoff, ceo_notes);

      case 'request_changes':
        return this._requestChanges(handoff, ceo_notes);

      default:
        throw new Error(`Invalid decision: ${decision}`);
    }
  }

  /**
   * Approve handoff and advance stage
   * @private
   */
  async _approveHandoff(handoff, ceo_notes) {
    console.log(`   ✅ Approving handoff for stage ${handoff.from_stage}`);

    // Call database function to advance stage
    // This respects gate types and triggers
    const { error } = await this.supabase
      .rpc('fn_advance_venture_stage', {
        p_venture_id: this.ventureId,
        p_from_stage: handoff.from_stage,
        p_to_stage: handoff.to_stage,
        p_handoff_data: {
          ...handoff.package,
          ceo_approval: {
            ceo_agent_id: this.ceoAgentId,
            approved_at: new Date().toISOString(),
            notes: ceo_notes
          }
        }
      });

    if (error) {
      // SD-HARDENING-V2-002B: Structured error logging for RPC failures
      console.error('🚨 GATEWAY RPC FAILURE:', JSON.stringify({
        venture_id: this.ventureId,
        from_stage: handoff.from_stage,
        to_stage: handoff.to_stage,
        error_message: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));

      // SD-HARDENING-V2-002B: Throw on all errors - no fallback to direct updates
      // Vision V2 mandates fn_advance_venture_stage as single gateway for audit trail compliance
      throw new Error(`Stage transition failed: ${error.message}. ` +
        `Venture: ${this.ventureId}, From: ${handoff.from_stage}, To: ${handoff.to_stage}. ` +
        'Gateway fn_advance_venture_stage() is required for audit trail compliance.');
    }

    // Update local state
    this.currentStage = handoff.to_stage;
    this.stageStates.set(handoff.from_stage, { status: 'completed', health_score: 'green' });
    this.pendingHandoffs.delete(handoff.id);

    console.log(`   ✅ Venture advanced to stage ${this.currentStage}`);

    return {
      success: true,
      new_stage: this.currentStage,
      transition_logged: true
    };
  }

  /**
   * Reject handoff
   * @private
   */
  async _rejectHandoff(handoff, ceo_notes) {
    console.log(`   ❌ Rejecting handoff for stage ${handoff.from_stage}`);

    handoff.status = 'rejected';
    handoff.rejection = {
      rejected_at: new Date().toISOString(),
      notes: ceo_notes
    };

    this.pendingHandoffs.delete(handoff.id);

    return {
      success: true,
      status: 'rejected',
      stage_unchanged: this.currentStage
    };
  }

  /**
   * Request changes from VP
   * @private
   */
  async _requestChanges(handoff, ceo_notes) {
    console.log(`   ↩️  Requesting changes for stage ${handoff.from_stage}`);

    handoff.status = 'changes_requested';
    handoff.changes_requested = {
      requested_at: new Date().toISOString(),
      required_changes: ceo_notes
    };

    return {
      success: true,
      status: 'changes_requested',
      required_changes: ceo_notes,
      stage_unchanged: this.currentStage
    };
  }

  /**
   * Verify CEO authority
   * @private
   */
  async _verifyCeoAuthority(agentId) {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('agent_type')
      .eq('id', agentId)
      .single();

    return data?.agent_type === 'venture_ceo';
  }

  /**
   * Validate handoff package completeness
   * @private
   */
  _validateHandoffPackage(pkg) {
    const errors = [];

    // Check required fields exist
    for (const field of REQUIRED_HANDOFF_FIELDS) {
      if (!pkg[field] || (Array.isArray(pkg[field]) && pkg[field].length === 0)) {
        // artifacts and key_decisions are required; others can be empty
        if (field === 'artifacts' || field === 'key_decisions') {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Validate artifacts have required properties
    if (pkg.artifacts) {
      for (const artifact of pkg.artifacts) {
        if (!artifact.type || !artifact.content) {
          errors.push('Artifact missing type or content');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get summary of current state
   */
  getSummary() {
    return {
      venture_id: this.ventureId,
      ceo_agent_id: this.ceoAgentId,
      current_stage: this.currentStage,
      stages_completed: Array.from(this.stageStates.entries())
        .filter(([_, s]) => s.status === 'completed').length,
      pending_handoffs: this.pendingHandoffs.size
    };
  }
}

// Export
export default VentureStateMachine;
