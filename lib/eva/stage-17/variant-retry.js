/**
 * Bounded retry wrapper for individual archetype variant generation.
 *
 * Wraps an async variant-producing function with a small retry budget so
 * that transient LLM failures (most notably LLMStreamStalled, but also
 * network blips and 5xx) do not kill an entire screen. When the budget is
 * exhausted, the caller writes an `s17_variant_failed` artifact and
 * continues to the next variant — degrading gracefully rather than
 * aborting the whole generation run.
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM B
 *
 * @module lib/eva/stage-17/variant-retry
 */

export const DEFAULT_MAX_RETRIES = 1; // 1 retry → 2 total attempts

/**
 * Attempt to produce a variant with bounded retries.
 *
 * @param {(attempt:number)=>Promise<*>} fn  Variant-producing async fn.
 *   Receives the 0-indexed attempt number on each call.
 * @param {object} [options]
 * @param {number} [options.maxRetries=DEFAULT_MAX_RETRIES]
 *   Number of additional attempts after the first. `0` = single attempt,
 *   no retries.
 * @param {(info:{attempt:number,error:Error,willRetry:boolean})=>void} [options.onAttempt]
 *   Hook fired AFTER each failed attempt (not on success). Use this to
 *   log, update progress, or update a heartbeat. Errors thrown by the
 *   callback are intentionally not caught — they will propagate.
 * @returns {Promise<{ok:boolean, result?:*, error?:Error, attempts:number}>}
 *   Resolved descriptor; never throws (unless `onAttempt` does). `attempts`
 *   is the total attempts executed (success or fail).
 */
export async function attemptVariantWithRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const onAttempt = options.onAttempt || (() => {});

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(attempt);
      return { ok: true, result, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      onAttempt({
        attempt,
        error: err,
        willRetry: attempt < maxRetries,
      });
    }
  }
  return { ok: false, error: lastError, attempts: maxRetries + 1 };
}
