/**
 * QF-20260912-697 (Golf signal 5666c0cd): complete-quick-fix.js and handoff.js
 * LEAD-FINAL-APPROVAL both ran past the caller's 2-minute limit (exit 143) AFTER their
 * core row write had already persisted, with zero stdout/stderr reaching the caller --
 * a worker could not tell success from failure without a manual row read. Root cause:
 * a post-write `await` with no timeout (the two specimens' core writes were already
 * confirmed persisted by direct row reads taken before the kill).
 *
 * runPostWriteStage() wraps ONE such post-write step: it prints a start marker before
 * running, a done/timed-out marker after, and bounds the step so a hung promise can
 * never block the caller past `timeoutMs` -- it races the real call against a timer,
 * never cancels the real call (no AbortController plumbed through every consumer), so a
 * "timed out" stage may still complete its write in the background after this function
 * returns. That is fine here: every caller of this helper (resolveLinkedFeedbackRows,
 * recordQfOutcomeOnComplete) is itself a best-effort, already-fail-soft side write, never
 * the row's own completion write -- the thing this QF measured as "core write already
 * persisted, the hang was AFTER it."
 *
 * Scope note: this QF's FIX SHAPE also named (b) wiring the same pattern into handoff.js's
 * LEAD-FINAL-APPROVAL post-accept tail and (c) a completion-idempotency guard against a
 * timeout-triggered double-completion retry. Deliberately NOT done here -- LEAD-FINAL's
 * post-accept chain (orchestrator-completion-hook, retrospective generation) is a larger,
 * separately-owned executor, and an idempotency guard is a distinct behavioral change with
 * its own edge cases; both warrant their own pass rather than being folded into this QF's
 * ~10 LOC budget. See the PR for this QF's full scope note.
 */

export const POST_WRITE_STAGE_TIMEOUT_EXIT_CODE = 75;
const DEFAULT_TIMEOUT_MS = 45000;

/**
 * @param {string} name - stage name, printed in every marker line.
 * @param {() => Promise<any>} fn - the post-write step to run.
 * @param {{timeoutMs?: number, log?: (line: string) => void}} [opts]
 * @returns {Promise<{ok: boolean, timedOut: boolean, result?: any, error?: Error, durationMs: number}>}
 */
export async function runPostWriteStage(name, fn, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs)
    ? opts.timeoutMs
    : Number(process.env.POST_WRITE_STAGE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const log = opts.log || console.log;
  const startedAt = new Date().toISOString();
  log(`POST-WRITE STAGE: ${name} (started ${startedAt})`);
  const start = Date.now();
  let timer;
  const timedOutSentinel = Symbol('timedOut');
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timedOutSentinel), timeoutMs);
  });
  // Racing, never cancelling -- fn() may still resolve/reject after the timeout wins. Attach a
  // silent catch to THIS reference so a late rejection never surfaces as an unhandled rejection;
  // the race below still observes the same promise's outcome when it wins.
  const fnPromise = fn();
  fnPromise.catch(() => {});
  try {
    const result = await Promise.race([fnPromise, timeout]);
    const durationMs = Date.now() - start;
    if (result === timedOutSentinel) {
      log(`POST-WRITE STAGE ${name} TIMED OUT after ${durationMs}ms -- core write already persisted; safe to re-read the row, do NOT re-run completion.`);
      return { ok: false, timedOut: true, durationMs };
    }
    clearTimeout(timer);
    log(`POST-WRITE STAGE: ${name} done ${durationMs}ms`);
    return { ok: true, timedOut: false, result, durationMs };
  } catch (error) {
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    log(`POST-WRITE STAGE: ${name} done ${durationMs}ms (error: ${error?.message || error})`);
    return { ok: false, timedOut: false, error, durationMs };
  }
}
