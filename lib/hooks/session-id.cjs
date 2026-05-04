'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

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

// QF-20260504-297 — walk parent process tree via PowerShell to find Claude
// Code's PID. Mirrors lib/terminal-identity.js::_findClaudeCodePidViaTreeWalk.
// Returns the first node.exe ancestor whose parent is NOT another shell/node
// (cmd, powershell, terminal host) — that's Claude Code itself.
function findClaudeCodeCcPid() {
  try {
    const script = [
      `$p = ${process.pid}`,
      '$chain = @()',
      'while ($p -and $p -ne 0) {',
      '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue',
      '  if (-not $proc) { break }',
      '  $chain += "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)"',
      '  $p = $proc.ParentProcessId',
      '}',
      '$chain -join ";"'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000
    }).trim();
    if (!raw) return null;
    const chain = raw.split(';').map(e => {
      const [pid, name, ppid] = e.split('|');
      return { pid, name: (name || '').toLowerCase(), ppid };
    });
    const intermediates = ['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh',
      'powershell.exe', 'pwsh.exe', 'npx', 'npx.exe', 'npx.cmd'];
    for (let i = 1; i < chain.length; i++) {
      if (chain[i].name === 'node.exe' || chain[i].name === 'node') {
        const parent = chain[i + 1];
        if (!parent || !intermediates.includes(parent.name)) return chain[i].pid;
      }
    }
    return null;
  } catch { return null; }
}

// QF-20260504-297 — read session_id from canonical SessionStart marker dir
// (.claude/session-identity/pid-<ccPid>.json). Replaces the never-written
// .claude/session-id.json lookup in coordination-inbox.cjs (RCA 2026-05-04).
// opts.markerDir: override default <project>/.claude/session-identity (testing)
// opts.ccPid: override findClaudeCodeCcPid() result (testing)
function readSessionIdFromIdentityMarker(opts = {}) {
  try {
    const markerDir = opts.markerDir || path.resolve(__dirname, '../../.claude/session-identity');
    const ccPid = opts.ccPid || findClaudeCodeCcPid();
    if (!ccPid) return null;
    const markerFile = path.join(markerDir, 'pid-' + ccPid + '.json');
    if (!fs.existsSync(markerFile)) return null;
    const data = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    return isValidSessionId(data?.session_id) ? data.session_id : null;
  } catch { return null; }
}

// QF-20260504-749 — Windows fallback when findClaudeCodeCcPid PowerShell scan
// fails (process gone, slow CIM call, etc). Reads the most-recently-modified
// pid-*.json marker in markerDir, on the assumption the active CC session
// updated theirs most recently. Strictly weaker than ccPid lookup — only used
// after that path returns null.
function readLatestMarkerByMtime(markerDirArg) {
  try {
    const markerDir = markerDirArg || path.resolve(__dirname, '../../.claude/session-identity');
    if (!fs.existsSync(markerDir)) return null;
    const candidates = fs.readdirSync(markerDir)
      .filter(f => f.startsWith('pid-') && f.endsWith('.json'))
      .map(f => {
        try { return { f, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    for (const { f } of candidates) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(markerDir, f), 'utf8'));
        if (isValidSessionId(data?.session_id)) return data.session_id;
      } catch { /* keep trying */ }
    }
    return null;
  } catch { return null; }
}

// QF-20260504-749 — diagnostic write-canary for null-resolution paths.
// Writes a one-shot JSON file to os.tmpdir()/claude-hook-resolve-null/ with
// {pid, ppid, ts, steps:{stdin,env,marker,mtime}} so future RCAs can tell why
// a hook fired but resolveSessionId returned null. Best-effort, never throws.
function logNullResolution(steps) {
  try {
    const dir = path.join(os.tmpdir(), 'claude-hook-resolve-null');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `pid-${process.pid}-${ts}.json`),
      JSON.stringify({ pid: process.pid, ppid: process.ppid, ts: new Date().toISOString(), steps }));
  } catch { /* best-effort */ }
}

async function resolveSessionId(timeoutMs = 250) {
  const fromStdin = await readSessionIdFromStdin(timeoutMs);
  if (isValidSessionId(fromStdin)) return fromStdin;
  const fromEnv = process.env.CLAUDE_SESSION_ID;
  if (isValidSessionId(fromEnv)) return fromEnv;
  // QF-20260504-297: 3rd fallback — canonical marker dir. Test overrides via
  // QF297_MARKER_DIR_OVERRIDE / QF297_CCPID_OVERRIDE so spawned children can
  // exercise the fallback against a tmp dir without touching real markers.
  const markerDirOverride = process.env.QF297_MARKER_DIR_OVERRIDE || undefined;
  const fromMarker = readSessionIdFromIdentityMarker({
    markerDir: markerDirOverride,
    ccPid: process.env.QF297_CCPID_OVERRIDE || undefined
  });
  if (isValidSessionId(fromMarker)) return fromMarker;
  // QF-20260504-749: 4th fallback — latest marker by mtime when ccPid lookup
  // failed (PowerShell scan gone awry on Windows). Strictly weaker than #3.
  const fromMtime = readLatestMarkerByMtime(markerDirOverride);
  if (isValidSessionId(fromMtime)) return fromMtime;
  if (process.env.QF749_DISABLE_NULL_LOG !== '1') {
    logNullResolution({ stdin: false, env: false, marker: false, mtime: false });
  }
  return null;
}

module.exports = {
  readSessionIdFromStdin,
  resolveSessionId,
  isValidSessionId,
  // QF-20260504-297 — exposed for tests + direct use by coordination-inbox.cjs
  readSessionIdFromIdentityMarker,
  findClaudeCodeCcPid,
  // QF-20260504-749 — exposed for tests
  readLatestMarkerByMtime,
  logNullResolution
};
