/**
 * Canary probe core — PURE helpers (no fs/DB/network/clock).
 * SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001.
 *
 * The synthetic canary venture probe drives an isolated is_demo venture
 * through the venture-factory stage machinery and classifies every stage so
 * regressions (config drift, RPC failures, renderer crashes, contract
 * mismatches) surface BEFORE a real venture hits them.
 */

/** Stable identity marker for THE canary venture (idempotent find-or-create). */
export const CANARY_KEY = 'CANARY-VENTURE-PROBE-001';

/** The feature flag gating scheduled probe runs. */
export const CANARY_FLAG = 'CANARY_VENTURE_PROBE_V1';

/**
 * Stages with HARD external dependencies (GitHub repo/Replit provisioning,
 * live deployment, launch comms, analytics) — confirmed in code during LEAD
 * validation (stage-execution-worker S18 buildReadiness / S19 build gate,
 * stage 23-26 launch/metrics surfaces). The probe never attempts these; they
 * are reported as external_skip so coverage stays honest.
 */
export const EXTERNAL_DEP_STAGES = new Set([18, 19, 23, 24, 25, 26]);

/** Probe result statuses. */
export const STAGE_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  BLOCKED: 'blocked',
  EXTERNAL_SKIP: 'external_skip',
  NOT_REACHED: 'not_reached',
});

/**
 * Build the probe run id. Clock injected for testability (no Date.now here).
 * @param {Date} now
 * @param {string} shortId - short random suffix supplied by the runner
 */
export function buildRunId(now, shortId) {
  return `canary-${now.toISOString().slice(0, 10)}-${shortId}`;
}

/**
 * Alert dedup key: ONE alert per stage per UTC-day window. A same-day re-run
 * that fails the same stage must not duplicate the alert.
 * @param {number} stage
 * @param {Date} now
 */
export function alertDedupKey(stage, now) {
  return `canary_probe_alert:stage-${stage}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Classify a stage_executions row into a probe stage result.
 * @param {{lifecycle_stage:number, status:string, started_at?:string, completed_at?:string, error_message?:string}} row
 */
export function classifyExecutionRow(row) {
  const duration =
    row.started_at && row.completed_at
      ? Date.parse(row.completed_at) - Date.parse(row.started_at)
      : null;
  const base = { stage: row.lifecycle_stage, duration_ms: duration };
  const s = String(row.status || '').toLowerCase();
  // 'succeeded' is the live stage_executions value (witnessed in the first
  // canary run); the others are defensive aliases.
  if (s === 'succeeded' || s === 'completed' || s === 'success' || s === 'passed') {
    return { ...base, status: STAGE_STATUS.PASS };
  }
  if (s === 'failed' || s === 'error') {
    return { ...base, status: STAGE_STATUS.FAIL, error: row.error_message || 'stage execution failed' };
  }
  // running/pending/blocked/anything-else at probe end = blocked
  return { ...base, status: STAGE_STATUS.BLOCKED, error: row.error_message || `terminal status: ${row.status}` };
}

/**
 * Shape the final run report from observed per-stage results.
 *
 * @param {Object} opts
 * @param {string} opts.runId
 * @param {Date} opts.startedAt
 * @param {Date} opts.endedAt
 * @param {number} opts.startStage - venture stage at run start
 * @param {number} opts.endStage - venture stage at run end
 * @param {Array} opts.stageResults - classified results (classifyExecutionRow output)
 * @param {number} opts.maxStage - run bound (--max-stages or the external-dep frontier)
 * @param {Object} [opts.rowDelta] - net-zero audit {table: countDelta}
 */
export function buildRunReport({ runId, startedAt, endedAt, startStage, endStage, stageResults, maxStage, rowDelta }) {
  const attempted = stageResults.filter(r => r.status !== STAGE_STATUS.EXTERNAL_SKIP);
  const failures = stageResults.filter(r => r.status === STAGE_STATUS.FAIL);
  const blocked = stageResults.filter(r => r.status === STAGE_STATUS.BLOCKED);
  // External-skip frontier: anything in EXTERNAL_DEP_STAGES within the bound
  // that the venture reached but the probe refused to attempt.
  return {
    run_id: runId,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt - startedAt,
    start_stage: startStage,
    end_stage: endStage,
    max_stage: maxStage,
    stages: stageResults,
    summary: {
      attempted: attempted.length,
      passed: stageResults.filter(r => r.status === STAGE_STATUS.PASS).length,
      failed: failures.length,
      blocked: blocked.length,
      external_skipped: stageResults.filter(r => r.status === STAGE_STATUS.EXTERNAL_SKIP).length,
    },
    outcome: failures.length > 0 ? 'FAIL' : blocked.length > 0 ? 'BLOCKED' : 'PASS',
    row_delta: rowDelta || null,
  };
}

/**
 * Decide whether the probe may run.
 * @param {{flagEnabled:boolean, forceLocal:boolean}} opts
 * @returns {{allowed:boolean, reason:string}}
 */
export function probeAdmission({ flagEnabled, forceLocal }) {
  if (flagEnabled) return { allowed: true, reason: 'flag_enabled' };
  if (forceLocal) return { allowed: true, reason: 'force_local_override' };
  return {
    allowed: false,
    reason: `flag ${CANARY_FLAG} is disabled — enable it (standard registry flow) or pass --force-local for a local verification run`,
  };
}

/**
 * The next stage the probe should drive toward, honoring the external-dep
 * frontier and the --max-stages bound.
 * @param {number} currentStage
 * @param {number} maxStage
 * @returns {{action:'drive'|'external_skip'|'done', stage:number}}
 */
export function nextAction(currentStage, maxStage) {
  if (currentStage > maxStage) return { action: 'done', stage: currentStage };
  if (EXTERNAL_DEP_STAGES.has(currentStage)) return { action: 'external_skip', stage: currentStage };
  return { action: 'drive', stage: currentStage };
}
