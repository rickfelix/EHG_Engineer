'use strict';

// QF-20260504-765 — shared session_id resolver for Claude Code hooks.
// Claude Code does NOT propagate CLAUDE_SESSION_ID env var to PostToolUse
// subprocesses; the canonical resolver is the JSON {session_id, ...} payload
// passed via stdin per the documented hook protocol. Closes the same bug
// class as bdc65df3 (coordination-inbox) for post-tool-clear-telemetry,
// post-tool-loop-state, and context-compact-nudge.
//
// Pattern extracted from QF-20260504-007 (coordination-inbox.cjs).
//
// ─── Verified Claude Code hook protocol contract (RCA 2026-05-04) ──────────
// Per-event-type stdin payload shape and env propagation behavior, captured by
// canaries against CC SSE port 49xxx, session 6aacba56-7cb5-4c82-b1e2-...:
//
//   PostToolUse stdin: { session_id, hook_event_name:'PostToolUse', tool_name,
//                        tool_input, tool_response, transcript_path, cwd,
//                        permission_mode, tool_use_id }
//   PreToolUse  stdin: { session_id, transcript_path, cwd, permission_mode,
//                        agent_id, agent_type, hook_event_name:'PreToolUse',
//                        tool_name, tool_input, tool_use_id }
//                        ↑ agent_id / agent_type only present on PreToolUse
//                          when a sub-agent (e.g. rca-agent) invokes the tool.
//   UserPromptSubmit stdin: { session_id, transcript_path, cwd, permission_mode,
//                             hook_event_name:'UserPromptSubmit', prompt }
//   PreCompact  stdin: NOT YET HARVESTED — see scripts/hooks/__tests__/
//                      session-id-propagation-canary.test.js todo entry.
//   SessionStart stdin: { session_id, source, model, ... } per existing
//                       capture-session-id.cjs reference impl.
//
// Env propagation across ALL the above hook events: identical and minimal —
// only [CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS,
// CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS,
// CLAUDE_CODE_SSE_PORT, CLAUDE_PROJECT_DIR] are propagated. CLAUDE_SESSION_ID,
// CLAUDE_TOOL_NAME, CLAUDE_TOOL_INPUT are NEVER set by Claude Code in any hook
// subprocess (only via SessionStart's CLAUDE_ENV_FILE export, applied to Bash
// tool invocations after SessionStart returns).
//
// CLAUDE_CODE_SSE_PORT is daemon-wide (single Claude Code daemon multiplexes
// all sessions on host through one SSE channel — verified Phase B3 / RCA
// 2026-05-04 via netstat: PID 26736 LISTENING + PID 30304 ESTABLISHED on
// loopback). DO NOT use sse_port for session lookup — every session-identity
// file on the host shares the same port value, so it has zero discriminating
// power.
//
// Therefore: any hook reading process.env.CLAUDE_TOOL_NAME, CLAUDE_TOOL_INPUT,
// or CLAUDE_SESSION_ID without a stdin fallback is silently no-op or
// collapsing all peer sessions onto a shared 'default' identity. Use
// resolveSessionId() in this module for session_id, and parse stdin directly
// for tool_name / tool_input / prompt / agent_id.

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
