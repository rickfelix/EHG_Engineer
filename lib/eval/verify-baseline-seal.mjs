/**
 * Fable-5 baseline-seal verification — SD-LEO-INFRA-TIME-CRITICAL-SEAL-001.
 *
 * The Fable-5 golden-task answers are the ONLY window-dependent, ungeneratable-
 * after-2026-07-19 artifact (chairman intel: Fable access ends ~07-19). This
 * PURE attestation asserts the sealed corpus in feedback.category=
 * 'model_capability_baseline' is complete and integrity-hashed, so downstream
 * consumers (golden-task-loader, migrate-sealed-baselines, ground-truth-gate)
 * can grade it later — grading is DEFERRED to the cross-model harness / Opus-5
 * first run BY DESIGN (docs/design/solomon-fable-capability-grounding.md Part 4;
 * each sealed_run's run_context confirms "grading belongs to the eval harness").
 *
 * Verdict is SEALED iff every expected answer (fable5_answer) + answer key is
 * present with a content_hash. Token/wall-clock telemetry gaps on the low/medium
 * tiers are REPORTED as a known limitation (not a fail): re-running to backfill
 * telemetry would produce different answers and break the content-hash seal, so
 * the captured answers — the load-bearing artifact — take precedence.
 */

export const SEAL_SUITE = 'FABLE5-BASELINE-2026-07-16';
export const SEAL_MODEL = 'claude-fable-5';
export const SEAL_EFFORTS = Object.freeze(['low', 'medium', 'high']);
export const SEAL_SHAPES = Object.freeze([
  'R1-compounding', 'R2-negative-space', 'R3-taste', 'R4-coupling', 'R5-reversal', 'mechanical-baseline',
]);

/**
 * @param {Array<{metadata?:Object}>} rows - feedback rows (category=model_capability_baseline)
 * @param {Object} [opts]
 * @param {number} [opts.expectedKeys=10]  - one answer_key per task
 * @param {number} [opts.expectedRuns=30]  - tasks × effort tiers
 * @returns {{verdict:'SEALED'|'INCOMPLETE', reasons:string[], warnings:string[], stats:Object}}
 */
export function verifyBaselineSeal(rows, { expectedKeys = 10, expectedRuns = 30 } = {}) {
  const meta = (rows || []).map((r) => r?.metadata || r?.payload || {}).filter((m) => m && m.record_kind);
  const keys = meta.filter((m) => m.record_kind === 'answer_key');
  const runs = meta.filter((m) => m.record_kind === 'sealed_run');

  const reasons = [];
  const warnings = [];

  // Answer keys: count, hash, key text, task text, shape coverage.
  if (keys.length !== expectedKeys) reasons.push(`answer_key count ${keys.length} != expected ${expectedKeys}`);
  const keysMissingText = keys.filter((k) => !k.answer_key).length;
  const keysMissingHash = keys.filter((k) => !k.content_hash).length;
  // LEAD-phase Explore finding: golden-task-loader.mjs requires task_text on these
  // same rows to populate GoldenTask#taskText. A seal that verifies answer_key text
  // but not task_text would let SEALED pass while the actual eval-harness consumer
  // ends up with a task it can't load. Never log task.task_text itself here — only
  // the count of rows missing it (contamination guard).
  const keysMissingTaskText = keys.filter((k) => !k.task_text).length;
  if (keysMissingText) reasons.push(`${keysMissingText} answer_key row(s) missing answer_key text`);
  if (keysMissingTaskText) reasons.push(`${keysMissingTaskText} answer_key row(s) missing task_text`);
  if (keysMissingHash) reasons.push(`${keysMissingHash} answer_key row(s) missing content_hash`);
  const keyShapes = new Set(keys.map((k) => k.shape));
  const missingShapes = SEAL_SHAPES.filter((s) => !keyShapes.has(s));
  if (missingShapes.length) reasons.push(`answer keys miss shape(s): ${missingShapes.join(', ')}`);

  // Sealed runs: count, the load-bearing fable5_answer, hash, model, effort matrix.
  if (runs.length !== expectedRuns) reasons.push(`sealed_run count ${runs.length} != expected ${expectedRuns}`);
  const runsMissingAnswer = runs.filter((r) => !r.fable5_answer).length;
  const runsMissingHash = runs.filter((r) => !r.content_hash).length;
  if (runsMissingAnswer) reasons.push(`${runsMissingAnswer} sealed_run(s) missing fable5_answer (the ungeneratable artifact)`);
  if (runsMissingHash) reasons.push(`${runsMissingHash} sealed_run(s) missing content_hash`);
  const foreignModel = runs.filter((r) => r.model_id !== SEAL_MODEL);
  if (foreignModel.length) reasons.push(`${foreignModel.length} sealed_run(s) not model ${SEAL_MODEL}`);

  // Effort × task matrix: each task should have all three effort tiers.
  // PLAN-phase SECURITY finding: a plain object keyed by task_id crashes on a
  // task_id of '__proto__' (Object.prototype method returned instead of a Set) —
  // a Map has no such collision, even on this trusted internal data path.
  const byTask = new Map();
  for (const r of runs) {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, new Set());
    byTask.get(r.task_id).add(r.effort);
  }
  const tasksMissingTiers = [...byTask.entries()]
    .filter(([, set]) => SEAL_EFFORTS.some((e) => !set.has(e)))
    .map(([t]) => t);
  if (tasksMissingTiers.length) reasons.push(`task(s) missing effort tiers: ${tasksMissingTiers.join(', ')}`);

  // Telemetry gap (WARNING, not fail): tokens/wall_clock on low/medium tiers.
  const tokenGapTiers = {};
  for (const e of SEAL_EFFORTS) {
    const tier = runs.filter((r) => r.effort === e);
    const missTokens = tier.filter((r) => r.tokens == null).length;
    if (missTokens) tokenGapTiers[e] = missTokens;
  }
  if (Object.keys(tokenGapTiers).length) {
    warnings.push(`token/wall-clock telemetry missing on tiers ${JSON.stringify(tokenGapTiers)} — NOT recoverable (re-run would change answers + break the seal); cost_norm unavailable for those tiers, high tier has full telemetry`);
  }

  const stats = {
    keys: keys.length,
    runs: runs.length,
    shapes_covered: [...keyShapes],
    tasks: byTask.size,
    telemetry_complete_tiers: SEAL_EFFORTS.filter((e) => !tokenGapTiers[e]),
    telemetry_gap_tiers: Object.keys(tokenGapTiers),
  };

  return {
    verdict: reasons.length === 0 ? 'SEALED' : 'INCOMPLETE',
    reasons,
    warnings,
    stats,
  };
}
