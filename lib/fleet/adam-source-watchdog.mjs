/**
 * Adam source/gauge missing-run watchdog — SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001 (FR-4).
 *
 * PURE, no I/O. Catches a DROPPED trigger: when Adam's durable scan tick or the vision-gauge
 * refresh fails to run, no row is written at all — a hole the HISTORIZE available=false fail-soft
 * cannot see (it only records when a run actually executes). This watchdog asserts a recent
 * vision_build_gauge run (and, when its timestamp is provided, a recent Adam source event) and
 * returns a verdict the exec-summary renders as a degraded line.
 *
 * FAIL-SOFT: when the still-chairman-gated vision_build_gauge table is ABSENT, the verdict is
 * 'unprovisioned' (degrade honestly, never crash or fabricate a hole). The source-event arm is
 * only evaluated when lastSourceAtMs is actually provided (not undefined), so an unavailable
 * source signal never raises a false alarm.
 */

export const GAUGE_MAX_AGE_MS = 90 * 60 * 1000;   // a vision-gauge run is expected within ~90 min
export const SOURCE_MAX_AGE_MS = 90 * 60 * 1000;  // an Adam source event is expected within its (hourly) window

/**
 * @param {object} a
 * @param {boolean} [a.tableProvisioned=true]  false ⇒ vision_build_gauge does not exist yet (gated)
 * @param {number|null} [a.lastGaugeAtMs]       epoch ms of the latest vision_build_gauge run (null ⇒ none)
 * @param {number} [a.lastSourceAtMs]           epoch ms of the latest Adam source event; OMIT (undefined) to skip the source arm
 * @param {number} a.nowMs
 * @param {number} [a.gaugeMaxAgeMs]
 * @param {number} [a.sourceMaxAgeMs]
 * @returns {{verdict:'ok'|'missing'|'unprovisioned', missing:string[], label:string|null}}
 */
export function assessAdamSourceWatchdog({
  tableProvisioned = true,
  lastGaugeAtMs = null,
  lastSourceAtMs,
  nowMs,
  gaugeMaxAgeMs = GAUGE_MAX_AGE_MS,
  sourceMaxAgeMs = SOURCE_MAX_AGE_MS,
} = {}) {
  // Defensive (shared lib): a non-finite nowMs can't yield a trustworthy staleness verdict —
  // degrade to 'ok' (never false-alarm the chairman email) rather than emit a garbage line.
  if (!Number.isFinite(nowMs)) {
    return { verdict: 'ok', missing: [], label: null };
  }
  if (!tableProvisioned) {
    return { verdict: 'unprovisioned', missing: [], label: 'vision-gauge watchdog: table not yet provisioned (HISTORIZE migration pending)' };
  }
  const missing = [];
  const gaugeStale = !Number.isFinite(lastGaugeAtMs) || (nowMs - lastGaugeAtMs) > gaugeMaxAgeMs;
  if (gaugeStale) missing.push('vision_build_gauge');

  // Source arm only when a timestamp was actually provided — an absent signal must not false-alarm.
  const sourceChecked = lastSourceAtMs !== undefined;
  const sourceStale = sourceChecked && (!Number.isFinite(lastSourceAtMs) || (nowMs - lastSourceAtMs) > sourceMaxAgeMs);
  if (sourceStale) missing.push('adam_source_event');

  if (missing.length === 0) return { verdict: 'ok', missing, label: null };

  const parts = [];
  if (gaugeStale) parts.push(Number.isFinite(lastGaugeAtMs) ? `vision-gauge run ${Math.round((nowMs - lastGaugeAtMs) / 60000)}m stale` : 'no vision-gauge run on record');
  if (sourceStale) parts.push(Number.isFinite(lastSourceAtMs) ? `Adam source ${Math.round((nowMs - lastSourceAtMs) / 60000)}m stale` : 'no Adam source event in window');
  return { verdict: 'missing', missing, label: `missing run — ${parts.join('; ')}` };
}
