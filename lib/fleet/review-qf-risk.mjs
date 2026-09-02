/**
 * SD-LEO-FIX-SELF-CLAIM-PREDICATE-001 (Solomon ruling 6580bedb): the ONE production call site
 * for the risk-review stamp writer. A security-agent evidence path (a worker running the
 * SECURITY sub-agent, or the sub-agent itself) calls this AFTER reading a risk-noun-hit QF's
 * title/description and reaching a verdict on whether it is a real risk change or a text-only
 * false positive (e.g. "submits credentials" naming a Playwright selector, not an auth flow).
 *
 * Persists the review as a `sub_agent_execution_results` row FIRST (sd_id is intentionally
 * null -- a bare QF that has not been escalated into a Strategic Directive has no sd_id to
 * cite, and the FK column is nullable; live rows with sd_id=null already exist for exactly
 * this shape of non-SD-scoped evidence), then, ONLY on an accepting verdict, stamps
 * `quick_fixes.compliance_details.risk_reviewed` citing that row's id via
 * lib/fleet/qf-risk-review-stamp.cjs's stampQfRiskReviewed -- the SAME writer contract
 * (ratification 6c263823: no gate accepts evidence authored by the party it gates) whether
 * called from here or a future first-class column migration.
 *
 * A non-accepting verdict (FAIL, CONDITIONAL_PASS is NOT auto-stamped -- a condition means
 * the row is NOT yet clear) still persists the review row for the audit trail, but leaves the
 * predicate excluding the QF, same as today.
 */
import { storeSubAgentResults } from '../sub-agent-executor/results-storage.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stampQfRiskReviewed } = require('./qf-risk-review-stamp.cjs');

/** Verdicts that clear the QF for self-claim. CONDITIONAL_PASS is deliberately excluded:
 * an open condition means the risk question was not fully resolved. */
const STAMPING_VERDICTS = new Set(['PASS']);

/**
 * @param {object} supabase
 * @param {{ qfId: string, verdict: string, confidence: number, reasoning: string,
 *   repoPath: string, executedFromCwd: string }} params
 * @returns {Promise<{ ok: boolean, stamped: boolean, subAgentRowId?: string, error?: string }>}
 */
export async function reviewQfRisk(supabase, { qfId, verdict, confidence, reasoning, repoPath, executedFromCwd }) {
  const { data: qf, error: qfError } = await supabase
    .from('quick_fixes')
    .select('id, title, description')
    .eq('id', qfId)
    .single();
  if (qfError || !qf) return { ok: false, stamped: false, error: qfError?.message || `QF ${qfId} not found` };

  const stored = await storeSubAgentResults('SECURITY', null, null, {
    verdict,
    confidence,
    detailed_analysis: reasoning,
    metadata: { qf_id: qfId, repo_path: repoPath, executed_from_cwd: executedFromCwd, review_target: 'quick_fixes' },
  }, { phase: 'QF_RISK_REVIEW' });

  if (!STAMPING_VERDICTS.has(verdict)) {
    return { ok: true, stamped: false, subAgentRowId: stored.id };
  }

  const stampResult = await stampQfRiskReviewed(supabase, qfId, {
    subAgentRowId: stored.id, title: qf.title, description: qf.description,
  });
  return { ok: stampResult.ok, stamped: stampResult.ok, subAgentRowId: stored.id, error: stampResult.error };
}
