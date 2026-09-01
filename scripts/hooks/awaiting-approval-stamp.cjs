#!/usr/bin/env node
/**
 * PreToolUse hook — stamps claude_sessions.metadata.awaiting_approval_since (QF-20260901-987).
 *
 * ROOT CAUSE: a worker waiting on a permission prompt (cd approval, commit approval) emits NO
 * signal — heartbeat daemons keep heartbeat_at fresh while the session sits blocked at the
 * dialog. PreToolUse fires immediately before the tool call (and any permission dialog it
 * triggers); PostToolUse (awaiting-approval-clear.cjs) fires only once the tool has actually
 * run, i.e. after the dialog resolved. The gap between the two IS the permission-wait window,
 * so stamping here and clearing there gives the watch-side audit (_coord-silent-holder-audit.cjs
 * isAwaitingApprovalStale()) a real signal instead of silence.
 *
 * Scoped to the SAME matcher as pre-tool-enforce.cjs (Task|Bash|Write|Edit|AskUserQuestion) — the
 * only tool classes a permission dialog can actually gate — so this does not add a DB round trip
 * to every Read/Glob/Grep call.
 *
 * Fire-and-forget via raw https (mirrors claim-heartbeat-on-tool.cjs): supabase-js's kept-alive
 * socket trips the Windows libuv UV_HANDLE_CLOSING assertion on a fire-every-tool hook.
 */
const https = require('https');

function rpc(baseUrl, key, fnName, body) {
  return new Promise((resolve) => {
    try {
      const u = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fnName}`);
      const payload = JSON.stringify(body);
      const req = https.request(u, {
        method: 'POST',
        agent: false,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }));
      });
      req.on('error', () => resolve({ ok: false }));
      req.setTimeout(2500, () => { try { req.destroy(); } catch { /* noop */ } resolve({ ok: false }); });
      req.end(payload);
    } catch { resolve({ ok: false }); }
  });
}

(async () => {
  try {
    if (String(process.env.LEO_AWAITING_APPROVAL_STAMP || 'on').toLowerCase() === 'off') return;

    const sidLib = require('../../lib/hooks/session-id.cjs');
    const payload = await sidLib.readHookStdinPayload();
    let sessionId = payload && sidLib.isValidSessionId(payload.session_id) ? payload.session_id : '';
    if (!sessionId && sidLib.isValidSessionId(process.env.CLAUDE_SESSION_ID)) sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId) return;

    let baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!baseUrl || !key) {
      try { require('dotenv').config({ override: false, quiet: true }); } catch { /* dotenv optional */ }
      baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    }
    if (!baseUrl || !key) return;

    await rpc(baseUrl, key, 'set_session_awaiting_approval', { p_session_id: sessionId, p_clear: false });
  } catch { /* fail-open: a stamp hook must never block a tool call */ }
  process.exit(0);
})();
