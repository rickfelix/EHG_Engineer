/**
 * Pure OKR progress derivation.
 * SD-LEO-INFRA-MAKE-EHG-ENGINEER-001 FR-2.
 *
 * The objectives / key_results tables have NO `progress` column — a key_result carries
 * baseline_value / current_value / target_value / direction. Reading a `.progress` field (as the
 * old management-review-round.mjs okr_snapshot mapper did) yields 0% for every objective — the
 * "wrong query shape → all-zero" class. Derive progress from the values instead:
 *
 *   progress% = clamp01( (current - baseline) / (target - baseline) ) * 100
 *
 * The sign of (target - baseline) implicitly honors `direction`: an increase goal has target>baseline
 * and a decrease goal has target<baseline, so (current-baseline)/(target-baseline) is positive as
 * `current` moves toward `target` either way. The result is clamped to [0,100]. A zero span
 * (target == baseline) is guarded: 100 if current has reached target, else 0.
 *
 * Pure — no IO — so it is unit-testable without a DB.
 */

/**
 * Derive a 0-100 integer progress percentage for one key_result row.
 * @param {{baseline_value?:any, current_value?:any, target_value?:any, direction?:string}} kr
 * @returns {number} integer 0..100
 */
export function deriveKrProgress(kr) {
  if (!kr || typeof kr !== 'object') return 0;
  const base = Number(kr.baseline_value);
  const cur = Number(kr.current_value);
  const tgt = Number(kr.target_value);
  if (![base, cur, tgt].every(Number.isFinite)) return 0;

  const span = tgt - base;
  if (span === 0) {
    // Divide-by-zero guard: reached target iff current matches it.
    return cur === tgt ? 100 : 0;
  }
  const pct = ((cur - base) / span) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Build the okr_snapshot array from objectives + their key_results, with value-derived progress.
 * @param {Array<object>} objectives - rows with { id, code, title }
 * @param {Array<object>} keyResults - rows with { objective_id, code, title, status, ...values }
 * @returns {Array<object>}
 */
export function buildOkrSnapshot(objectives, keyResults) {
  const objs = Array.isArray(objectives) ? objectives : [];
  const krs = Array.isArray(keyResults) ? keyResults : [];
  return objs.map((obj) => {
    const mine = krs.filter((kr) => kr.objective_id === obj.id);
    const progresses = mine.map(deriveKrProgress);
    const avg = progresses.length > 0
      ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
      : 0;
    return {
      objective: obj.title,
      objectiveCode: obj.code,
      objectiveProgress: avg, // objectives carry no own progress — summarize from KRs
      keyResults: mine.map((kr, i) => ({
        title: kr.title,
        code: kr.code,
        status: kr.status,
        progress: progresses[i],
      })),
      avgKRProgress: avg,
    };
  });
}
