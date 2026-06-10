/**
 * Shared CLI graceful-teardown primitive — the exit-hang / UV_HANDLE_CLOSING class.
 * SD-FDBK-INFRA-SWEEP-CLI-EXIT-001 (recipe proven in PR #4505:
 * scripts/hooks/post-completion-tail-enforcement.cjs shutdown(), lines 54-64).
 *
 * The class has two failure modes, both cured here:
 *  (a) HANG: a CLI whose success path never exits relies on natural event-loop drain; any
 *      lingering handle (keep-alive socket, stray interval, child pipe) keeps the process
 *      alive until the CALLER's timeout SIGTERMs it (exit-143). Live consequence: the
 *      quick_fixes row was already inserted, the caller saw "failure" and blind-retried,
 *      creating a duplicate QF (QF-20260610-541 / QF-20260610-221).
 *  (b) ABORT: calling process.exit() right after a Supabase/undici query aborts on Windows —
 *      libuv loop teardown races a socket/threadpool uv_async_send() on a handle already
 *      flagged UV_HANDLE_CLOSING ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *      src\\win\\async.c:76"). Empirically this reproduces even after a setImmediate-deferred
 *      exit AND after dispatcher.close() if exit() is still called.
 *
 * The only reliable shape (proven): do NOT call process.exit() — set process.exitCode for
 * errors, close undici's idle sockets to accelerate drain, and arm an UNREF'D backstop timer
 * that force-exits only if the loop somehow fails to drain. The backstop is safe: it is unref'd
 * (never delays/holds a clean natural exit), and by the time it could fire the sockets are
 * already closed, so its exit cannot race a live handle.
 *
 * ⚠ Arm AFTER your CLI's work fully settles (promise resolve/reject) — never before: the
 * backstop would kill legitimately-slow steps (npm provisioning can run minutes).
 *
 * ESM on purpose: the ~8 prior implementations of this recipe are hand-rolled cjs/mjs copies;
 * ESM CLIs (like create-quick-fix.js) had nothing importable. Follow-up flagged to converge
 * the hand-rolled sites onto this helper.
 */

let armed = false;

/**
 * Arm the graceful teardown. Idempotent — only the first call takes effect.
 *
 * @param {number} [exitCode=0]   process exit code; non-zero is set via process.exitCode
 *                                (never a direct process.exit — that is failure mode (b)).
 * @param {object} [opts]
 * @param {number} [opts.backstopMs=8000]  last-resort force-exit delay; unref'd.
 * @returns {Promise<void>} resolves after the dispatcher close attempt (awaitable in tests;
 *                          production callers may fire-and-return).
 */
export async function armCliTeardown(exitCode = 0, { backstopMs = 8000 } = {}) {
  if (armed) return;
  armed = true;
  if (exitCode) process.exitCode = exitCode;
  // Backstop ONLY — unref'd so it never delays a clean natural exit; if it ever fires the
  // sockets are already closed, so this exit can't race a live one.
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
  try {
    const { getGlobalDispatcher } = await import('undici');
    await getGlobalDispatcher().close();
  } catch { /* undici absent or already closed — natural drain still applies */ }
  // Deliberately NO process.exit() — returning lets Node exit once the loop drains.
}

/** Test hook: report/reset the armed latch (idempotency assertions). Not for production use. */
export function _isArmed() { return armed; }
export function _resetForTests() { armed = false; }
