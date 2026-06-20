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
export const SOURCING_ENGINE_FLAGS = Object.freeze([
  Object.freeze({ env: 'SOURCING_GAUGE_GAP_MINER_V1', label: 'gauge-gap-miner' }),
  Object.freeze({ env: 'SOURCING_DEFERRED_WATCHER_V1', label: 'deferred-watcher' }),
]);

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
