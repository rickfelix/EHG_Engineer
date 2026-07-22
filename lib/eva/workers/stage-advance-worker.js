/**
 * StageAdvanceWorker — Checks for ventures ready to auto-advance
 * through their stage pipeline (stages 1-26). Only advances past
 * non-gate stages; kill/promotion gates require chairman approval.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import { BaseWorker } from './base-worker.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';
import { advanceStage } from '../artifact-persistence-service.js';
import { captureVentureStage } from '../venture-capture-forward.js';
import { resolveMinExtractStage } from '../template-extractor.js';

/**
 * Gate stages that require chairman decision — never auto-advance past these.
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: Stage 19 (Sprint Planning /
 * promotion_gate, also cut over to is_high_consequence) was missing from this
 * set — this worker would auto-advance past it while the daemon's own
 * chokepoints (stage-execution-worker.js, fn_advance_venture_stage) correctly
 * held. Added for parity with those chokepoints (see stage-governance.js /
 * database/migrations/20260716_high_consequence_stage_gates.sql, which both
 * already treat 19 as a promotion/high-consequence gate).
 */
const GATE_STAGES = new Set([3, 5, 13, 16, 17, 19, 21, 22, 23, 24]);

export class StageAdvanceWorker extends BaseWorker {
  constructor(opts = {}) {
    super('stage-advance', { intervalMs: 120_000, ...opts });
  }

  async execute() {
    if (!this.supabase) return;

    // Find workflow executions that are in_progress. Paginated (FR-6 batch 7): this
    // poll SELECTS WORK — a capped read would silently strand executions. Page errors
    // throw (prior `if (error) throw error` policy).
    const readyExecs = await fetchAllPaginated(() => this.supabase
      .from('workflow_executions')
      .select('id, venture_id, current_stage')
      .eq('status', 'in_progress')
      .order('id', { ascending: true }));

    if (!readyExecs?.length) return;

    for (const exec of readyExecs) {
      const nextStage = exec.current_stage + 1;

      // Don't auto-advance past gates or beyond stage 26
      if (GATE_STAGES.has(nextStage) || nextStage > 26) continue;

      // Check if current stage execution is completed
      const { data: currentStageExec } = await this.supabase
        .from('stage_executions')
        .select('status')
        .eq('execution_id', exec.id)
        .eq('stage_number', exec.current_stage)
        .eq('status', 'completed')
        .limit(1);

      if (!currentStageExec?.length) continue;

      // Check no stage execution already exists for next stage
      const { data: existing } = await this.supabase
        .from('stage_executions')
        .select('id')
        .eq('execution_id', exec.id)
        .eq('stage_number', nextStage)
        .limit(1);

      if (existing?.length) continue;

      this._log('advancing', {
        ventureId: exec.venture_id,
        from: exec.current_stage,
        to: nextStage,
      });

      // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: the RPC result is now checked BEFORE
      // any state mutation. Previously this worker raw-updated workflow_executions.
      // current_stage FIRST and only THEN called advanceStage() (which delegates to
      // fn_advance_venture_stage and enforces ALL gates, including the high-consequence
      // blocking gate) -- so a gate-blocked/failed advance still left this worker's own
      // observability pointer pointing at the next stage even though ventures.
      // current_lifecycle_stage (the authoritative store) never moved. advanceStage()
      // throws on any RPC-level block/failure (see its `result.success === false` and
      // error branches); catching it here and skipping the workflow_executions update
      // keeps the two pointers from diverging on a blocked advance, and lets the loop
      // continue to the next execution instead of the whole poll aborting on one
      // blocked venture.
      try {
        await advanceStage(this.supabase, {
          ventureId: exec.venture_id,
          fromStage: exec.current_stage,
          toStage: nextStage,
          handoffData: { source: 'stage-advance-worker', executionId: exec.id },
        });
      } catch (advanceErr) {
        this._log('advance-blocked', {
          ventureId: exec.venture_id,
          from: exec.current_stage,
          to: nextStage,
          error: advanceErr.message,
        });
        continue; // do NOT update workflow_executions.current_stage on a blocked/failed advance
      }

      // Update workflow execution stage — only reached once the RPC confirmed the advance.
      await this.supabase
        .from('workflow_executions')
        .update({
          current_stage: nextStage,
          current_stage_started_at: new Date().toISOString(),
        })
        .eq('id', exec.id);

      // SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (FR-1 forward half): capture the
      // just-completed stage's signal into venture_capture_snapshots (collect-only,
      // never venture_templates). Additive + fail-open: never blocks stage advance.
      if (exec.current_stage >= resolveMinExtractStage()) {
        try {
          await captureVentureStage(this.supabase, exec.venture_id, exec.current_stage);
        } catch (captureErr) {
          this._log('capture-forward-failed', {
            ventureId: exec.venture_id,
            stage: exec.current_stage,
            error: captureErr.message,
          });
        }
      }
    }
  }
}
