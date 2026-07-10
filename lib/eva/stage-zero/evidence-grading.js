/**
 * Stage-0 Evidence Grading
 * SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001 (spec R4, deep-challenge commission)
 *
 * Every ranking input carries an E0-E3 evidence grade; composites inherit their
 * weakest input's grade; ungrounded LLM market numerics (E0) can never dominate
 * a ranking decision — not through the composite, not through a tie-break.
 *
 * Grade ladder:
 *   E0 — ungrounded LLM output (the default for every LLM-emitted field)
 *   E1 — externally sourced (at least one declared source)
 *   E2 — corroborated (multiple sources / partial triangulation)
 *   E3 — externally verified / fully triangulated
 *
 * HONEST AT THE SOURCE: a candidate may DECLARE higher grades per field via
 *   candidate.evidence[field] = { grade, sources?: string[], triangulation?: string[] }
 * but a declared >E0 grade with no sources and <2 triangulation refs is CLAMPED
 * back to E0 with a clamp note — no LLM-only path can emit >E0.
 *
 * Pure functions only — zero I/O, deterministic, replayable.
 */

export const GRADE_ORDER = Object.freeze(['E0', 'E1', 'E2', 'E3']);

/** The five posture-weighted ranking inputs (beta seam, PR #5806). */
export const RANKED_FIELDS = Object.freeze([
  'automation_feasibility',
  'monthly_revenue_potential',
  'target_market_specificity',
  'strategic_fit',
  'competition_level',
]);

/**
 * Spec R4's hard-rule class: LLM market/revenue numerics with no external source
 * are E0 by definition and CANNOT dominate a ranking. E0 members of this class are
 * neutral-flattened in the composite and excluded from tie-breaking. (Judgment
 * inputs carry the TRIANGULATION duty instead — see TR-1 in the PRD: flattening
 * E0 judgments would nullify the chairman's ratified Phase-1 posture weights.)
 */
export const MARKET_NUMERIC_FIELDS = Object.freeze(['monthly_revenue_potential']);

/** Constant contribution (per unit weight) for a neutral-flattened E0 market numeric. */
export const E0_NEUTRAL = 0.5;

export function gradeRank(grade) {
  const i = GRADE_ORDER.indexOf(grade);
  return i === -1 ? 0 : i;
}

export function gradeAtLeast(grade, floor) {
  return gradeRank(grade) >= gradeRank(floor);
}

/**
 * Resolve per-field evidence grades for a candidate, clamping unsupported claims.
 *
 * @param {Object} candidate - may carry candidate.evidence[field] declarations
 * @returns {{grades: Object<string,string>, clamps: Array<{field, declared, reason}>}}
 */
export function resolveInputGrades(candidate = {}) {
  const grades = {};
  const clamps = [];
  const declared = (candidate.evidence && typeof candidate.evidence === 'object') ? candidate.evidence : {};

  for (const field of RANKED_FIELDS) {
    const claim = declared[field];
    if (!claim || typeof claim !== 'object' || !GRADE_ORDER.includes(claim.grade) || claim.grade === 'E0') {
      grades[field] = 'E0';
      continue;
    }
    const sources = Array.isArray(claim.sources) ? claim.sources.filter(Boolean) : [];
    const triangulation = Array.isArray(claim.triangulation) ? claim.triangulation.filter(Boolean) : [];
    if (sources.length > 0 || triangulation.length >= 2) {
      grades[field] = claim.grade;
    } else {
      grades[field] = 'E0';
      clamps.push({ field, declared: claim.grade, reason: 'unsupported_grade_declaration' });
    }
  }

  return { grades, clamps };
}

/** Weakest-link: a composite judgment's grade is its weakest input's grade. */
export function weakestLink(grades) {
  let min = 'E3';
  for (const field of RANKED_FIELDS) {
    const g = grades[field] || 'E0';
    if (gradeRank(g) < gradeRank(min)) min = g;
  }
  return min;
}

/** Distribution of composite grades across a ranked candidate list (for the run stamp). */
export function gradeDistribution(candidates = []) {
  const dist = { E0: 0, E1: 0, E2: 0, E3: 0 };
  for (const c of candidates) {
    const g = GRADE_ORDER.includes(c.composite_evidence_grade) ? c.composite_evidence_grade : 'E0';
    dist[g] += 1;
  }
  return dist;
}
