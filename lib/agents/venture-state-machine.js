/**
 * VentureStateMachine - CEO-owned venture stage transitions
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 10
 *
 * SD-HARDENING-V2-002C: Idempotency & Persistence
 * SD-UNIFIED-PATH-1.2.1: JIT Truth Check Pattern
 * SD-HARDENING-V2-003: Golden Nugget Validation
 *
 * Modularized: See lib/agents/modules/venture-state-machine/ for implementation.
 */

import { createClient } from '@supabase/supabase-js';
import {
  StateStalenessError,
  GoldenNuggetValidationError,
  StageGateValidationError
} from './modules/venture-state-machine/errors.js';
import {
  validateHandoffPackage,
  verifyCeoAuthority,
  approveHandoff,
  rejectHandoff,
  requestChanges,
  getStageRequirements
} from './modules/venture-state-machine/handoff-operations.js';
import { validateContracts } from '../eva/contract-validator.js';
import { executeStage } from '../eva/stage-execution-engine.js';

// Re-export error classes for consumers
export { StateStalenessError, GoldenNuggetValidationError, StageGateValidationError };

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

    this._initialized = false;
    this.currentStage = null;
    this.stageStates = new Map();
    this.pendingHandoffsCache = new Map();
  }

  async initialize() {
    console.log(`\nInitializing state machine for venture ${this.ventureId}`);

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

    await this._loadPendingHandoffs();
    console.log(`   Pending handoffs: ${this.pendingHandoffsCache.size}`);

    this._initialized = true;
    console.log('   State machine initialized (JIT Truth Check enabled)');

    return this;
  }

  async _ensureInitialized() {
    if (!this._initialized) {
      console.log('   State machine not initialized, rehydrating from database...');
      await this.initialize();
    }
  }

  async verifyStateFreshness() {
    const { data: venture, error } = await this.supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', this.ventureId)
      .single();

    if (error) {
      throw new Error(`JIT Truth Check failed: ${error.message}`);
    }

    const dbStage = venture.current_lifecycle_stage;

    if (dbStage !== this.currentStage) {
      console.warn(`   STALE STATE DETECTED: cache=${this.currentStage}, db=${dbStage}`);
      await this.initialize();

      throw new StateStalenessError(
        'State cache invalidated. Rehydration complete, please retry.',
        {
          cachedStage: this.currentStage,
          dbStage: dbStage,
          ventureId: this.ventureId
        }
      );
    }

    return true;
  }

  async _loadPendingHandoffs() {
    const { data: pendingHandoffs, error } = await this.supabase
      .from('pending_ceo_handoffs')
      .select('*')
      .eq('venture_id', this.ventureId)
      .eq('status', 'pending');

    if (error) {
      console.warn(`   Failed to load pending handoffs: ${error.message}`);
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

  getStageRequirements(stageId) {
    return getStageRequirements(stageId);
  }

  getCurrentStage() {
    return this.currentStage;
  }

  getStageState(stageId) {
    return this.stageStates.get(stageId) || { status: 'pending', health_score: null };
  }

  async proposeHandoff(proposal) {
    await this._ensureInitialized();
    await this.verifyStateFreshness();

    const {
      vpAgentId,
      fromStage,
      artifacts = [],
      key_decisions = [],
      open_questions = [],
      risks_identified = []
    } = proposal;

    console.log(`\nHandoff proposal received from VP for stage ${fromStage}`);

    const validation = validateHandoffPackage({
      artifacts,
      key_decisions,
      open_questions,
      risks_identified
    });

    if (!validation.valid) {
      console.log(`   Invalid handoff: ${validation.errors.join(', ')}`);
      return { accepted: false, errors: validation.errors, status: 'rejected' };
    }

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
        console.error(`   Failed to persist handoff: ${error.message}`);
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

      console.log(`   Handoff ${handoffId} persisted and queued for CEO review`);
      return { accepted: true, handoff_id: handoffId, status: 'pending_ceo_review' };
    } catch (err) {
      console.error(`   Unexpected error: ${err.message}`);
      return { accepted: false, errors: [err.message], status: 'rejected' };
    }
  }

  async commitStageTransition(commitRequest) {
    await this._ensureInitialized();
    await this.verifyStateFreshness();

    const { handoffId, ceoAgentId, decision, ceo_notes = '' } = commitRequest;

    console.log(`\nCEO committing stage transition decision: ${decision}`);

    const isValidCeo = await verifyCeoAuthority(this.supabase, ceoAgentId);
    if (!isValidCeo) {
      throw new Error('UNAUTHORIZED: Only CEO agent can commit stage transitions');
    }

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

    const context = {
      supabase: this.supabase,
      ventureId: this.ventureId,
      ceoAgentId: this.ceoAgentId,
      currentStage: this.currentStage,
      verifyStateFreshness: () => this.verifyStateFreshness(),
      updateLocalState: (h) => {
        this.currentStage = h.to_stage;
        this.stageStates.set(h.from_stage, { status: 'completed', health_score: 'green' });
        this.pendingHandoffsCache.delete(h.id);
      },
      removeFromCache: (id) => this.pendingHandoffsCache.delete(id),
      updateCacheStatus: (id, status) => {
        const cached = this.pendingHandoffsCache.get(id);
        if (cached) {
          cached.status = status;
          this.pendingHandoffsCache.set(id, cached);
        }
      }
    };

    // SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-001: Contract validation pre-check (advisory)
    if (decision === 'approve') {
      try {
        const contracts = await validateContracts({
          targetStage: handoff.to_stage,
          ventureId: this.ventureId,
          supabase: this.supabase,
        });
        if (!contracts.passed) {
          console.log(`   ⚠️  Contract validation: ${contracts.missingContracts.length} missing upstream artifact(s)`);
          for (const m of contracts.missingContracts) {
            console.log(`      Stage ${m.stage}: ${m.reason}`);
          }
        } else {
          console.log(`   ✅ Contract validation: all ${contracts.requiredStages.length} upstream contracts satisfied`);
        }
      } catch (err) {
        console.warn(`   ⚠️  Contract validation skipped: ${err.message}`);
      }
    }

    switch (decision) {
      case 'approve': {
        const result = await approveHandoff(context, handoff, ceo_notes);

        // SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-001: Execute analysisStep after approval
        if (result.accepted) {
          try {
            const execResult = await executeStage({
              stageNumber: handoff.to_stage,
              ventureId: this.ventureId,
              supabase: this.supabase,
              logger: { log: () => {}, warn: console.warn, error: console.error },
            });
            if (execResult.persisted) {
              console.log(`   ✅ Stage ${handoff.to_stage} analysisStep executed, artifact: ${execResult.artifactId}`);
            }
          } catch (err) {
            console.warn(`   ⚠️  Stage execution skipped: ${err.message}`);
          }
        }

        return result;
      }
      case 'reject':
        return rejectHandoff(context, handoff, ceo_notes);
      case 'request_changes':
        return requestChanges(context, handoff, ceo_notes);
      default:
        throw new Error(`Invalid decision: ${decision}`);
    }
  }

  getSummary() {
    return {
      venture_id: this.ventureId,
      ceo_agent_id: this.ceoAgentId,
      current_lifecycle_stage: this.currentStage,
      stages_completed: Array.from(this.stageStates.entries())
        .filter(([_, s]) => s.status === 'completed').length,
      pending_handoffs: this.pendingHandoffsCache.size
    };
  }

  async getPendingHandoffs() {
    const { data, error } = await this.supabase
      .rpc('fn_get_pending_handoffs', { p_venture_id: this.ventureId });

    if (error) {
      console.warn(`   Failed to get pending handoffs: ${error.message}`);
      return Array.from(this.pendingHandoffsCache.values());
    }

    return data || [];
  }
}

export default VentureStateMachine;
