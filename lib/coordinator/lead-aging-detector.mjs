// SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001 (FR-4) — PURE LEAD-aging detector (data-in, verdict-out).
//
// The dispatch gap: an Adam-sourced vision-loop DRAFT SD that HAS cleared conception scoring
// (an authoritative vision score exists) but then sits UNCLAIMED at current_phase='LEAD' — no
// worker has picked it up to run LEAD-TO-PLAN. On a deep, dispatch-paced belt these scored drafts
// can park indefinitely (the silent serialization point between "Adam sourced it" and "a worker
// advanced it"). This detector flags them so the coordinator can prioritize/escalate dispatch.
//
// DISJOINT BY CONSTRUCTION from the two sibling detectors (so a single stranded SD is never
// double-reported):
//   - lib/coordinator/draft-stall-detector.mjs findStalledDrafts flags UNSCORED drafts (a scoring
//     silent-stall). findLeadAgingDrafts requires the OPPOSITE — a draft that IS scored.
//   - the progress-stall DUTY flags CLAIMED-but-frozen SDs (a live worker holding the claim).
//     findLeadAgingDrafts requires the SD to be UNCLAIMED (SD-side claiming_session_id absent) — the
//     "no one picked it up" dispatch gap. The two key on different sides (this reads the SD-side claim
//     column; the progress-stall DUTY keys on a session-side hold), so a transient claim half-write is
//     the only theoretical overlap — and the wide thresholds (progress-stall ~4h vs this ~7d) + the
//     stale-session sweep reconcile it well within either window, so no SD is double-reported in practice.
//
// Follows the charter-audit detector contract EXACTLY: a pure function, no DB / IO, returning
// { violation, staleCount, samples, detail, remediation } so it drops straight into the charter-audit
// `D` bundle + summarizeViolations(). The clock is INJECTED (nowMs) — it never calls Date.now()
// itself (deterministically unit-testable). READ-ONLY: never mutates state; `remediation` is the
// NAMED action the coordinator agent performs.

const DAY_MS = 86400000;

/**
 * Conception age of a draft row (now - created_at). A LEAD-aging draft is fundamentally "conceived
 * long ago, scored, but never advanced", so created_at is the robust basis. Mirrors
 * draft-stall-detector.draftAgeMs: deliberately NOT GREATEST(created_at, updated_at) — unrelated
 * writes (cascade triggers, coordinator sweeps, metadata bumps) touch updated_at constantly and a
 * grace would mask every real stall. updated_at is only a fallback when created_at is absent.
 * @returns {number} age in ms, or NaN if no timestamp is parseable (cannot prove staleness → fail-open)
 */
function draftAgeMs(row, nowMs) {
  const created = row && row.created_at ? new Date(row.created_at).getTime() : NaN;
  const updated = row && row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  const basis = Number.isFinite(created) ? created : updated;
  if (!Number.isFinite(basis)) return NaN;
  return Math.max(0, nowMs - basis);
}

/**
 * A row HAS an authoritative vision score iff the strategic_directives_v2.vision_score column is set
 * OR its sd_key is in the injected `scoredKeys` set (sd_keys with an eva_vision_scores row — the same
 * authoritative-score definition createVisionScoreGate uses; keeps this function PURE, the caller does
 * the one query). When `scoredKeys` is absent the check conservatively degrades to the column alone.
 * @param {object} row
 * @param {{has:(k:string)=>boolean}|null} scoredKeys
 */
function isScored(row, scoredKeys) {
  if (row && row.vision_score !== null && row.vision_score !== undefined) return true;
  if (scoredKeys && typeof scoredKeys.has === 'function' && scoredKeys.has(row && row.sd_key)) return true;
  return false;
}

/** A draft is UNCLAIMED iff it carries no live claiming_session_id (null/undefined/empty). */
function isUnclaimed(row) {
  const c = row && row.claiming_session_id;
  return c === null || c === undefined || c === '';
}

/**
 * A LEAD-aging CANDIDATE iff: status==='draft' AND current_phase==='LEAD' AND it is an Adam-sourced
 * vision-loop proposal (metadata.source==='proposal') AND it IS scored (disjoint from findStalledDrafts)
 * AND it is UNCLAIMED (disjoint from the claimed progress-stall DUTY).
 * @param {object} row
 * @param {{has:(k:string)=>boolean}|null} scoredKeys
 */
function isLeadAgingCandidate(row, scoredKeys) {
  if (!row || row.status !== 'draft') return false;
  if (row.current_phase !== 'LEAD') return false;
  const source = row.metadata && row.metadata.source;
  if (source !== 'proposal') return false;     // only Adam-sourced vision-loop drafts
  if (!isScored(row, scoredKeys)) return false; // DISJOINT from findStalledDrafts (which flags unscored)
  if (!isUnclaimed(row)) return false;          // DISJOINT from the claimed progress-stall DUTY
  return true;
}

/**
 * Find scored, unclaimed Adam-sourced vision-loop DRAFT SDs aging at current_phase='LEAD' beyond a
 * threshold (the dispatch gap). PURE.
 *
 * @param {Array<object>} rows - strategic_directives_v2 rows
 *   {sd_key,status,current_phase,vision_score,metadata,claiming_session_id,created_at,updated_at}
 * @param {number} nowMs - injected clock (never Date.now() internally)
 * @param {object} [opts]
 * @param {number} [opts.thresholdMs=7d] - minimum age before a scored LEAD draft counts as aging
 * @param {number} [opts.sampleLimit=10] - cap on sampled sd_keys returned (oldest-first)
 * @param {{has:(k:string)=>boolean}} [opts.scoredKeys] - sd_keys with an eva_vision_scores row (authoritative score)
 * @returns {{violation:boolean, staleCount:number, samples:Array<{sd_key:string,ageDays:number}>, detail:string, remediation:(string|null)}}
 */
export function findLeadAgingDrafts(rows = [], nowMs, opts = {}) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const thresholdMs = Number.isFinite(o.thresholdMs) ? o.thresholdMs : 7 * DAY_MS;
  const sampleLimit = Number.isFinite(o.sampleLimit) ? o.sampleLimit : 10;
  const scoredKeys = (o.scoredKeys && typeof o.scoredKeys.has === 'function') ? o.scoredKeys : null;

  // Fail-OPEN on malformed input: a non-array (or a bad clock) cannot be evaluated → no violation, never throw.
  if (!Array.isArray(rows) || !Number.isFinite(nowMs)) {
    return { violation: false, staleCount: 0, samples: [], detail: 'no evaluable rows (fail-open)', remediation: null };
  }

  const aging = [];
  for (const row of rows) {
    if (!isLeadAgingCandidate(row, scoredKeys)) continue;
    const age = draftAgeMs(row, nowMs);
    if (!Number.isFinite(age)) continue;  // no parseable timestamp → cannot prove aging (fail-open)
    if (age < thresholdMs) continue;      // fresh within the grace window → not aging
    aging.push({ sd_key: row.sd_key || '(unknown)', ageMs: age });
  }

  aging.sort((a, b) => b.ageMs - a.ageMs); // oldest-first
  const samples = aging.slice(0, Math.max(0, sampleLimit))
    .map((s) => ({ sd_key: s.sd_key, ageDays: Math.floor(s.ageMs / DAY_MS) }));

  const violation = aging.length > 0;
  const thresholdDays = Math.round(thresholdMs / DAY_MS);
  return {
    violation,
    staleCount: aging.length,
    samples,
    detail: violation
      ? `${aging.length} scored Adam-sourced vision draft(s) UNCLAIMED at LEAD >${thresholdDays}d (dispatch gap) — oldest: ${samples.slice(0, 3).map((s) => `${s.sd_key}(${s.ageDays}d)`).join(', ')}`
      : 'none (no scored vision-loop draft aging unclaimed at LEAD past threshold)',
    remediation: violation
      ? 'ACTION: dispatch the aging draft(s) to a worker for LEAD-TO-PLAN (re-rank via `node scripts/coordinator-backlog-rank.mjs`, or assign directly); a scored Adam-sourced vision draft has cleared scoring but is not being advanced through the LEAD gate'
      : null,
  };
}
