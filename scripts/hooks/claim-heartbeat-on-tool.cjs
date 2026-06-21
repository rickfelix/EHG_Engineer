#!/usr/bin/env node
/**
 * PostToolUse hook — TIME-based claim heartbeat (SD-LEO-INFRA-CLAIM-TTL-EXEC-HEARTBEAT-001).
 *
 * The shipped on-evidence-write heartbeat (CLAIM-TTL-LONG-SUBAGENT-TICK-001) refreshes a claim ONLY when
 * a sub-agent writes evidence. A long EXEC build that makes NO DB write in the window (a big code build /
 * Explore with no sub-agent calls) still ages past the 900s claim TTL and gets REAPED + STOLEN (Alpha
 * lost SOURCING-ENGINE-PROACTIVE-POPULATOR to Echo exactly this way). This closes the residual gap: ANY
 * tool call (Bash/Edit/Write/Read/...) during a build refreshes the claim, THROTTLED to at most once per
 * window so we don't write on every call.
 *
 * Hook contract (mirrors post-tool-loop-state.cjs):
 *   - Resolve the session id payload-first (stdin), env + identity-marker fallbacks.
 *   - CLAIM-GUARDED write: update heartbeat_at WHERE session_id=X AND sd_key IS NOT NULL — a non-claiming
 *     (idle/released) session is a no-op, so we never resurrect a released claim.
 *   - Throttled by lib/claim/heartbeat-throttle.cjs via a per-session tmp marker (cheap skip path: no DB
 *     read/write on throttled calls).
 *   - ALWAYS exit 0, fully best-effort — a heartbeat hook must NEVER block or fail a tool call.
 *   - Disable with LEO_CLAIM_HEARTBEAT_ON_TOOL=off; tune with LEO_CLAIM_HB_THROTTLE_MS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { shouldRefreshHeartbeat, DEFAULT_THROTTLE_MS } = require('../../lib/claim/heartbeat-throttle.cjs');

function isOff(v) {
  const f = String(v == null ? 'on' : v).toLowerCase();
  return f === 'off' || f === '0' || f === 'false';
}

/**
 * Minimal claim-guarded heartbeat PATCH via raw https (agent:false → no keep-alive socket left open,
 * so the hook exits cleanly — the heavy supabase-js client leaves async handles that trip the Windows
 * libuv UV_HANDLE_CLOSING assertion on a fire-every-tool hook). Resolves { ok } and NEVER rejects.
 * The ?sd_key=not.is.null filter makes a non-claiming (released/idle) session a no-op.
 */
function patchHeartbeat(baseUrl, key, sessionId, isoNow) {
  return new Promise((resolve) => {
    try {
      const u = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/claude_sessions`);
      u.searchParams.set('session_id', `eq.${sessionId}`);
      u.searchParams.set('sd_key', 'not.is.null');
      const body = JSON.stringify({ heartbeat_at: isoNow });
      const req = https.request(u, {
        method: 'PATCH',
        agent: false, // no connection pooling -> socket closes -> clean process exit
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        res.resume(); // drain
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }));
      });
      req.on('error', () => resolve({ ok: false }));
      req.setTimeout(3000, () => { try { req.destroy(); } catch { /* noop */ } resolve({ ok: false }); });
      req.end(body);
    } catch { resolve({ ok: false }); }
  });
}

(async () => {
  try {
    if (isOff(process.env.LEO_CLAIM_HEARTBEAT_ON_TOOL)) return;

    // SELF-ATTRIBUTED session id ONLY. A claim-refreshing write MUST target THIS process's own session.
    // We deliberately do NOT fall back to the identity-marker / latest-marker-by-mtime resolvers other
    // hooks use: on a multi-session host the mtime fallback returns whichever session most recently wrote
    // a marker — possibly a DIFFERENT (even dead-but-claimed) session — and refreshing its heartbeat would
    // KEEP A ZOMBIE CLAIM ALIVE and block reassignment (the exact failure the TTL exists to prevent;
    // adversarial review HIGH). A missed heartbeat self-corrects on the next tool call that carries a good
    // stdin session_id; a wrong-session heartbeat does not. Trusted sources only: stdin payload (CC ties it
    // to THIS invocation) + this process's own env. (Dropping the marker chain also avoids the slow
    // findClaudeCodeCcPid execSync on the hot path.)
    const sidLib = require('../../lib/hooks/session-id.cjs');
    const payload = await sidLib.readHookStdinPayload();
    let sessionId = payload && sidLib.isValidSessionId(payload.session_id) ? payload.session_id : '';
    if (!sessionId && sidLib.isValidSessionId(process.env.CLAUDE_SESSION_ID)) sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId && sidLib.isValidSessionId(process.env.SESSION_ID)) sessionId = process.env.SESSION_ID;
    if (!sessionId) return; // no self-attributed id -> skip (self-corrects next tool call)

    const throttleMs = Number(process.env.LEO_CLAIM_HB_THROTTLE_MS) > 0
      ? Number(process.env.LEO_CLAIM_HB_THROTTLE_MS) : DEFAULT_THROTTLE_MS;

    // Per-session throttle marker (cheap skip path — most tool calls never reach the DB).
    const stateFile = path.join(os.tmpdir(), `leo-claim-hb-${sessionId}.ts`);
    let last = null;
    try { const n = parseInt(fs.readFileSync(stateFile, 'utf8'), 10); if (Number.isFinite(n)) last = n; } catch { /* never touched */ }
    const now = Date.now();
    if (!shouldRefreshHeartbeat(last, now, throttleMs)) return;

    // CLAIM-GUARDED refresh via raw https (the SessionStart hooks inject SUPABASE_URL + the service key
    // into the env). The ?sd_key=not.is.null filter makes a non-claiming/released session a no-op, so we
    // never resurrect a released claim.
    let baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!baseUrl || !key) {
      // Self-load .env (best-effort) so the hook works whether or not the harness pre-injected env.
      try { require('dotenv').config({ override: false, quiet: true }); } catch { /* dotenv optional */ }
      baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    }
    if (!baseUrl || !key) return; // still missing -> fail-open
    const { ok } = await patchHeartbeat(baseUrl, key, sessionId, new Date(now).toISOString());
    if (ok) { try { fs.writeFileSync(stateFile, String(now)); } catch { /* throttle marker best-effort */ } }
  } catch { /* fail-open: a heartbeat hook must NEVER block a tool call */ }
  process.exit(0);
})();
