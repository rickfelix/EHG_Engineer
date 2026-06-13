// @wire-check-exempt: continuity lib — pure evaluateDegradationRung is consumed by spike-rehearsal.mjs
// (npm: continuity:spike-rehearsal) + the unit test; detectFromDb is invoked by the runbook/CLI.
/**
 * LLM degradation detector + fallback ladder — SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-3, closes G4).
 *
 * Reuses the live `llm_canary_state` substrate (migration 20260206_llm_canary_routing.sql) as the
 * Anthropic-cap / model-availability degradation signal and maps it to a fallback-ladder rung:
 *   NORMAL → SINGLE_SESSION → MODEL_FALLBACK → PAUSE_AND_SURFACE (degraded-safe-mode floor)
 * See docs/03_protocols_and_standards/anthropic-cap-contingency.md.
 *
 * evaluateDegradationRung is PURE (no I/O, no DB write, no chairman-reserved mutation) so it is fully
 * unit-testable and can never itself cause a regression. detectFromDb is a thin read-only wrapper.
 *
 * Fail-direction: an ALL-UNKNOWN canary (never probed) returns NORMAL — we do not pause a healthy
 * fleet on missing data. But a probe that WAS running and went stale, or definite rollback/failure
 * signals, DO degrade (conservative where we have evidence of trouble).
 */

export const RUNG = Object.freeze({
  NORMAL: 'NORMAL',
  SINGLE_SESSION: 'SINGLE_SESSION',
  MODEL_FALLBACK: 'MODEL_FALLBACK',
  PAUSE_AND_SURFACE: 'PAUSE_AND_SURFACE',
});

/** Default liveness window (ms): a quality probe that last checked longer ago than this is "stale". */
export const DEFAULT_LIVENESS_STALE_MS = 30 * 60 * 1000; // 30 min

const numOrNull = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Evaluate the fallback-ladder rung from a llm_canary_state row. PURE.
 *
 * @param {object} state - a llm_canary_state row (or null)
 * @param {number} nowMs - current time in ms (inject for testability; never reads the clock itself)
 * @param {object} [opts]
 * @param {number} [opts.livenessStaleMs=DEFAULT_LIVENESS_STALE_MS]
 * @returns {{rung:string, reason:string, signals:object}}
 */
export function evaluateDegradationRung(state, nowMs, opts = {}) {
  const livenessStaleMs = numOrNull(opts.livenessStaleMs) ?? DEFAULT_LIVENESS_STALE_MS;
  if (!state || typeof state !== 'object') {
    return { rung: RUNG.NORMAL, reason: 'no canary state row — assume healthy (do not disrupt)', signals: {} };
  }

  const status = typeof state.status === 'string' ? state.status : null;
  const errRate = numOrNull(state.current_error_rate);
  const errThreshold = numOrNull(state.error_rate_threshold) ?? 0.05;
  const latP95 = numOrNull(state.current_latency_p95_ms);
  const baseLat = numOrNull(state.baseline_latency_p95_ms);
  const latMult = numOrNull(state.latency_multiplier_threshold) ?? 2.0;
  const consecFail = numOrNull(state.consecutive_failures) ?? 0;
  const failLimit = numOrNull(state.failures_before_rollback) ?? 3;

  let lastCheckMs = null;
  if (state.last_quality_check_at) {
    const t = Date.parse(state.last_quality_check_at);
    if (Number.isFinite(t)) lastCheckMs = t;
  }
  const livenessStale = lastCheckMs != null && Number.isFinite(nowMs) && (nowMs - lastCheckMs) > livenessStaleMs;

  const errorDegraded = errRate != null && errRate > errThreshold;
  const latencyDegraded = latP95 != null && baseLat != null && baseLat > 0 && latP95 > baseLat * latMult;
  const signals = { status, errRate, errThreshold, latP95, baseLat, latMult, consecFail, failLimit, livenessStale, errorDegraded, latencyDegraded };

  // Highest (most-degraded) rung wins. Precedence is explicit.
  if (status === 'rolled_back' || consecFail >= failLimit) {
    return { rung: RUNG.PAUSE_AND_SURFACE, reason: status === 'rolled_back' ? 'canary rolled_back' : `consecutive_failures ${consecFail} >= limit ${failLimit}`, signals };
  }
  if (errorDegraded) {
    return { rung: RUNG.MODEL_FALLBACK, reason: `error_rate ${errRate} > threshold ${errThreshold}`, signals };
  }
  if (latencyDegraded || livenessStale) {
    return { rung: RUNG.SINGLE_SESSION, reason: latencyDegraded ? `latency_p95 ${latP95}ms > ${latMult}x baseline ${baseLat}ms` : 'quality probe went stale (liveness)', signals };
  }
  return { rung: RUNG.NORMAL, reason: 'all signals healthy', signals };
}

/** Is this rung the degraded-safe-mode floor (freeze new work, hold intake, surface)? */
export function isDegradedSafeMode(rung) {
  return rung === RUNG.PAUSE_AND_SURFACE;
}

/**
 * Read-only DB wrapper: load the singleton llm_canary_state row and evaluate the rung.
 * Does NOT write (no chairman-reserved mutation, no false transition into the stage-typed
 * llm_canary_transitions table). Returns NORMAL if the substrate is absent/unreadable (fail-open).
 * @param {object} supabase
 * @param {number} nowMs
 */
export async function detectFromDb(supabase, nowMs, opts = {}) {
  try {
    const { data, error } = await supabase
      .from('llm_canary_state')
      .select('status, current_error_rate, error_rate_threshold, current_latency_p95_ms, baseline_latency_p95_ms, latency_multiplier_threshold, consecutive_failures, failures_before_rollback, last_quality_check_at')
      .limit(1)
      .maybeSingle();
    if (error) return { rung: RUNG.NORMAL, reason: `canary read error (fail-open): ${error.message}`, signals: {} };
    return evaluateDegradationRung(data, nowMs, opts);
  } catch (e) {
    return { rung: RUNG.NORMAL, reason: `canary read threw (fail-open): ${e.message}`, signals: {} };
  }
}
