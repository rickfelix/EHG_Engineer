/**
 * Vision-score async trigger — SD-LEO-INFRA-SILENT-STALL-PREVENTION-001.
 *
 * The CONSERVATIVE, FAIL-OPEN, NON-BLOCKING half of silent-stall prevention. When a LEAD-TO-PLAN handoff begins
 * for an SD whose vision_score is still null (the conception-time async scoreSDAtConception silently timed out /
 * failed), this fires an OPPORTUNISTIC re-score WITHOUT awaiting it — purely to RAISE the pass-rate of the hard
 * createVisionScoreGate that runs later in the same handoff (which reads eva_vision_scores via fallback).
 *
 * It is NOT a gate and removes NO protection: the hard createVisionScoreGate is unchanged and remains the safety
 * net. This trigger can NEVER block a LEAD handoff:
 *   1. the caller wraps the import + call in try/catch (import-guard layer),
 *   2. it returns SYNCHRONOUSLY and the scoring promise is never awaited (fire-and-forget layer),
 *   3. the fire-and-forget promise has its own .catch collapsing any timeout/LLM/DB error to a debug log
 *      (inner fail-open layer) — so a rejection never becomes an unhandled rejection.
 *
 * @module scripts/modules/handoff/executors/lead-to-plan/gates/vision-score-async-trigger
 */

/**
 * Fire an opportunistic, non-blocking vision-score for an unscored SD. PURE-ISH: returns synchronously; any work
 * happens on a detached promise. Safe to call unconditionally at LEAD entry for ALL SD types (operator scope).
 *
 * @param {object} sd - the SD row (needs sd_key/id + vision_score)
 * @param {object} supabase - the service-client to hand to scoreSD (so it writes eva_vision_scores)
 * @param {object} [deps] - injectable seams for testing
 * @param {Function} [deps.scoreSD] - async ({sdKey,supabase})=>... ; defaults to the real vision-scorer
 * @param {Function} [deps.onError] - error sink (defaults to console.debug) — never re-throws
 * @returns {{triggered:boolean, reason:string}}
 */
export function triggerAsyncVisionScore(sd, supabase, deps = {}) {
  const onError = typeof deps.onError === 'function'
    ? deps.onError
    : (msg) => { try { console.debug(msg); } catch { /* no-op: logging must never throw */ } };

  // Guard 0: already scored (or no SD) → nothing to do. This is the common case and the cheap exit.
  if (!sd) return { triggered: false, reason: 'no sd supplied' };
  if (sd.vision_score !== null && sd.vision_score !== undefined) {
    return { triggered: false, reason: 'vision_score already present' };
  }

  const sdKey = sd.sd_key || sd.id;
  if (!sdKey) return { triggered: false, reason: 'no sd_key/id on sd' };

  // The real scorer is lazy-imported by default so this module has no load-time dependency on the (heavy)
  // vision-scorer; tests inject deps.scoreSD and never touch the import or the network.
  const scorer = typeof deps.scoreSD === 'function'
    ? deps.scoreSD
    : async (o) => (await import('../../../../../eva/vision-scorer.js')).scoreSD(o);

  // FIRE-AND-FORGET: do NOT await. Wrap the launch itself in try (a synchronous throw from scorer(...) — e.g. a
  // bad import resolved synchronously — must not propagate) and attach .catch for async rejections (fail-open).
  try {
    Promise.resolve()
      .then(() => scorer({ sdKey, supabase, quiet: true }))
      .catch((e) => onError(`[vision-score-async-trigger] re-score for ${sdKey} failed (non-blocking): ${e && e.message ? e.message : e}`));
  } catch (e) {
    onError(`[vision-score-async-trigger] launch for ${sdKey} threw (non-blocking): ${e && e.message ? e.message : e}`);
    return { triggered: false, reason: 'launch threw (fail-open)' };
  }

  return { triggered: true, reason: 'async re-score launched (fire-and-forget)' };
}
