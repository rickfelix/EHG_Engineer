'use strict';

// QF-20260504-765 — shared session_id resolver for Claude Code hooks.
// Claude Code does NOT propagate CLAUDE_SESSION_ID env var to PostToolUse
// subprocesses; the canonical resolver is the JSON {session_id, ...} payload
// passed via stdin per the documented hook protocol. Closes the same bug
// class as bdc65df3 (coordination-inbox) for post-tool-clear-telemetry,
// post-tool-loop-state, and context-compact-nudge.
//
// Pattern extracted from QF-20260504-007 (coordination-inbox.cjs).

function isValidSessionId(sid) {
  return typeof sid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(sid);
}

function readSessionIdFromStdin(timeoutMs = 250) {
  return new Promise((resolve) => {
    let buf = '';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', c => { buf += c; });
      process.stdin.on('end', () => {
        clearTimeout(timer);
        try {
          const sid = JSON.parse(buf)?.session_id;
          resolve(isValidSessionId(sid) ? sid : null);
        } catch { resolve(null); }
      });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(null); });
    } catch { clearTimeout(timer); resolve(null); }
  });
}

async function resolveSessionId(timeoutMs = 250) {
  const fromStdin = await readSessionIdFromStdin(timeoutMs);
  if (isValidSessionId(fromStdin)) return fromStdin;
  const fromEnv = process.env.CLAUDE_SESSION_ID;
  if (isValidSessionId(fromEnv)) return fromEnv;
  return null;
}

module.exports = { readSessionIdFromStdin, resolveSessionId, isValidSessionId };
