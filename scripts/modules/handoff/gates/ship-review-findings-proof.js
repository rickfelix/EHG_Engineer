/**
 * SHIP_REVIEW_FINDINGS_PROOF Gate
 *
 * Closes the structural defect that allowed 12+ S17-S26 phantom completions:
 * SDs reaching status='completed' without verifiable merge evidence in
 * ship_review_findings.
 *
 * Required for code-shipping SDs at LEAD-FINAL-APPROVAL. A PR merged with
 * no ship_review_findings row is itself suspicious — /ship Step 5.5 is
 * supposed to log every reviewed merge.
 *
 * SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001
 * @module scripts/modules/handoff/gates/ship-review-findings-proof
 */

const CODE_SD_TYPES = new Set(['feature', 'bugfix', 'infrastructure']);

/**
 * Decide if this SD requires ship_review_findings proof.
 * Code SDs: yes. Documentation/refactor/security overrides: per metadata.work_type.
 */
export function requiresShipReviewProof(sd) {
  if (sd?.metadata?.no_pr_required === true) return false;
  if (sd?.metadata?.work_type === 'code') return true;
  if (CODE_SD_TYPES.has(sd?.sd_type)) return true;
  return false;
}

/**
 * Run the SHIP_REVIEW_FINDINGS_PROOF gate.
 *
 * @param {object} params
 * @param {object} params.sd - Strategic Directive row (sd_key, sd_type, metadata)
 * @param {object} params.supabase - Supabase client
 * @returns {Promise<{passed: boolean, score: number, reason: string, evidence?: object[]}>}
 */
export async function runShipReviewFindingsProofGate({ sd, supabase }) {
  if (!requiresShipReviewProof(sd)) {
    return {
      passed: true,
      score: 100,
      reason: 'SHIP_REVIEW_FINDINGS_PROOF: not applicable (no_pr_required or non-code SD type)',
    };
  }

  const { data: rows, error } = await supabase
    .from('ship_review_findings')
    .select('id, pr_number, verdict, branch, synthesized_at, reviewed_at')
    .eq('sd_key', sd.sd_key);

  if (error) {
    return {
      passed: false,
      score: 0,
      reason: `SHIP_REVIEW_FINDINGS_PROOF: query failed (${error.message}) — fail-closed for safety`,
    };
  }

  const passing = (rows || []).filter((r) => r.verdict === 'pass');

  if (passing.length === 0) {
    const total = rows?.length || 0;
    return {
      passed: false,
      score: 0,
      reason:
        total === 0
          ? `SHIP_REVIEW_FINDINGS_PROOF: no ship_review_findings row for sd_key=${sd.sd_key}. Was /ship invoked? Check Step 5.5 logged the merge review.`
          : `SHIP_REVIEW_FINDINGS_PROOF: ${total} ship_review_findings row(s) exist for sd_key=${sd.sd_key} but none have verdict='pass'`,
      evidence: rows,
    };
  }

  return {
    passed: true,
    score: 100,
    reason: `SHIP_REVIEW_FINDINGS_PROOF: ${passing.length} passing review(s) found for sd_key=${sd.sd_key}`,
    evidence: passing.map((r) => ({
      id: r.id,
      pr_number: r.pr_number,
      verdict: r.verdict,
      synthesized: !!r.synthesized_at,
    })),
  };
}

export const SHIP_REVIEW_FINDINGS_PROOF_GATE = {
  name: 'SHIP_REVIEW_FINDINGS_PROOF',
  description:
    'Verifies ship_review_findings row with verdict=pass exists for code-shipping SDs. ' +
    'Required at LEAD-FINAL-APPROVAL. Companion to PR_MERGE_VERIFICATION — a merged PR ' +
    'with no findings row is itself suspicious (Step 5.5 of /ship should log every review).',
  required: true,
  bypass_allowed: 'dual-key-only',
  threshold: 70,
  run: runShipReviewFindingsProofGate,
};
