'use strict';
/**
 * Shared undici-pool drain for hook scripts (QF-20260719-890; pattern extracted
 * from scripts/hooks/pre-tool-enforce.cjs, QF-20260510-148 / QF-20260719-120
 * lineage).
 *
 * On Windows, process.exit() while an in-flight/keep-alive undici socket's
 * async handle is closing trips libuv's `!(handle->flags & UV_HANDLE_CLOSING)`
 * assertion (src\win\async.c:76), surfacing as STATUS_STACK_BUFFER_OVERRUN
 * (0xC0000409). A crashed PreToolUse hook is treated as non-blocking, so
 * enforcement is silently skipped. EVERY hook exit that can follow a fetch()
 * must drain first. Fail-open: undici unavailable means no pool to drain, and
 * drainUndiciPool never throws.
 */
async function drainUndiciPool() {
  try {
    const undici = require('undici');
    if (undici && typeof undici.getGlobalDispatcher === 'function') {
      const d = undici.getGlobalDispatcher();
      if (d && typeof d.destroy === 'function') {
        await Promise.race([
          d.destroy(),
          new Promise(resolve => setTimeout(resolve, 200))
        ]).catch(() => {});
      }
    }
  } catch { /* fail-open: undici unavailable means no pool to drain */ }
}

/** Drain, then exit. In sync callbacks call without await and `return` immediately. */
async function drainAndExit(code) {
  await drainUndiciPool();
  process.exit(code);
}

module.exports = { drainUndiciPool, drainAndExit };
