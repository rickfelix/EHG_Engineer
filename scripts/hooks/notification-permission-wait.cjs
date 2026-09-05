#!/usr/bin/env node
/**
 * Notification hook — QF-20260905-346.
 *
 * Claude Code emits a Notification hook event whenever the CLI needs the operator's
 * attention (most commonly a permission prompt). Until now .claude/settings.json had NO
 * Notification hook at all, so a seat stopped on a permission prompt heartbeats normally
 * and is invisible to the coordinator — discovered only by a human looking at the window
 * (chairman-raised in terminal 2026-09-05 08:4xZ with a screenshot).
 *
 * SCOPE (this QF): observe-only. Write ONE session_coordination row per notification so a
 * stuck seat is a row, not a screenshot. Paging the chairman by SMS after N minutes is a
 * follow-up once this calibration window shows the signal is clean (not this file's job).
 *
 * Thin CLI wrapper only — the actual write/exit-sequencing logic lives in
 * lib/hooks/notification-permission-wait-core.cjs so it can be required by tests without
 * this file's synchronous stdin read (fs.readFileSync(0) blocks waiting for EOF unless
 * Claude Code is the one piping-then-closing stdin, exactly as it does for a real hook
 * invocation but never for a `require()` in a test).
 */
const { writeNotificationRow, drainUndiciPool } = require('../../lib/hooks/notification-permission-wait-core.cjs');

const _stdinPayload = (() => {
  try {
    const raw = require('fs').readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();

const _writePromise = writeNotificationRow(_stdinPayload);

// Fire-and-forget: never block the Notification turn on the DB round-trip, but bound the
// wait (matching pre-tool-enforce.cjs's auditAndExit 1000ms cap) and always drain undici
// before exiting (Windows libuv async-handle race — see the core module's header comment).
Promise.race([_writePromise, new Promise((resolve) => setTimeout(resolve, 1000))])
  .catch(() => {})
  .then(() => drainUndiciPool())
  .then(() => process.exit(0));
