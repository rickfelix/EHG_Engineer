/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C / RCA 9a02a76d — chairman-specified (2026-09-01)
 * per-SD-type duration-baseline gauge.
 *
 * Computes a median + p95 completion-duration baseline per sd_type from real
 * strategic_directives_v2 history, then FLAGS (never fails/blocks) an in-flight item running
 * past its type's p95 -- a worker-health investigation signal, not a verdict. Routed to
 * coordinator+Adam on the first breach tick; escalated to Solomon only on a SECOND consecutive
 * breach tick for the same item, mirroring this file's existing escalate-on-repeat pattern
 * (checkVentureTraversalStalls's `escalated = !!priorSnapshot[v.id]`).
 *
 * Deliberately a FLAG, never a kill/timeout: chairman governance model forbids automated
 * verdicts on in-flight work (see leo_protocol_sections chairman_governance content) -- this
 * gauge only ever raises attention.
 */

/** Minimum completed-item sample size before a type's baseline is trusted enough to flag on. */
export const MIN_SAMPLE_SIZE = 3;

/**
 * Pure: median + p95 (nearest-rank) of a duration array. Returns nulls for an empty/undersized
 * sample so callers can distinguish "no baseline yet" from "baseline says 0".
 * @param {number[]} durationsMs
 * @returns {{median: number|null, p95: number|null, n: number}}
 */
export function computeDurationStats(durationsMs) {
  const clean = (durationsMs || []).filter((d) => Number.isFinite(d) && d >= 0);
  const n = clean.length;
  if (n === 0) return { median: null, p95: null, n: 0 };
  const sorted = [...clean].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  return { median: pick(0.5), p95: pick(0.95), n };
}

/**
 * Pure: build {sd_type: stats} from a map of {sd_type: durationsMs[]}.
 * @param {Record<string, number[]>} durationsByType
 * @returns {Record<string, {median: number|null, p95: number|null, n: number}>}
 */
export function buildBaselines(durationsByType) {
  const out = {};
  for (const [type, durations] of Object.entries(durationsByType || {})) {
    out[type] = computeDurationStats(durations);
  }
  return out;
}

/**
 * Pure: is this in-flight item past its type's p95 baseline? Never breaches on an
 * undersized/absent baseline (MIN_SAMPLE_SIZE) -- a thin sample is not evidence.
 * @param {{elapsedMs: number, baseline?: {median: number|null, p95: number|null, n: number}}} args
 * @returns {{breached: boolean, ratio: number|null}}
 */
export function classifyDurationBreach({ elapsedMs, baseline }) {
  if (!baseline || baseline.n < MIN_SAMPLE_SIZE || !Number.isFinite(baseline.p95) || baseline.p95 <= 0) {
    return { breached: false, ratio: null };
  }
  const ratio = elapsedMs / baseline.p95;
  return { breached: elapsedMs > baseline.p95, ratio };
}

/**
 * Pure: given the current breach and the prior tick's persisted breach state for this item key,
 * decide the escalation tier and the next state to persist.
 * @param {{breached: boolean, priorBreached?: boolean}} args
 * @returns {{tier: 'none'|'first'|'second', nextBreached: boolean}}
 */
export function nextEscalationTier({ breached, priorBreached = false }) {
  if (!breached) return { tier: 'none', nextBreached: false };
  return { tier: priorBreached ? 'second' : 'first', nextBreached: true };
}
