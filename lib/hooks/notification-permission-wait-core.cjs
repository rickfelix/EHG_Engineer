'use strict';
/**
 * Pure logic for the Notification hook (QF-20260905-346) — extracted from
 * scripts/hooks/notification-permission-wait.cjs so it is requirable/testable without
 * triggering that file's top-level synchronous stdin read (fs.readFileSync(0) blocks
 * waiting for EOF when the module is merely required for a test, not invoked as a real
 * Claude Code hook with stdin piped-then-closed).
 *
 * See the hook script's header comment for the full rationale (Notification event
 * observability gap, valid_target CHECK constraint, drainUndiciPool Windows workaround).
 */

// session_coordination's `valid_target` CHECK constraint rejects a row with BOTH
// target_session and target_sd null (verified live: every existing broadcast-shaped row
// carries a non-null target_sd instead). A Notification event has no SD to scope to, so the
// correct target is the coordinator itself -- resolved file-first via the same
// readPointerFile() workers already use (lib/coordinator/resolve.cjs), never a DB round trip
// from inside a 5s hook. `readPointerFile` is injectable (mirrors lib/fleet/session-watchdog.js's
// isPidAlive/isWithinArmedSilence pattern) so tests exercise the real branch logic instead of
// whatever this worktree's real .claude/active-coordinator.json happens to contain.
function resolveTargetSession(readPointerFile) {
  try {
    const rpf = readPointerFile || require('../coordinator/resolve.cjs').readPointerFile;
    const pointer = rpf();
    return pointer && typeof pointer.session_id === 'string' ? pointer.session_id : null;
  } catch { return null; }
}

// Credentials are resolved from `deps.credentials` when the caller supplies that key at all
// (even an empty object — tests use this to force the "absent" branch deterministically),
// falling back to the real process env only for a genuine production invocation. This keeps
// the credential env-var names out of every test file's source text on purpose: the unit tier
// loads the real .env (vitest.config.js), so a test that reads/writes those identifiers
// directly can hold live credentials — scripts/audit-db-test-guards.mjs flags exactly that
// shape, and tests/unit/hooks/loop-state-resume-clear.test.js already found (and reverted) that
// narrowing the guard's regex to except a "safe" env-var write is not distinguishable by regex
// from a genuine credential read. DI, not a lint exception, is the fix this codebase settled on.
function resolveCredentials(deps) {
  if (deps && Object.prototype.hasOwnProperty.call(deps, 'credentials')) {
    return deps.credentials || {};
  }
  return { supabaseUrl: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

function writeNotificationRow(payload, deps = {}) {
  try {
    const { supabaseUrl, serviceKey } = resolveCredentials(deps);
    if (!supabaseUrl || !serviceKey) return Promise.resolve(); // no credentials — skip silently

    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || null;
    const message = typeof payload.message === 'string' ? payload.message
      : (typeof payload.title === 'string' ? payload.title : '');
    // No active coordinator on file (solo session) — target self so the row still satisfies
    // valid_target instead of being silently dropped; a solo session has no coordinator to see
    // it anyway, and the row remains queryable by payload.kind for the calibration window.
    const targetSession = resolveTargetSession(deps.readPointerFile) || sessionId;

    const body = JSON.stringify({
      target_session: targetSession,
      message_type: 'INFO',
      subject: '[NOTIFICATION] seat waiting on the harness',
      body: message.slice(0, 2000),
      sender_session: sessionId,
      sender_type: 'worker',
      payload: {
        kind: 'notification_permission_wait',
        session_id: sessionId,
        hook_event_name: payload.hook_event_name || 'Notification',
        notification_type: payload.notification_type || null,
        message: message.slice(0, 2000),
        stamped_at: new Date().toISOString(),
      },
    });

    return fetch(supabaseUrl + '/rest/v1/session_coordination', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
    }).catch((err) => {
      process.stderr.write('[notification-permission-wait] WRITE FAILED (non-blocking): ' + err.message + '\n');
    });
  } catch (e) {
    process.stderr.write('[notification-permission-wait] ERROR (non-blocking): ' + e.message + '\n');
    return Promise.resolve();
  }
}

/**
 * Tear down undici's keep-alive socket pool BEFORE process.exit. Without this, Windows libuv
 * asserts on src\win\async.c:76 (`!(handle->flags & UV_HANDLE_CLOSING)`) when process.exit
 * races the in-flight fetch's async-handle cleanup (STATUS_STACK_BUFFER_OVERRUN) -- reproduced
 * locally, confirming this is load-bearing here, not just in pre-tool-enforce.cjs's call sites.
 * Fail-open: undici unavailable means there is no pool to drain.
 */
async function drainUndiciPool() {
  try {
    const undici = require('undici');
    if (undici && typeof undici.getGlobalDispatcher === 'function') {
      const d = undici.getGlobalDispatcher();
      if (d && typeof d.destroy === 'function') {
        await Promise.race([d.destroy(), new Promise((resolve) => setTimeout(resolve, 200))]).catch(() => {});
      }
    }
  } catch { /* fail-open: undici unavailable means no pool to drain */ }
}

module.exports = { writeNotificationRow, drainUndiciPool, resolveTargetSession, resolveCredentials };
