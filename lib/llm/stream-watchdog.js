/**
 * Stream-progress watchdog for Anthropic streaming responses.
 *
 * Wraps an Anthropic SDK message stream and rejects with LLMStreamStalled
 * if no token arrives within `threshold` ms of the previous token (or of
 * stream start). Distinct from wall-clock timeout: detects the "connection
 * alive, server idle" failure mode that wall-clock cannot catch until the
 * full timeout elapses.
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM A
 *
 * @module lib/llm/stream-watchdog
 * @env LLM_STREAM_STALL_TIMEOUT_MS - global default threshold (ms, fallback 90000)
 */

import { LLMStreamStalled } from './llm-stream-stalled.js';

export const DEFAULT_STALL_TIMEOUT_MS = 90000;

/**
 * Resolve the active default threshold, honoring LLM_STREAM_STALL_TIMEOUT_MS.
 * Invalid / non-positive values fall back to DEFAULT_STALL_TIMEOUT_MS.
 */
export function getDefaultStallTimeout() {
  const fromEnv = process.env.LLM_STREAM_STALL_TIMEOUT_MS;
  if (!fromEnv) return DEFAULT_STALL_TIMEOUT_MS;
  const n = Number.parseInt(fromEnv, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALL_TIMEOUT_MS;
}

/**
 * Wrap an Anthropic SDK stream with an inter-chunk inactivity watchdog.
 *
 * Hooks `stream.on('text', ...)` to track time-since-last-token. If
 * `threshold` ms elapse without a new token, calls `stream.abort()` and
 * rejects with LLMStreamStalled.
 *
 * @param {object} stream Anthropic stream returned by `client.messages.stream()`
 * @param {object} [options]
 * @param {number} [options.threshold]   Max ms between tokens; defaults to env / 90000
 * @param {string} [options.callerLabel] Identifier surfaced in the error metadata
 * @returns {Promise<object>} resolves with `stream.finalMessage()` payload on success
 * @throws  {LLMStreamStalled} when the threshold elapses without a token
 */
export function withStreamWatchdog(stream, options = {}) {
  const threshold = options.threshold ?? getDefaultStallTimeout();
  const callerLabel = options.callerLabel ?? 'unknown';

  let lastTokenAt = Date.now();
  let timer = null;
  let stallReject = null;

  const stallPromise = new Promise((_, reject) => {
    stallReject = reject;
  });

  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      const msSinceLastToken = Date.now() - lastTokenAt;
      const err = new LLMStreamStalled({
        msSinceLastToken,
        threshold,
        callerLabel,
        lastTokenAt,
      });
      // Order matters: settle the race promise BEFORE abort() so the
      // typed error wins the Promise.race against finalMessage's
      // synchronous rejection-on-abort. (Reversed → abort's "Error: aborted"
      // settles first and the typed error is dropped.)
      stallReject(err);
      try { stream.abort(); } catch { /* abort is best-effort */ }
    }, threshold);
  };

  const onText = () => {
    lastTokenAt = Date.now();
    arm();
  };

  arm();
  stream.on('text', onText);

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof stream.off === 'function') stream.off('text', onText);
  };

  // Pre-observe finalMessage rejection so that abort()-induced rejections
  // arriving AFTER the race settles are not flagged as unhandled.
  const finalPromise = Promise.resolve(stream.finalMessage());
  finalPromise.catch(() => { /* observed via Promise.race below */ });

  return Promise.race([finalPromise, stallPromise])
    .then(
      (msg) => { cleanup(); return msg; },
      (err) => { cleanup(); throw err; }
    );
}
