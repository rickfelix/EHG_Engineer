/**
 * living-update.mjs — debounced, threshold-gated re-float + observable freshness gauge.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-C (FR-2).
 *
 * The suitability map is LIVING: as a region's defect history recurs, its opportunity climbs and it
 * should re-float to the top. But a PER-EVENT re-float would thrash the table and the section-11
 * ledger (RISK R2). So a re-float fires ONLY when:
 *   - the recurrence signal has CLIMBED past a threshold since the last score, AND
 *   - we are outside the debounce window since the region's last re-float.
 * A re-float is provenance-stamped: score_version increments, refloated_at + trigger_reason set, and
 * the input snapshot recorded — so a later grade can see exactly what drove it.
 *
 * computeFreshness is the observable gauge: staleness must be DETECTABLE, not silent (LIVENESS !=
 * CLOSURE) — a map that silently goes stale is worse than one that reports it. Pure/deterministic:
 * `now` is injected so tests are not clock-dependent.
 */

/**
 * Decide whether a region should re-float given a new defect signal.
 * @param {object} region  { region_key, score_version, recurrence_weight, refloated_at }
 * @param {object} defectSignal  { recurrenceWeight } the freshly-observed recurrence weight
 * @param {object} opts  { threshold, debounceMs, now (ms epoch), reason }
 * @returns {{ refloat:boolean, reason:string, patch?:object }}
 */
export function evaluateRefloat(region = {}, defectSignal = {}, opts = {}) {
  const { threshold = 1.0, debounceMs = 6 * 60 * 60 * 1000, now = 0, reason = 'recurrence-climb' } = opts;

  const prev = Number(region.recurrence_weight) || 0;
  const next = Number(defectSignal.recurrenceWeight) || 0;
  const climb = next - prev;

  if (climb < threshold) {
    return { refloat: false, reason: `climb ${climb.toFixed(2)} < threshold ${threshold}` };
  }

  // Debounce: suppress a re-float too soon after the last one.
  const lastRefloatMs = region.refloated_at ? Date.parse(region.refloated_at) : NaN;
  if (Number.isFinite(lastRefloatMs) && now - lastRefloatMs < debounceMs) {
    return { refloat: false, reason: `within debounce window (${Math.round((now - lastRefloatMs) / 1000)}s < ${Math.round(debounceMs / 1000)}s)` };
  }

  const nowIso = new Date(now).toISOString();
  return {
    refloat: true,
    reason,
    patch: {
      score_version: (Number(region.score_version) || 0) + 1, // history-preserving bump (child A appends)
      recurrence_weight: next,
      refloated_at: nowIso,
      last_scored_at: nowIso,
      trigger_reason: `${reason}: recurrence ${prev.toFixed(2)} -> ${next.toFixed(2)} (climb ${climb.toFixed(2)})`,
      input_snapshot: { prev_recurrence: prev, new_recurrence: next, threshold, evaluated_at: nowIso },
    },
  };
}

/**
 * Observable freshness gauge over a set of current rows.
 * @param {Array<{region_key:string, last_scored_at:string}>} rows
 * @param {object} opts  { now (ms epoch), staleAfterMs }
 * @returns {{fresh:number, stale:number, oldestAgeMs:number, staleRegionKeys:string[]}}
 */
export function computeFreshness(rows = [], opts = {}) {
  const { now = 0, staleAfterMs = 7 * 24 * 60 * 60 * 1000 } = opts;
  let fresh = 0;
  let stale = 0;
  let oldestAgeMs = 0;
  const staleRegionKeys = [];

  for (const r of rows) {
    const scoredMs = r.last_scored_at ? Date.parse(r.last_scored_at) : NaN;
    const ageMs = Number.isFinite(scoredMs) ? now - scoredMs : Infinity;
    if (ageMs > oldestAgeMs && Number.isFinite(ageMs)) oldestAgeMs = ageMs;
    if (ageMs > staleAfterMs) {
      stale += 1;
      staleRegionKeys.push(r.region_key);
    } else {
      fresh += 1;
    }
  }

  return { fresh, stale, oldestAgeMs, staleRegionKeys };
}
