/**
 * capability-scorer.mjs — cost-normalized scoring for the capability eval
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-3).
 *
 * BINDING CONSTRAINT (Solomon hand-off #4 ITEM B): this EXTENDS the
 * effort-experiment seam. The pre-registered decision rule is IMPORTED from
 * scripts/effort-experiment/readout.mjs — never re-derived inline (a second
 * copy of MIN_N/DELTA_PP is exactly the canonical-discriminant drift the
 * estate has been burned by). Greenfielding a parallel eval is out of scope.
 */
import { MIN_N, DELTA_PP, evaluateRule, buildCells } from '../../scripts/effort-experiment/readout.mjs';

// Re-export the single source of truth so eval callers never import a copy.
export { MIN_N, DELTA_PP, evaluateRule, buildCells };

/** Quality per kilotoken. quality on [0,1] (or rubric scale); tokens >= 0. */
export function costNorm(qualityScore, tokens) {
  if (qualityScore === null || qualityScore === undefined) return null;
  return (qualityScore / Math.max(tokens || 0, 1)) * 1000;
}

/**
 * Pairwise comparison (spec: pairwise over absolute). a/b are reference-row
 * shaped objects for the SAME task_id. Prefers higher cost-normalized quality.
 */
export function pairwise(a, b) {
  if (a.task_id !== b.task_id) throw new Error('pairwise: rows must share task_id');
  const ca = costNorm(a.quality_score, a.tokens);
  const cb = costNorm(b.quality_score, b.tokens);
  const preferA = (ca ?? -Infinity) >= (cb ?? -Infinity);
  return {
    task_id: a.task_id,
    preferred: preferA ? `${a.model_id}:${a.effort}` : `${b.model_id}:${b.effort}`,
    a: { model_id: a.model_id, effort: a.effort, cost_norm: ca },
    b: { model_id: b.model_id, effort: b.effort, cost_norm: cb },
  };
}

/**
 * Pure: shape a run (+ optional grade) into a model_capability_reference row.
 * trusted_for_routing is ALWAYS false here — only the ground-truth gate flips
 * it (fail-closed trust, FR-5). Results-only: no task/key text ever included.
 */
export function toReferenceRow(run, grade = null) {
  for (const f of ['task_id', 'shape', 'model_id', 'effort', 'content_hash', 'source_ref']) {
    if (!run[f]) throw new Error(`toReferenceRow: missing required field ${f}`);
  }
  return {
    problem_shape: run.shape,
    model_id: run.model_id,
    effort: run.effort,
    task_id: run.task_id,
    clears_bar: grade ? grade.clears_bar : null,
    quality_score: grade ? grade.quality_score : null,
    tokens: run.tokens ?? null,
    wall_clock_ms: run.wall_clock_ms ?? null,
    cost_norm: grade ? costNorm(grade.quality_score, run.tokens) : null,
    graded_at: grade ? grade.graded_at : null,
    grader: grade ? grade.grader : null,
    run_at: run.run_at ?? null,
    content_hash: run.content_hash,
    source_ref: run.source_ref,
    trusted_for_routing: false,
  };
}
