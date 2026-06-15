// SD-LEO-INFRA-SILENT-STALL-PREVENTION-001 — PURE draft-stall detector (data-in, verdict-out).
//
// The silent stall: an SD created when the fire-and-forget scoreSDAtConception (leo-create-sd.js, 15s timeout,
// errors suppressed) times out or fails lands in `draft` with a NULL vision_score and no eva_vision_scores row.
// It then blocks at LEAD-TO-PLAN (createVisionScoreGate, "no score found") and sits UNNOTICED — never claimed,
// never surfaced. This detector flags those stranded drafts so the coordinator can remediate (re-score them).
//
// Co-located with charter-audit-detectors.mjs and follows its EXACT contract: a pure function, no DB / IO, that
// returns { violation:boolean, detail:string, remediation:(string|null), ... } so it drops straight into the
// charter-audit `D` bundle + summarizeViolations(). The clock is INJECTED (nowMs) — it never calls Date.now()
// itself (so it is deterministically unit-testable, matching the lib/coordinator/detectors pattern).
//
// READ-ONLY: it never mutates state; `remediation` is the NAMED action the coordinator agent performs.

const DAY_MS = 86400000;

/**
 * The CONCEPTION age of a draft row (now - created_at). A silent stall is fundamentally "conceived long ago,
 * never scored", so created_at is the robust basis.
 *
 * It deliberately does NOT use updated_at as a freshness grace (the obvious GREATEST(created_at, updated_at)).
 * Verified LIVE: unrelated writes — cascade triggers, coordinator sweeps, metadata bumps — touch
 * strategic_directives_v2.updated_at constantly, so known-stranded drafts (e.g. YOUTUBE-STRATEGY, the ADAM-*
 * drafts) show updated_at within hours despite being abandoned. A GREATEST grace would let that noise keep
 * resetting the staleness clock and MASK every real stall — the detector would essentially never fire. The
 * threshold itself (default 7d) already protects a freshly-CONCEIVED draft, so no extra updated_at grace is
 * needed. updated_at is used only as a fallback when created_at is absent (legacy / migrated rows).
 *
 * @returns {number} age in ms, or NaN if no timestamp is parseable (cannot prove staleness → fail-open)
 */
function draftAgeMs(row, nowMs) {
  const created = row && row.created_at ? new Date(row.created_at).getTime() : NaN;
  const updated = row && row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  const basis = Number.isFinite(created) ? created : updated; // prefer conception time; fall back if absent
  if (!Number.isFinite(basis)) return NaN; // no parseable timestamp → cannot prove staleness
  return Math.max(0, nowMs - basis);
}

/**
 * A draft is a stall CANDIDATE iff status==='draft' AND it has no AUTHORITATIVE vision score.
 *
 * "No authoritative score" is NOT just `strategic_directives_v2.vision_score IS NULL`: that column is essentially
 * never populated on a successful conception-time score (scoreSD writes only eva_vision_scores; nothing syncs the
 * column). The hard createVisionScoreGate itself treats an SD as scored if EITHER the column is set OR an
 * eva_vision_scores row exists (vision-score.js fallback, .eq('sd_id', sdKey) — eva_vision_scores.sd_id holds the
 * sd_key). So to avoid mislabelling a successfully-scored draft as a silent stall, a draft is a candidate only
 * when the column is null/undefined AND its sd_key is NOT in `scoredKeys` (the injected set of sd_keys with an
 * eva_vision_scores row — keeps this function PURE; the charter-audit caller does the one query).
 *
 * When `scoredKeys` is absent the check conservatively degrades to the column alone (never throws).
 * @param {object} row
 * @param {{has:(k:string)=>boolean}|null} scoredKeys - sd_keys known to have an eva_vision_scores row
 */
function isUnscoredDraft(row, scoredKeys) {
  if (!row || row.status !== 'draft') return false;
  if (row.vision_score !== null && row.vision_score !== undefined) return false;
  if (scoredKeys && typeof scoredKeys.has === 'function' && scoredKeys.has(row.sd_key)) return false;
  return true;
}

/**
 * Find draft SDs stranded with a NULL vision_score beyond an age threshold (the silent stall). PURE.
 *
 * @param {Array<object>} rows - strategic_directives_v2 rows {sd_key,status,vision_score,created_at,updated_at}
 * @param {number} nowMs - injected clock (e.g. getDbNowMs(db)); never read internally via Date.now()
 * @param {object} [opts]
 * @param {number} [opts.thresholdMs=7d] - minimum age before a null-score draft counts as stalled
 * @param {number} [opts.sampleLimit=10] - cap on the number of sampled sd_keys returned (oldest-first)
 * @param {{has:(k:string)=>boolean}} [opts.scoredKeys] - sd_keys with an eva_vision_scores row (excluded as scored)
 * @returns {{violation:boolean, staleCount:number, samples:Array<{sd_key:string,ageDays:number}>, detail:string, remediation:(string|null)}}
 */
export function findStalledDrafts(rows = [], nowMs, opts = {}) {
  // DSD-2: the signature default only applies to `undefined`; normalize a null/non-object opts to {} so a bad
  // opts degrades to defaults rather than throwing (symmetric with the rows/nowMs fail-open guard below).
  const o = (opts && typeof opts === 'object') ? opts : {};
  const thresholdMs = Number.isFinite(o.thresholdMs) ? o.thresholdMs : 7 * DAY_MS;
  const sampleLimit = Number.isFinite(o.sampleLimit) ? o.sampleLimit : 10;
  const scoredKeys = (o.scoredKeys && typeof o.scoredKeys.has === 'function') ? o.scoredKeys : null;

  // Fail-OPEN on malformed input: a non-array (or a bad clock) cannot be evaluated → no violation, never throw.
  if (!Array.isArray(rows) || !Number.isFinite(nowMs)) {
    return { violation: false, staleCount: 0, samples: [], detail: 'no evaluable rows (fail-open)', remediation: null };
  }

  const stalled = [];
  for (const row of rows) {
    if (!isUnscoredDraft(row, scoredKeys)) continue;
    const age = draftAgeMs(row, nowMs);
    if (!Number.isFinite(age)) continue;   // no parseable timestamp → cannot prove stale (fail-open)
    if (age < thresholdMs) continue;       // fresh draft within the grace window → not stalled
    stalled.push({ sd_key: row.sd_key || '(unknown)', ageMs: age });
  }

  // Oldest-first so the coordinator remediates the most-stranded drafts before the fresher ones.
  stalled.sort((a, b) => b.ageMs - a.ageMs);
  const samples = stalled.slice(0, Math.max(0, sampleLimit))
    .map((s) => ({ sd_key: s.sd_key, ageDays: Math.floor(s.ageMs / DAY_MS) }));

  const violation = stalled.length > 0;
  const thresholdDays = Math.round(thresholdMs / DAY_MS);
  return {
    violation,
    staleCount: stalled.length,
    samples,
    detail: violation
      ? `${stalled.length} draft SD(s) stranded with NULL vision_score >${thresholdDays}d (silent stall) — oldest: ${samples.slice(0, 3).map((s) => `${s.sd_key}(${s.ageDays}d)`).join(', ')}`
      : 'none (no draft stranded with a null vision_score past threshold)',
    remediation: violation
      ? 'ACTION: re-score the stranded draft(s) — `node scripts/eva/vision-scorer.js --sd <key>` (or re-run leo-create-sd scoring); the conception-time async score silently failed'
      : null,
  };
}
