/**
 * StageAdvanceWorker — Checks for ventures ready to auto-advance
 * through their stage pipeline (stages 1-25). Only advances past
 * non-gate stages; kill/promotion gates require chairman approval.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import { BaseWorker } from './base-worker.js';

/** Gate stages that require chairman decision — never auto-advance past these */
const GATE_STAGES = new Set([3, 5, 13, 16, 17, 22, 23, 24]);

export class StageAdvanceWorker extends BaseWorker {
  constructor(opts = {}) {
    super('stage-advance', { intervalMs: 120_000, ...opts });
  }

  async execute() {
    if (!this.supabase) return;

    // Find workflow executions that are in_progress
    const { data: readyExecs, error } = await this.supabase
      .from('workflow_executions')
      .select('id, venture_id, current_lifecycle_stage')
      .eq('status', 'in_progress');

    if (error) throw error;
    if (!readyExecs?.length) return;

    for (const exec of readyExecs) {
      const nextStage = exec.current_lifecycle_stage + 1;

      // Don't auto-advance past gates or beyond stage 25
      if (GATE_STAGES.has(nextStage) || nextStage > 25) continue;

      // Check if current stage execution is completed
      const { data: currentStageExec } = await this.supabase
        .from('stage_executions')
        .select('status')
        .eq('execution_id', exec.id)
        .eq('stage_number', exec.current_lifecycle_stage)
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
        from: exec.current_lifecycle_stage,
        to: nextStage,
      });

      // Update workflow execution stage
      await this.supabase
        .from('workflow_executions')
        .update({
          current_lifecycle_stage: nextStage,
          current_stage_started_at: new Date().toISOString(),
        })
        .eq('id', exec.id);

      // Update venture's current_lifecycle_stage
      await this.supabase
        .from('ventures')
        .update({ current_lifecycle_stage: nextStage })
        .eq('id', exec.venture_id);
    }
  }
}
