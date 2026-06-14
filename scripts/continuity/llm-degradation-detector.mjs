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
 * SIGNAL SOURCE (live as of SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001): detectFromDb reads the
 * DEDICATED `llm_cloud_health` singleton (migration 20260614_llm_cloud_health.sql), stamped by the
 * cloud-cap feeder (scripts/continuity/cloud-cap-feeder.mjs) from REAL Anthropic API outcomes
 * (429 / 5xx / overloaded / timeout). This REPLACES the earlier placeholder wiring to
 * `llm_canary_state` — that row is the LOCAL-MODEL rollout canary (its `status='rolled_back'` means
 * "back to the HEALTHY Anthropic cloud", the INVERSE of a cap), kept cleanly separate per the
 * coordinator spec-fork ruling (dedicated table, no row overload). detectFromDb also applies a
 * Layer-2 quiescent-fleet guard (0 live workers → NORMAL) so a stale degraded row can never PAUSE
 * an idle fleet.
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
 * Live-worker window (ms): a degraded signal is suppressed only if NO worker heartbeat is this fresh.
 * 15 min for parity with the main-worker TTL — pure-heartbeat liveness has a known false-stale rate,
 * and the wrong-suppression risk is worst exactly when a cap blocks workers mid-tool-call, so a
 * generous window avoids reading a busy fleet as quiescent.
 * NOTE: countLiveWorkers MUST be passed a SERVICE-ROLE supabase client — an anon/RLS-restricted client
 * silently reads count=0 (no error) and would wrongly suppress a real degradation as 'quiescent'.
 */
export const DEFAULT_LIVE_WORKER_WINDOW_MS = 15 * 60 * 1000; // 15 min (main-worker TTL parity)

/**
 * Count workers with a fresh heartbeat (the authoritative "is work flowing right now" signal).
 * Returns null on read error/unknown — the caller treats unknown as "do not suppress" (a definite
 * degraded signal is only suppressed by DEFINITE evidence of a quiescent fleet, liveWorkers===0).
 */
async function countLiveWorkers(supabase, nowMs, windowMs) {
  const base = Number.isFinite(nowMs) ? nowMs : Date.now();
  const since = new Date(base - windowMs).toISOString();
  const { count, error } = await supabase
    .from('claude_sessions')
    .select('session_id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gt('heartbeat_at', since);
  if (error) return null;
  return typeof count === 'number' ? count : null;
}

/**
 * Read-only DB wrapper: load the singleton `llm_cloud_health` row (stamped by the cloud-cap feeder)
 * and evaluate the rung, then apply the Layer-2 quiescent-fleet guard. Does NOT write. Fail-open:
 * absent/unreadable substrate → NORMAL.
 *
 * Layer 1 (in the pure evaluator): PAUSE arms only on status='rolling'. Layer 2 (here): even a
 * genuinely degraded row is suppressed to NORMAL when 0 workers have a fresh heartbeat — a degraded
 * cloud only matters if work is flowing, and this contains a stale 'rolling' row from a feeder that
 * stopped mid-degradation. Unknown liveness (query error) does NOT suppress (surface the signal).
 * @param {object} supabase
 * @param {number} nowMs
 */
export async function detectFromDb(supabase, nowMs, opts = {}) {
  const liveWorkerWindowMs = numOrNull(opts.liveWorkerWindowMs) ?? DEFAULT_LIVE_WORKER_WINDOW_MS;
  try {
    const { data, error } = await supabase
      .from('llm_cloud_health')
      .select('status, current_error_rate, error_rate_threshold, current_latency_p95_ms, baseline_latency_p95_ms, latency_multiplier_threshold, consecutive_failures, failures_before_rollback, last_quality_check_at')
      .limit(1)
      .maybeSingle();
    if (error) return { rung: RUNG.NORMAL, reason: `cloud-health read error (fail-open): ${error.message}`, signals: {} };
    const verdict = evaluateDegradationRung(data, nowMs, opts);
    if (verdict.rung === RUNG.NORMAL) return verdict;
    // Stale-signal guard: a degraded row whose last probe is older than the liveness window means the
    // feeder STOPPED (it is the sole writer + an opt-in CLI, not a daemon). A degraded rung — especially
    // PAUSE, which out-ranks the evaluator's own liveness-stale rung and so would otherwise pin PAUSE on
    // hours-old data — assumes an actively-probing source; once stale that assumption is violated. Treat
    // a stale degraded signal as NORMAL (fail-open: stale == no current signal), so a stopped feeder can
    // never pin a degraded rung on live workers. A running feeder refreshes last_quality_check_at each
    // cadence, so this only fires when the feeder is genuinely not running.
    const livenessStaleMs = numOrNull(opts.livenessStaleMs) ?? DEFAULT_LIVENESS_STALE_MS;
    const lastCheckMs = data?.last_quality_check_at ? Date.parse(data.last_quality_check_at) : null;
    const signalStale = Number.isFinite(lastCheckMs) && Number.isFinite(nowMs) && (nowMs - lastCheckMs) > livenessStaleMs;
    if (signalStale) {
      return { rung: RUNG.NORMAL, reason: `stale cloud-health signal (feeder not actively probing) — suppress ${verdict.rung}`, signals: { ...verdict.signals, signalStale: true } };
    }
    const liveWorkers = await countLiveWorkers(supabase, nowMs, liveWorkerWindowMs);
    if (liveWorkers === 0) {
      return { rung: RUNG.NORMAL, reason: `quiescent fleet (0 live workers) — suppress ${verdict.rung}`, signals: { ...verdict.signals, liveWorkers } };
    }
    return { ...verdict, signals: { ...verdict.signals, liveWorkers } };
  } catch (e) {
    return { rung: RUNG.NORMAL, reason: `cloud-health read threw (fail-open): ${e.message}`, signals: {} };
  }
}
