#!/usr/bin/env node
/**
 * PostToolUse hook — clears claude_sessions.metadata.awaiting_approval_since (QF-20260901-987).
 *
 * Companion to awaiting-approval-stamp.cjs (PreToolUse). Fires only once the tool call has
 * actually completed — i.e. after any permission dialog resolved — so the stamped timestamp
 * from PreToolUse is cleared as soon as the wait is over. See that file's header for the full
 * root-cause writeup. Same matcher (Bash|Write|Edit|MultiEdit|AskUserQuestion, excluding Task —
 * see that file's header) as the stamp hook.
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

    await rpc(baseUrl, key, 'set_session_awaiting_approval', { p_session_id: sessionId, p_clear: true });
  } catch { /* fail-open: a clear hook must never block a tool call */ }
  process.exit(0);
})();
