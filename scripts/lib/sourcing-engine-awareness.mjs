/**
 * sourcing-engine-awareness.mjs — pure helpers so the coordinator's capacity forecaster
 * (and any belt-low decision path) can surface the SOURCING ENGINE state at the moment it
 * would otherwise hand-ask Adam for manual backfill.
 *
 * SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): a DEFICIT ping must read
 * "engine OFF, N unpromoted -> activate/distill" instead of only "source N candidates", so the
 * FIRST remediation on belt-low is checking engine activation-flag state + unpromoted roadmap
 * depth — NOT perpetual manual sourcing (the anti-pattern).
 *
 * Pure (no DB / no env mutation): the caller reads the flags + queries the unpromoted count and
 * passes them in. The flag-name registry lives here so it is the single place to extend when a
 * new sourcing-engine flag ships.
 */

// The canonical sourcing-engine activation flags (mirrors the per-module isXxxFlagEnabled helpers:
// lib/sourcing-engine/gauge-gap-miner.js, lib/sourcing-engine/deferred-watcher.js). Add new
// sourcing-engine flags here as they ship so the forecaster surfaces them automatically.
// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-2): all THREE live sourcing arms.
// `label` is also the primary key (`arm`) in sourcing_engine_activation_state.
export const SOURCING_ENGINE_FLAGS = Object.freeze([
  Object.freeze({ env: 'SOURCING_GAUGE_GAP_MINER_V1', label: 'gauge-gap-miner' }),
  Object.freeze({ env: 'SOURCING_DEFERRED_WATCHER_V1', label: 'deferred-watcher' }),
  Object.freeze({ env: 'SOURCING_AUTO_REFILL_V1', label: 'auto-refill' }),
]);

// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): the DB source-of-truth table.
export const SOURCING_ACTIVATION_TABLE = 'sourcing_engine_activation_state';

// Same truthiness convention the per-module helpers use: 'on' | '1' | 'true' (case-insensitive).
export function isSourcingFlagOn(value) {
  const v = String(value == null ? 'off' : value).toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

// Read the canonical flags from an env-like object → [{ env, label, enabled }].
export function readSourcingEngineFlags(env = process.env) {
  const e = env || {};
  return SOURCING_ENGINE_FLAGS.map((f) => ({ env: f.env, label: f.label, enabled: isSourcingFlagOn(e[f.env]) }));
}

/**
 * SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): derive each arm's on/off from the DB
 * activation-state row (the actual deployment) instead of the coordinator's LOCAL process.env — which
 * is blind to the GitHub-Actions JOB-scoped sourcing flags and falsely read every arm OFF.
 *
 * Returns the SAME [{ env, label, enabled }] shape as readSourcingEngineFlags (FR-4 contract). An arm
 * with no row reads enabled=false. FAIL-OPEN: on any query error (incl. the table not existing yet,
 * pre-migration), fall back to the env-based reader so shipping this before the governed prod-apply
 * degrades to today's behavior rather than throwing in the forecaster.
 *
 * @param {object} supabase - service-role client
 * @param {object} [env=process.env] - fallback env-like object
 * @returns {Promise<Array<{env:string,label:string,enabled:boolean}>>}
 */
export async function readSourcingEngineFlagsFromDb(supabase, env = process.env) {
  try {
    const { data, error } = await supabase.from(SOURCING_ACTIVATION_TABLE).select('arm, enabled');
    if (error) throw new Error(error.message);
    const byArm = new Map((data || []).map((r) => [r.arm, r.enabled === true]));
    return SOURCING_ENGINE_FLAGS.map((f) => ({ env: f.env, label: f.label, enabled: byArm.get(f.label) === true }));
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[sourcing-awareness] DB flag read failed (${e.message}); falling back to env.\n`);
    }
    return readSourcingEngineFlags(env);
  }
}

/**
 * SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-3): idempotent reconcile — upsert the
 * given arm→enabled state so the DB re-derives from the actual deployment. Pass the live arms on
 * activation/deactivation. Best-effort; returns the count upserted (0 on error).
 *
 * @param {object} supabase - service-role client
 * @param {Record<string,boolean>} stateByArm - e.g. {'gauge-gap-miner':true,'auto-refill':true}
 * @param {string} [updatedBy='reconcile']
 * @returns {Promise<number>}
 */
export async function reconcileSourcingArmState(supabase, stateByArm = {}, updatedBy = 'reconcile') {
  const rows = Object.entries(stateByArm || {}).map(([arm, enabled]) => ({
    arm, enabled: enabled === true, updated_at: new Date().toISOString(), updated_by: updatedBy,
  }));
  if (!rows.length) return 0;
  try {
    const { data, error } = await supabase.from(SOURCING_ACTIVATION_TABLE).upsert(rows, { onConflict: 'arm' }).select('arm');
    if (error) throw new Error(error.message);
    return (data || []).length;
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[sourcing-awareness] reconcile upsert failed (${e.message}).\n`);
    }
    return 0;
  }
}

/**
 * Build the human-readable awareness line + a remediation recommendation.
 * @param {{flags?: Array<{label:string, enabled:boolean}>, unpromotedCount?: number|null}} input
 * @returns {{ line:string, recommendation:string, anyOn:boolean, allOn:boolean, flagStr:string, countStr:string }}
 */
export function formatSourcingAwareness({ flags = [], unpromotedCount = null } = {}) {
  const anyOn = flags.some((f) => f.enabled);
  const allOn = flags.length > 0 && flags.every((f) => f.enabled);
  const flagStr = flags.length ? flags.map((f) => `${f.label}=${f.enabled ? 'on' : 'off'}`).join(', ') : 'none';
  const known = typeof unpromotedCount === 'number' && Number.isFinite(unpromotedCount);
  const countStr = known ? String(unpromotedCount) : 'unknown';
  const hasBacklog = !known || unpromotedCount > 0; // unknown → assume there may be backlog (safer)

  let recommendation;
  if (!anyOn && hasBacklog) {
    // The core anti-pattern guard: dormant engine + rich backlog → activate/distill, do NOT hand-ask.
    recommendation = `engine DORMANT with ${countStr} unpromoted roadmap item(s) → FIRST remediation is to ACTIVATE the engine (flip the SOURCING_* flags + apply the dormant migrations) and/or Wave-0 distillation, escalating to the chairman — perpetual manual backfill is the anti-pattern`;
  } else if (!anyOn && !hasBacklog) {
    recommendation = `engine OFF and 0 unpromoted roadmap items → backlog is genuinely empty; manual sourcing / Wave-0 distillation is appropriate`;
  } else if (hasBacklog) {
    recommendation = `engine partially/fully ON with ${countStr} unpromoted item(s) → let the engine promote/distill the roadmap before any manual hand-ask`;
  } else {
    recommendation = `engine ON, 0 unpromoted → belt-low is real worker demand, not a sourcing gap`;
  }

  return {
    line: `Sourcing engine: ${flagStr} | unpromoted roadmap_wave_items: ${countStr}. ${recommendation}`,
    recommendation,
    anyOn,
    allOn,
    flagStr,
    countStr,
  };
}

/**
 * SD-LEO-INFRA-FORECASTER-DISTILL-GATE-AWARENESS-001 (FR-1/FR-2): when the auto-refill arm is
 * INTENTIONALLY OFF and a belt-low DEFICIT is attributable to an intentionally-unpromoted corpus
 * (unpromotedCount > 0), the deficit is NOT fillable — a corpus-thin belt is the CORRECT state, not a
 * deficit to distill away (the unpromoted corpus is not claimable supply; promotion is gated to /distill).
 * Downgrade the verdict to 'OK-CORPUS-GATED' (so the forecaster's deficit-driven Adam reach-out, gated on
 * verdict.startsWith('DEFICIT'), does not stale-re-fire) and reframe the recommendation so it advises
 * NEITHER distillation NOR activation. A genuine non-corpus shortfall (no unpromoted corpus, OR auto-refill
 * ON) is returned unchanged — only that remains a real DEFICIT. PURE/TOTAL.
 * @param {{verdict?:string, autoRefillOn?:boolean, unpromotedCount?:(number|null), baseRecommendation?:string}} [input]
 * @returns {{ corpusGated:boolean, verdict:string, recommendation:string }}
 */
export function classifyCorpusGatedDeficit({ verdict, autoRefillOn, unpromotedCount, baseRecommendation } = {}) {
  const isDeficit = typeof verdict === 'string' && verdict.startsWith('DEFICIT');
  const corpusThin = autoRefillOn !== true && typeof unpromotedCount === 'number' && unpromotedCount > 0;
  if (isDeficit && corpusThin) {
    return {
      corpusGated: true,
      verdict: 'OK-CORPUS-GATED',
      recommendation: `auto-refill intentionally OFF - corpus-thin belt is EXPECTED; the ${unpromotedCount} unpromoted corpus item(s) are NOT claimable supply (promotion is intentionally gated off). This is NOT a fillable deficit; only a genuine non-corpus claimable shortfall is a deficit - accept brief idle, never corpus promotion.`,
    };
  }
  return { corpusGated: false, verdict, recommendation: baseRecommendation };
}
