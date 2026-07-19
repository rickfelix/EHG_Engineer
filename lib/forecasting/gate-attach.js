// Advisory-weight attach of forecasts to kill-gate briefs (FR-5/6).
// SD-LEO-FEAT-FORECAST-LEDGER-001. CONST-001: this module is READ-ONLY — it returns evidence
// LINES for a brief and NEVER receives, scores, or mutates a gate verdict. buildGateBrief()
// passes the verdict through untouched (structuredClone) so a forecast can never flip a verdict.
import { interpretBrier } from './brier.js';
import { tableAbsent } from './ledger.js';

// The chairman-scoped advisory-attach surface for this SD. Deliberately DISTINCT from
// KILL_GATE_STAGES=[3,5,13] in lib/eva/experiments/baseline-accuracy.js: that list is the
// historical accuracy-CORRELATION set (includes legacy S13); this is the advisory-ATTACH set
// (S3/S5/S16 per SD scope). Kept separate on purpose — do not unify them.
export const FORECAST_ATTACH_STAGES = [3, 5, 16];

/** True if a stage is in the advisory-attach surface. */
export function isAttachStage(stage) {
  return FORECAST_ATTACH_STAGES.includes(Number(stage));
}

/**
 * Return advisory-weight forecast evidence LINES for a gate brief. READ-ONLY: no writes, no
 * verdict access. Fail-soft when the ledger table is absent. weight is ALWAYS 'advisory'.
 * @returns {Promise<{lines: Array, weight:'advisory', inert?:boolean}>}
 */
export async function attachForecasts(deps, { stage, questionClass } = {}) {
  if (!isAttachStage(stage)) return { lines: [], weight: 'advisory' };
  const sb = deps.supabase;
  let q = sb.from('forecast_ledger').select('id, question, p, status, resolved_outcome, brier_score, question_class');
  if (questionClass) q = q.eq('question_class', questionClass);
  const { data, error } = await q;
  if (error) {
    if (tableAbsent(error)) return { lines: [], weight: 'advisory', inert: true };
    throw new Error('forecast attach failed: ' + error.message);
  }
  const lines = (data || []).map((f) => ({
    id: f.id,
    weight: 'advisory',
    p: f.p,
    status: f.status,
    brier_score: f.brier_score,
    text: `[advisory] forecast P=${f.p} "${String(f.question).slice(0, 80)}"` +
      (f.status === 'resolved'
        ? ` → resolved ${f.resolved_outcome ? 'YES' : 'NO'}, Brier=${f.brier_score} (${interpretBrier(f.brier_score)})`
        : ' (open)'),
  }));
  return { lines, weight: 'advisory' };
}

/**
 * Compose a gate brief from a gate verdict + attached advisory forecasts. CONST-001: the verdict
 * is deep-cloned and passed through UNTOUCHED; forecasts land ONLY under advisory_evidence. There
 * is no code path here that reads a forecast into the verdict.
 */
export function buildGateBrief(verdict, attachResult) {
  return {
    verdict: structuredClone(verdict),
    advisory_evidence: (attachResult && attachResult.lines) || [],
    advisory_weight: 'advisory',
  };
}
