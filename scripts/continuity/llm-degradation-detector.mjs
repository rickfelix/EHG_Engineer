// @wire-check-exempt: continuity lib — pure evaluateDegradationRung is consumed by spike-rehearsal.mjs
// (npm: continuity:spike-rehearsal) + the unit test; detectFromDb is invoked by the runbook/CLI.
/**
 * LLM degradation detector + fallback ladder — SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-3).
 *
 * evaluateDegradationRung is a SOURCE-AGNOSTIC, PURE evaluator: given a health-signal row shaped like
 * { current_error_rate, error_rate_threshold, current_latency_p95_ms, baseline_latency_p95_ms,
 *   latency_multiplier_threshold, consecutive_failures, failures_before_rollback, last_quality_check_at,
 *   status } it maps the signals to a fallback-ladder rung:
 *   NORMAL → SINGLE_SESSION → MODEL_FALLBACK → PAUSE_AND_SURFACE (degraded-safe-mode floor)
 * It is PURE (no I/O, no DB write, no chairman-reserved mutation), fully unit-testable, and can never
 * itself cause a regression. See docs/03_protocols_and_standards/anthropic-cap-contingency.md.
 *
 * SIGNAL-SOURCE CAVEAT (read before wiring this live): detectFromDb currently reads the existing
 * `llm_canary_state` row (migration 20260206_llm_canary_routing.sql). That row is the LOCAL-MODEL
 * rollout canary — its quality columns measure a local model against the Anthropic cloud CONTROL, it
 * is dormant (paused, stage 0, NULL columns) with NO writer, and its `status='rolled_back'` means
 * "local leg abandoned → back to the HEALTHY Anthropic cloud" — the INVERSE of a cloud-cap event.
 * So as-wired against that substrate the detector reads NORMAL in production. The validated FR-3
 * deliverable is the evaluator + the documented ladder + the rehearsal; LIVE production detection is
 * a NAMED, DEFERRED follow-up: a cloud-health feeder that stamps current_error_rate /
 * current_latency_p95_ms / last_quality_check_at (and increments consecutive_failures) from REAL
 * Anthropic API outcomes (429 / 5xx) onto a row this evaluator reads.
 *
 * Fail-direction: an ALL-UNKNOWN row (never probed) returns NORMAL — we do not pause a healthy fleet
 * on missing data. Only definite signals from an ACTIVELY-PROBING source degrade.
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
  // PAUSE only on an ACTIVELY-PROBING source's failure counter. We deliberately do NOT treat
  // status==='rolled_back' as degradation: on the live llm_canary_state (a local-model rollout
  // canary) rolled_back means the local leg was abandoned and traffic returned to the HEALTHY
  // Anthropic cloud — the inverse of a cloud-cap event. And consecutive_failures is reset (never
  // incremented) on a paused/idle row, so guarding on status==='rolling' stops a stale singleton
  // from pinning PAUSE on a quiescent fleet (false-pause). A real cloud-health feeder must set
  // status='rolling' while probing for this trigger to fire.
  const probeActive = status === 'rolling';
  if (probeActive && consecFail >= failLimit) {
    return { rung: RUNG.PAUSE_AND_SURFACE, reason: `consecutive_failures ${consecFail} >= limit ${failLimit} (probe rolling)`, signals };
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
 * Does NOT write (no chairman-reserved mutation; it records NO transition row). Returns NORMAL if the
 * substrate is absent/unreadable (fail-open).
 *
 * NOTE: reading `llm_canary_state` is PLACEHOLDER wiring (see the SIGNAL-SOURCE CAVEAT at the top of
 * this file) — that row is the dormant local-rollout canary, so this returns NORMAL in production
 * today. Repoint at the cloud-health feeder row when that DEFERRED follow-up lands.
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
