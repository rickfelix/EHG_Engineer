/**
 * The Adam rationale bar — the hard gate every candidate must clear before it
 * may surface as an advisory. SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001. PURE +
 * READ-ONLY (no DB, no I/O — fully unit-testable).
 *
 * A candidate clears the bar only if it:
 *   1. carries the full ordered rationale structure (incl. a REQUIRED counterfactual),
 *   2. cites a live anchor — an objective/KR, or (per-venture) an L2 vision + live metric,
 *   3. has non-zero OKR linkage (a 0 score is a missing-OKR GAP, not a valid low priority),
 *   4. does not duplicate an open SD,
 *   5. passes the CONST-002 (proposer != approver) + CONST-010 (factual framing) self-check.
 *
 * Scoring reuses lib/eva/okr-priority-integrator.js constants (off-track KR x3).
 * A GLOBAL cap of <=1 advisory per tick is enforced by selectAdvisory().
 */
import {
  getContributionWeights,
  getKRStatusMultipliers,
} from '../eva/okr-priority-integrator.js';

export const REQUIRED_RATIONALE_FIELDS = [
  'opportunity',
  'evidence',
  'rationale',
  'risk',
  'counterfactual',
];

// CONST-010: no manipulative/urgent/certainty/emotional framing.
const MANIPULATIVE_PATTERNS =
  /\b(urgent(?:ly)?|immediately|act now|act fast|must act|critical(?:ly)?|guaranteed|certainly|definitely|absolutely|you (?:need|have) to|don'?t miss|last chance)\b/i;

/**
 * Compute an OKR-weighted score for a candidate from the KR it cites.
 * Returns null when no scoreable KR linkage exists (caller treats that as a GAP).
 * @param {object} candidate
 * @returns {number|null}
 */
export function scoreCandidate(candidate) {
  if (!candidate || !candidate.objective_kr || !candidate.objective_kr.kr_status) return null;
  const w = getContributionWeights();
  const m = getKRStatusMultipliers();
  const cw = w[candidate.contribution_type] ?? w.supporting; // unknown -> supporting (0.5)
  const sm = m[candidate.objective_kr.kr_status] ?? m.on_track; // unknown -> on_track (1.0)
  return Math.round(cw * sm * 10); // 0..~45
}

/** CONST-002 + CONST-010 self-check. */
export function passesConstSelfCheck(candidate) {
  const violations = [];
  // CONST-002: a candidate is a PROPOSAL — it must not encode an approve/accept/graduate action.
  if (candidate.action && /accept|approve|graduate|auto[-_ ]?(accept|approve)/i.test(String(candidate.action))) {
    violations.push('CONST-002: candidate encodes an approval action (proposer != approver)');
  }
  // CONST-010: factual framing only.
  const text = [candidate.opportunity, candidate.rationale, candidate.risk, candidate.counterfactual]
    .filter(Boolean)
    .join(' ');
  if (MANIPULATIVE_PATTERNS.test(text)) {
    violations.push('CONST-010: manipulative/urgent/certainty framing detected');
  }
  return { ok: violations.length === 0, violations };
}

/** A candidate must anchor to a live KR, or (per-venture) an L2 vision + live metric. */
export function hasLiveAnchor(candidate) {
  const hasKr = Boolean(candidate.objective_kr && candidate.objective_kr.kr);
  const hasVisionMetric = Boolean(candidate.l2_vision_ref && candidate.live_metric);
  return hasKr || hasVisionMetric;
}

/**
 * Evaluate a single candidate against the bar.
 * @param {object} candidate
 * @param {{openSdKeys?: Set<string>|Array<string>}} [opts]
 * @returns {{ clears: boolean, score: number|null, reasons: string[] }}
 */
export function evaluateCandidate(candidate, opts = {}) {
  const openSdKeys =
    opts.openSdKeys instanceof Set ? opts.openSdKeys : new Set(opts.openSdKeys || []);
  if (!candidate || typeof candidate !== 'object') {
    return { clears: false, score: null, reasons: ['no candidate'] };
  }
  const reasons = [];

  // 1. full rationale structure
  for (const f of REQUIRED_RATIONALE_FIELDS) {
    if (!candidate[f] || String(candidate[f]).trim().length === 0) reasons.push(`missing ${f}`);
  }
  // 2. live anchor — never fabricate
  if (!hasLiveAnchor(candidate)) reasons.push('no live KR or L2-vision+metric anchor');
  // 3. OKR linkage score (0 => missing-OKR GAP, only excused when an L2 vision anchor exists)
  const score = candidate.okr_score != null ? candidate.okr_score : scoreCandidate(candidate);
  if ((score == null || score <= 0) && !candidate.l2_vision_ref) {
    reasons.push('zero OKR linkage (missing-OKR GAP, not a valid candidate)');
  }
  // 4. dedup vs open SDs
  if (candidate.dedup_key && openSdKeys.has(candidate.dedup_key)) reasons.push('duplicates an open SD');
  // 5. CONST self-check
  const cc = passesConstSelfCheck(candidate);
  if (!cc.ok) reasons.push(...cc.violations);

  return { clears: reasons.length === 0, score, reasons };
}

/**
 * Evaluate all candidates, rank the cleared ones, and apply the GLOBAL <=1
 * advisory cap. Returns the single advisory to surface (or null => ADAM_OK).
 * @param {Array} candidates
 * @param {object} [opts]
 * @returns {{ surfaced: object|null, verdict: 'ADAM_OK'|'SURFACED', cleared: number, evaluated: Array }}
 */
export function selectAdvisory(candidates, opts = {}) {
  const evaluated = (candidates || []).map((c) => {
    const e = evaluateCandidate(c, opts);
    return { candidate: c, ...e };
  });
  const cleared = evaluated.filter((x) => x.clears);
  if (cleared.length === 0) {
    return { surfaced: null, verdict: 'ADAM_OK', cleared: 0, evaluated };
  }
  cleared.sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.candidate.confidence ?? 0) - (a.candidate.confidence ?? 0)
  );
  return {
    surfaced: { ...cleared[0].candidate, okr_score: cleared[0].score },
    verdict: 'SURFACED',
    cleared: cleared.length,
    evaluated,
  };
}

/** Format the surfaced candidate into the ordered advisory body string. */
export function formatAdvisoryBody(c) {
  if (!c) return '';
  const anchor = c.objective_kr && c.objective_kr.kr
    ? `${c.objective_kr.objective || '(objective)'} / ${c.objective_kr.kr} (off-track delta: ${c.objective_kr.off_track_delta ?? 'n/a'})`
    : `L2-vision ${c.l2_vision_ref} + live metric ${c.live_metric}`;
  return [
    `[ADAM ADVISORY] scope=${c.scope_key}`,
    `Opportunity: ${c.opportunity}`,
    `Objective/KR: ${anchor}`,
    `Evidence: ${c.evidence}`,
    `Rationale: ${c.rationale}`,
    `Risk: ${c.risk}`,
    `Counterfactual: ${c.counterfactual}`,
    `Confidence: ${c.confidence ?? 'n/a'}`,
  ].join('\n');
}
