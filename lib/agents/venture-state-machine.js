/**
 * VentureStateMachine - CEO-owned venture stage transitions
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 10
 *
 * SD-HARDENING-V2-002C: Idempotency & Persistence
 * - Pending handoffs now persisted to pending_ceo_handoffs table
 * - fn_advance_venture_stage supports idempotency_key for duplicate prevention
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

    // In-memory state cache (source of truth is database)
    this.currentStage = null;
    this.stageStates = new Map();
    // SD-HARDENING-V2-002C: pendingHandoffs now backed by pending_ceo_handoffs table
    this.pendingHandoffsCache = new Map();
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

    // SD-HARDENING-V2-002C: Load pending handoffs from database
    await this._loadPendingHandoffs();
    console.log(`   Pending handoffs: ${this.pendingHandoffsCache.size}`);

    return this;
  }

  /**
   * Load pending handoffs from database into cache
   * SD-HARDENING-V2-002C: Database-backed persistence
   * @private
   */
  async _loadPendingHandoffs() {
    const { data: pendingHandoffs, error } = await this.supabase
      .from('pending_ceo_handoffs')
      .select('*')
      .eq('venture_id', this.ventureId)
      .eq('status', 'pending');

    if (error) {
      console.warn(`   ⚠️  Failed to load pending handoffs: ${error.message}`);
      return;
    }

    this.pendingHandoffsCache.clear();
    if (pendingHandoffs) {
      for (const handoff of pendingHandoffs) {
        this.pendingHandoffsCache.set(handoff.id, {
          id: handoff.id,
          vp_agent_id: handoff.vp_agent_id,
          from_stage: handoff.from_stage,
          to_stage: handoff.to_stage,
          package: handoff.handoff_data,
          proposed_at: handoff.proposed_at,
          status: handoff.status
        });
      }
    }
  }

  getCurrentStage() {
    return this.currentStage;
  }

  getStageState(stageId) {
    return this.stageStates.get(stageId) || { status: 'pending', health_score: null };
  }

  /**
   * VP proposes handoff - CEO must review and commit
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

    const validation = this._validateHandoffPackage({
      artifacts,
      key_decisions,
      open_questions,
      risks_identified
    });

    if (!validation.valid) {
      console.log(`   ❌ Invalid handoff: ${validation.errors.join(', ')}`);
      return { accepted: false, errors: validation.errors, status: 'rejected' };
    }

    // SD-HARDENING-V2-002C: Persist handoff to database
    const handoffPackage = { artifacts, key_decisions, open_questions, risks_identified };

    try {
      const { data: handoffId, error } = await this.supabase
        .rpc('fn_create_pending_handoff', {
          p_venture_id: this.ventureId,
          p_from_stage: fromStage,
          p_to_stage: fromStage + 1,
          p_vp_agent_id: vpAgentId,
          p_handoff_data: handoffPackage
        });

      if (error) {
        console.error(`   ❌ Failed to persist handoff: ${error.message}`);
        return { accepted: false, errors: [`Database persistence failed: ${error.message}`], status: 'rejected' };
      }

      this.pendingHandoffsCache.set(handoffId, {
        id: handoffId,
        vp_agent_id: vpAgentId,
        from_stage: fromStage,
        to_stage: fromStage + 1,
        package: handoffPackage,
        proposed_at: new Date().toISOString(),
        status: 'pending'
      });

      console.log(`   ✅ Handoff ${handoffId} persisted and queued for CEO review`);
      return { accepted: true, handoff_id: handoffId, status: 'pending_ceo_review' };
    } catch (err) {
      console.error(`   ❌ Unexpected error: ${err.message}`);
      return { accepted: false, errors: [err.message], status: 'rejected' };
    }
  }

  /**
   * CEO reviews and commits stage transition
   */
  async commitStageTransition(commitRequest) {
    const { handoffId, ceoAgentId, decision, ceo_notes = '' } = commitRequest;

    console.log(`\n🔐 CEO committing stage transition decision: ${decision}`);

    const isValidCeo = await this._verifyCeoAuthority(ceoAgentId);
    if (!isValidCeo) {
      throw new Error('UNAUTHORIZED: Only CEO agent can commit stage transitions');
    }

    // SD-HARDENING-V2-002C: Check cache first, then database
    let handoff = this.pendingHandoffsCache.get(handoffId);
    if (!handoff) {
      const { data, error } = await this.supabase
        .from('pending_ceo_handoffs')
        .select('*')
        .eq('id', handoffId)
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        throw new Error(`Handoff ${handoffId} not found or already processed`);
      }

      handoff = {
        id: data.id,
        vp_agent_id: data.vp_agent_id,
        from_stage: data.from_stage,
        to_stage: data.to_stage,
        package: data.handoff_data,
        proposed_at: data.proposed_at,
        status: data.status
      };
    }

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
   * SD-HARDENING-V2-002C: Added idempotency support
   * @private
   */
  async _approveHandoff(handoff, ceo_notes) {
    console.log(`   ✅ Approving handoff for stage ${handoff.from_stage}`);

    const idempotencyKey = uuidv4();

    const { data: result, error } = await this.supabase
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
        },
        p_idempotency_key: idempotencyKey
      });

    if (error) {
      console.error('🚨 GATEWAY RPC FAILURE:', JSON.stringify({
        venture_id: this.ventureId,
        from_stage: handoff.from_stage,
        to_stage: handoff.to_stage,
        idempotency_key: idempotencyKey,
        error_message: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));

      throw new Error(`Stage transition failed: ${error.message}. ` +
        `Venture: ${this.ventureId}, From: ${handoff.from_stage}, To: ${handoff.to_stage}. ` +
        'Gateway fn_advance_venture_stage() is required for audit trail compliance.');
    }

    const wasDuplicate = result?.was_duplicate === true;
    if (wasDuplicate) {
      console.log('   ℹ️  Duplicate transition detected (idempotent) - no action taken');
    }

    // Resolve pending handoff in database
    await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'approved',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    this.currentStage = handoff.to_stage;
    this.stageStates.set(handoff.from_stage, { status: 'completed', health_score: 'green' });
    this.pendingHandoffsCache.delete(handoff.id);

    console.log(`   ✅ Venture advanced to stage ${this.currentStage}`);

    return {
      success: true,
      was_duplicate: wasDuplicate,
      new_stage: this.currentStage,
      transition_logged: true,
      idempotency_key: result?.idempotency_key || idempotencyKey
    };
  }

  /**
   * Reject handoff
   * SD-HARDENING-V2-002C: Persist rejection to database
   * @private
   */
  async _rejectHandoff(handoff, ceo_notes) {
    console.log(`   ❌ Rejecting handoff for stage ${handoff.from_stage}`);

    const { error } = await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'rejected',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    if (error) {
      console.warn(`   ⚠️  Failed to persist rejection: ${error.message}`);
    }

    this.pendingHandoffsCache.delete(handoff.id);
    return { success: true, status: 'rejected', stage_unchanged: this.currentStage };
  }

  /**
   * Request changes from VP
   * SD-HARDENING-V2-002C: Persist changes_requested to database
   * @private
   */
  async _requestChanges(handoff, ceo_notes) {
    console.log(`   ↩️  Requesting changes for stage ${handoff.from_stage}`);

    const { error } = await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'changes_requested',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    if (error) {
      console.warn(`   ⚠️  Failed to persist changes_requested: ${error.message}`);
    }

    handoff.status = 'changes_requested';
    this.pendingHandoffsCache.set(handoff.id, handoff);

    return {
      success: true,
      status: 'changes_requested',
      required_changes: ceo_notes,
      stage_unchanged: this.currentStage
    };
  }

  async _verifyCeoAuthority(agentId) {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('agent_type')
      .eq('id', agentId)
      .single();

    return data?.agent_type === 'venture_ceo';
  }

  _validateHandoffPackage(pkg) {
    const errors = [];

    for (const field of REQUIRED_HANDOFF_FIELDS) {
      if (!pkg[field] || (Array.isArray(pkg[field]) && pkg[field].length === 0)) {
        if (field === 'artifacts' || field === 'key_decisions') {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (pkg.artifacts) {
      for (const artifact of pkg.artifacts) {
        if (!artifact.type || !artifact.content) {
          errors.push('Artifact missing type or content');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getSummary() {
    return {
      venture_id: this.ventureId,
      ceo_agent_id: this.ceoAgentId,
      current_stage: this.currentStage,
      stages_completed: Array.from(this.stageStates.entries())
        .filter(([_, s]) => s.status === 'completed').length,
      pending_handoffs: this.pendingHandoffsCache.size
    };
  }

  async getPendingHandoffs() {
    const { data, error } = await this.supabase
      .rpc('fn_get_pending_handoffs', { p_venture_id: this.ventureId });

    if (error) {
      console.warn(`   ⚠️  Failed to get pending handoffs: ${error.message}`);
      return Array.from(this.pendingHandoffsCache.values());
    }

    return data || [];
  }
}

export default VentureStateMachine;
