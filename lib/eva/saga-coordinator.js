/**
 * SagaCoordinator - Compensation Pattern for Eva Orchestrator
 *
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-F
 *
 * Wraps multi-step operations (persist artifacts, advance stage) with
 * compensation functions to prevent data corruption on partial failures.
 *
 * If persist succeeds but advance fails:
 *   - Artifacts are marked is_current:false (compensation)
 *   - Failure is logged to eva_saga_log
 *
 * @module lib/eva/saga-coordinator
 */

import { randomUUID } from 'crypto';

// ── Constants ───────────────────────────────────────────────

export const MODULE_VERSION = '1.0.0';

const SAGA_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated',
  FAILED: 'failed',
});

// ── SagaCoordinator ─────────────────────────────────────────

export class SagaCoordinator {
  /**
   * @param {Object} [options]
   * @param {string} [options.traceId] - Link to OrchestratorTracer trace
   * @param {string} [options.ventureId] - Venture context
   * @param {Object} [options.logger] - Logger (defaults to console)
   */
  constructor(options = {}) {
    this.sagaId = randomUUID();
    this.traceId = options.traceId || null;
    this.ventureId = options.ventureId || null;
    this.logger = options.logger || console;
    this.steps = [];
    this._completedSteps = [];
    this._status = SAGA_STATUS.PENDING;
    this._startedAt = Date.now();
  }

  /**
   * Register a saga step with its action and compensation.
   *
   * @param {string} name - Step name
   * @param {Function} action - Async function to execute
   * @param {Function} compensate - Async function to undo the action
   * @returns {SagaCoordinator} this (for chaining)
   */
  addStep(name, action, compensate) {
    this.steps.push({ name, action, compensate });
    return this;
  }

  /**
   * Execute all registered steps in order.
   * On failure, compensate previously completed steps in reverse order.
   *
   * @returns {Promise<{ success: boolean, sagaId: string, completedSteps: string[], failedStep?: string, error?: string, compensationErrors: string[] }>}
   */
  async execute() {
    this._status = SAGA_STATUS.PENDING;
    this._completedSteps = [];
    const compensationErrors = [];

    for (const step of this.steps) {
      try {
        await step.action();
        this._completedSteps.push(step);
      } catch (err) {
        this.logger.warn(`[Saga] Step "${step.name}" failed: ${err.message}`);

        // Compensate in reverse order
        this._status = SAGA_STATUS.COMPENSATING;
        for (let i = this._completedSteps.length - 1; i >= 0; i--) {
          const completedStep = this._completedSteps[i];
          try {
            await completedStep.compensate();
            this.logger.log(`[Saga] Compensated step "${completedStep.name}"`);
          } catch (compErr) {
            this.logger.error(`[Saga] Compensation failed for "${completedStep.name}": ${compErr.message}`);
            compensationErrors.push(`${completedStep.name}: ${compErr.message}`);
          }
        }

        this._status = compensationErrors.length > 0 ? SAGA_STATUS.FAILED : SAGA_STATUS.COMPENSATED;

        return {
          success: false,
          sagaId: this.sagaId,
          completedSteps: this._completedSteps.map(s => s.name),
          failedStep: step.name,
          error: err.message,
          compensationErrors,
        };
      }
    }

    this._status = SAGA_STATUS.COMPLETED;
    return {
      success: true,
      sagaId: this.sagaId,
      completedSteps: this._completedSteps.map(s => s.name),
      compensationErrors: [],
    };
  }

  /**
   * Get current saga status.
   *
   * @returns {string}
   */
  getStatus() {
    return this._status;
  }

  /**
   * Persist saga execution log to eva_saga_log table.
   *
   * @param {Object} db - Supabase client
   * @param {Object} result - Result from execute()
   * @returns {Promise<{ persisted: boolean, id?: string, error?: string }>}
   */
  async persistLog(db, result) {
    if (!db) {
      return { persisted: false, error: 'No database client provided' };
    }

    try {
      const { data, error } = await db
        .from('eva_saga_log')
        .insert({
          saga_id: this.sagaId,
          trace_id: this.traceId,
          venture_id: this.ventureId,
          status: this._status,
          steps_registered: this.steps.map(s => s.name),
          steps_completed: result.completedSteps || [],
          failed_step: result.failedStep || null,
          error_message: result.error || null,
          compensation_errors: result.compensationErrors || [],
          duration_ms: Date.now() - this._startedAt,
          metadata: {
            module_version: MODULE_VERSION,
          },
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn(`[Saga] Log persist failed: ${error.message}`);
        return { persisted: false, error: error.message };
      }

      return { persisted: true, id: data.id };
    } catch (err) {
      this.logger.warn(`[Saga] Log persist error: ${err.message}`);
      return { persisted: false, error: err.message };
    }
  }
}

// ── Compensation Helpers ────────────────────────────────────

/**
 * Create a compensation function that marks artifacts as not current.
 *
 * @param {Object} db - Supabase client
 * @param {string[]} artifactIds - IDs of artifacts to roll back
 * @returns {Function}
 */
export function createArtifactCompensation(db, artifactIds) {
  return async () => {
    if (!db || !artifactIds || artifactIds.length === 0) return;
    const { error } = await db
      .from('venture_artifacts')
      .update({ is_current: false })
      .in('id', artifactIds);
    if (error) throw new Error(`Artifact compensation failed: ${error.message}`);
  };
}

/**
 * Create a compensation function that reverts stage advancement.
 *
 * @param {Object} db - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} previousStage - Stage to revert to
 * @returns {Function}
 */
export function createStageCompensation(db, ventureId, previousStage) {
  return async () => {
    if (!db || !ventureId) return;
    const { error } = await db
      .from('ventures')
      .update({ current_lifecycle_stage: previousStage })
      .eq('id', ventureId);
    if (error) throw new Error(`Stage compensation failed: ${error.message}`);
  };
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a SagaCoordinator instance.
 *
 * @param {Object} [options] - See SagaCoordinator constructor
 * @returns {SagaCoordinator}
 */
export function createSagaCoordinator(options = {}) {
  return new SagaCoordinator(options);
}

// ── Exported for testing ────────────────────────────────────

export const _internal = {
  SAGA_STATUS,
};
