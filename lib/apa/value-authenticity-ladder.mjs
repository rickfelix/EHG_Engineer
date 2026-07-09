/**
 * Value-Authenticity T0-T2 Ladder — fail-closed verdict aggregation
 * (docs/design/value-authenticity-system-design.md §1-L1, §2).
 * SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001.
 *
 * Aggregates T0/T1/T2 probe findings into a single verdict, reading
 * hard_catcher DIRECTLY from each criterion's library row (never
 * re-deriving tiering in code, per design §2's meta-gated library
 * discipline). A criterion with hard_catcher=false (T3/T4 — out of this
 * SD's build scope) can never produce a hard-fail, structurally, even if a
 * future SD wires soft criteria through this same aggregator.
 *
 * @module lib/apa/value-authenticity-ladder
 */

import { getCriterion } from './value-authenticity-criteria.mjs';

/**
 * @typedef {object} ProbeFinding
 * @property {string} criterionId - the criterion_id this finding is evaluated against
 * @property {boolean} finding - true if the probe found a problem
 * @property {string} reason
 */

/**
 * Aggregate probe findings into a fail-closed verdict. Each finding's
 * hard_catcher status is looked up live from the criteria library — cheap,
 * always current with the frozen (contract_version=1) table.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {ProbeFinding[]} findings
 * @returns {Promise<{verdict: 'PASS'|'FAIL', hardFindings: ProbeFinding[], softFindings: ProbeFinding[], weakestLinkGrade: string|null}>}
 */
export async function aggregateVerdict(supabase, findings) {
  const hardFindings = [];
  const softFindings = [];
  let weakestLinkGrade = null;

  for (const f of findings) {
    if (!f.finding) continue; // no problem found by this probe, nothing to aggregate

    const criterion = await getCriterion(supabase, f.criterionId);
    if (!criterion) {
      throw new Error(`[value-authenticity-ladder] aggregateVerdict: finding cites unknown criterion_id "${f.criterionId}" — round-trip SSOT violated`);
    }

    if (criterion.hard_catcher) {
      hardFindings.push(f);
    } else {
      softFindings.push(f);
    }

    if (criterion.evidence_grade && (!weakestLinkGrade || criterion.evidence_grade < weakestLinkGrade)) {
      weakestLinkGrade = criterion.evidence_grade;
    }
  }

  return {
    verdict: hardFindings.length > 0 ? 'FAIL' : 'PASS',
    hardFindings,
    softFindings,
    weakestLinkGrade,
  };
}

export default { aggregateVerdict };
