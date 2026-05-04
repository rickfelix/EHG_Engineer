// Tests for QF-20260504-964 FIX 1
// scripts/hooks/coordination-inbox.cjs — getCurrentSessionId env-var precedence
//
// The hook silently exited fleet-wide because:
//   .claude/session-id.json is rarely present and the PID-scan fallback fails on
//   Windows where process.ppid resolves to 1. Workers never delivered any of the
//   16+ hours of broadcast COACHING messages witnessed on 2026-05-04.
//
// FIX 1 makes process.env.CLAUDE_SESSION_ID the canonical first lookup.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../coordination-inbox.cjs');
const SESSION_ID_FILE = path.resolve(__dirname, '../../../.claude/session-id.json');

function loadHook() {
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

// =============================================================================
// QF-20260504-912: Per-session throttle + heartbeat (closes peer-starvation bug)
// =============================================================================
// Pre-fix: THROTTLE_FILE and HEARTBEAT_FILE were host-shared paths. With 6
// active sessions, the first hook fire marks the throttle and the next 5
// sessions skip their inbox check for up to 60s — message starvation.
// Post-fix: per-session paths mirror the friction-counters pattern at lines
// ~96-125 of coordination-inbox.cjs.

describe('QF-912 THROTTLE-1: shouldCheck(sessionId) is per-session, not global', () => {
  it('returns true for session A even when session B just marked its throttle', () => {
    const hook = loadHook();
    const sidA = 'sessionA-throttle1';
    const sidB = 'sessionB-throttle1';
    // Wipe both sessions' throttle files first
    try { fs.unlinkSync(hook.getThrottleFile(sidA)); } catch {}
    try { fs.unlinkSync(hook.getThrottleFile(sidB)); } catch {}
    // B marks throttle (recent)
    hook.markChecked(sidB);
    // A's check must still return true — A has no own throttle file
    expect(hook.shouldCheck(sidA)).toBe(true);
    // Cleanup
    try { fs.unlinkSync(hook.getThrottleFile(sidA)); } catch {}
    try { fs.unlinkSync(hook.getThrottleFile(sidB)); } catch {}
  });
});

describe('QF-912 THROTTLE-2: shouldCheck(sessionId) returns false only when same session is fresh', () => {
  it('returns false for session A when A itself just marked', () => {
    const hook = loadHook();
    const sid = 'sessionA-throttle2';
    try { fs.unlinkSync(hook.getThrottleFile(sid)); } catch {}
    hook.markChecked(sid);
    expect(hook.shouldCheck(sid)).toBe(false);
    try { fs.unlinkSync(hook.getThrottleFile(sid)); } catch {}
  });
});

describe('QF-912 THROTTLE-3: markChecked(sessionId) writes a per-session file', () => {
  it('writes to a path containing the sessionId and not to the global path', () => {
    const hook = loadHook();
    const sid = 'sessionA-throttle3';
    const expected = hook.getThrottleFile(sid);
    expect(expected).toContain(sid);
    expect(expected).not.toBe(path.join(require('os').tmpdir(), 'claude-coordination-inbox-last-check.json'));
    try { fs.unlinkSync(expected); } catch {}
    hook.markChecked(sid);
    expect(fs.existsSync(expected)).toBe(true);
    try { fs.unlinkSync(expected); } catch {}
  });
});

describe('QF-912 THROTTLE-4: invalid sessionId is rejected gracefully (security M4)', () => {
  it('does not write a file and shouldCheck returns true (fail-open) for malformed sessionId', () => {
    const hook = loadHook();
    const bad = '../../etc/passwd';
    // markChecked must not throw and must not write
    expect(() => hook.markChecked(bad)).not.toThrow();
    // shouldCheck should not throw
    expect(() => hook.shouldCheck(bad)).not.toThrow();
    // Returns true (fail-open) because invalid sessionId means no per-session state can exist
    expect(hook.shouldCheck(bad)).toBe(true);
  });
});

describe('QF-912 HEARTBEAT-1: shouldHeartbeat(sessionId) is per-session', () => {
  it('returns true for A even when B just heartbeated', () => {
    const hook = loadHook();
    const sidA = 'sessionA-hb1';
    const sidB = 'sessionB-hb1';
    try { fs.unlinkSync(hook.getHeartbeatFile(sidA)); } catch {}
    try { fs.unlinkSync(hook.getHeartbeatFile(sidB)); } catch {}
    hook.markHeartbeat(sidB);
    expect(hook.shouldHeartbeat(sidA)).toBe(true);
    try { fs.unlinkSync(hook.getHeartbeatFile(sidA)); } catch {}
    try { fs.unlinkSync(hook.getHeartbeatFile(sidB)); } catch {}
  });
});

describe('QF-912 HEARTBEAT-2: shouldHeartbeat(sessionId) returns false only when same session is fresh', () => {
  it('returns false for A when A itself just heartbeated', () => {
    const hook = loadHook();
    const sid = 'sessionA-hb2';
    try { fs.unlinkSync(hook.getHeartbeatFile(sid)); } catch {}
    hook.markHeartbeat(sid);
    expect(hook.shouldHeartbeat(sid)).toBe(false);
    try { fs.unlinkSync(hook.getHeartbeatFile(sid)); } catch {}
  });
});

describe('QF-912 HEARTBEAT-3: markHeartbeat(sessionId) writes a per-session file', () => {
  it('writes to a path containing the sessionId', () => {
    const hook = loadHook();
    const sid = 'sessionA-hb3';
    const expected = hook.getHeartbeatFile(sid);
    expect(expected).toContain(sid);
    expect(expected).not.toBe(path.join(require('os').tmpdir(), 'claude-heartbeat-last-update.json'));
    try { fs.unlinkSync(expected); } catch {}
    hook.markHeartbeat(sid);
    expect(fs.existsSync(expected)).toBe(true);
    try { fs.unlinkSync(expected); } catch {}
  });
});

describe('QF-912 HEARTBEAT-4: invalid sessionId is rejected gracefully', () => {
  it('does not write a file and shouldHeartbeat returns true (fail-open)', () => {
    const hook = loadHook();
    const bad = 'has spaces and !!!';
    expect(() => hook.markHeartbeat(bad)).not.toThrow();
    expect(() => hook.shouldHeartbeat(bad)).not.toThrow();
    expect(hook.shouldHeartbeat(bad)).toBe(true);
  });
});

describe('QF-912 CROSS-SESSION-1: 6 sessions can all check independently within same window', () => {
  it('after 6 distinct markChecked calls, all 6 throttle files exist at distinct paths', () => {
    const hook = loadHook();
    const sids = ['sess1', 'sess2', 'sess3', 'sess4', 'sess5', 'sess6'].map(s => 'qf912-' + s);
    sids.forEach(sid => { try { fs.unlinkSync(hook.getThrottleFile(sid)); } catch {} });
    sids.forEach(sid => hook.markChecked(sid));
    const paths = sids.map(sid => hook.getThrottleFile(sid));
    // All paths distinct
    expect(new Set(paths).size).toBe(6);
    // All files exist
    paths.forEach(p => expect(fs.existsSync(p)).toBe(true));
    // None is the legacy shared path
    paths.forEach(p => expect(p).not.toBe(path.join(require('os').tmpdir(), 'claude-coordination-inbox-last-check.json')));
    // Cleanup
    paths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
  });
});

describe('HOOK-1: getCurrentSessionId returns process.env.CLAUDE_SESSION_ID when set', () => {
  const originalEnv = process.env.CLAUDE_SESSION_ID;
  let sessionFileBackup = null;

  beforeEach(() => {
    if (fs.existsSync(SESSION_ID_FILE)) {
      sessionFileBackup = fs.readFileSync(SESSION_ID_FILE, 'utf8');
      fs.unlinkSync(SESSION_ID_FILE);
    }
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = originalEnv;
    if (sessionFileBackup !== null) {
      fs.mkdirSync(path.dirname(SESSION_ID_FILE), { recursive: true });
      fs.writeFileSync(SESSION_ID_FILE, sessionFileBackup);
      sessionFileBackup = null;
    }
  });

  it('returns the env var verbatim', () => {
    process.env.CLAUDE_SESSION_ID = 'env-session-abc-123';
    const { getCurrentSessionId } = loadHook();
    expect(getCurrentSessionId()).toBe('env-session-abc-123');
  });
});

describe('HOOK-2: env var takes priority over session-id.json file', () => {
  const originalEnv = process.env.CLAUDE_SESSION_ID;
  let sessionFileBackup = null;
  let didWriteFile = false;

  beforeEach(() => {
    if (fs.existsSync(SESSION_ID_FILE)) {
      sessionFileBackup = fs.readFileSync(SESSION_ID_FILE, 'utf8');
    }
    fs.mkdirSync(path.dirname(SESSION_ID_FILE), { recursive: true });
    fs.writeFileSync(SESSION_ID_FILE, JSON.stringify({ session_id: 'file-session-xyz-789' }));
    didWriteFile = true;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = originalEnv;
    if (didWriteFile) {
      try { fs.unlinkSync(SESSION_ID_FILE); } catch { /* ignore */ }
      didWriteFile = false;
    }
    if (sessionFileBackup !== null) {
      fs.writeFileSync(SESSION_ID_FILE, sessionFileBackup);
      sessionFileBackup = null;
    }
  });

  it('returns env value even when file exists with a different ID', () => {
    process.env.CLAUDE_SESSION_ID = 'env-wins-001';
    const { getCurrentSessionId } = loadHook();
    expect(getCurrentSessionId()).toBe('env-wins-001');
  });
});

describe('STDIN-1: readSessionIdFromStdin parses {session_id} from stdin (QF-20260504-007)', () => {
  // Use a child process to control stdin deterministically — vitest cannot easily
  // mock process.stdin's data-event timing in-process.
  it('returns session_id when Claude Code passes JSON payload via stdin', async () => {
    const { spawn } = require('node:child_process');
    const probe = spawn('node', ['-e', `
      const hook = require('${HOOK_PATH.replace(/\\/g, '/')}');
      hook.readSessionIdFromStdin(1000).then(sid => { process.stdout.write(String(sid), () => process.exit(0)); });
    `], { stdio: ['pipe', 'pipe', 'pipe'] });
    probe.stdin.end(JSON.stringify({
      session_id: 'abc-from-stdin-123',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash'
    }));
    const out = await new Promise((resolve) => {
      let buf = '';
      probe.stdout.on('data', c => { buf += c; });
      probe.on('close', () => resolve(buf));
    });
    expect(out).toBe('abc-from-stdin-123');
  });

  it('returns null on malformed JSON', async () => {
    const { spawn } = require('node:child_process');
    const probe = spawn('node', ['-e', `
      const hook = require('${HOOK_PATH.replace(/\\/g, '/')}');
      hook.readSessionIdFromStdin(500).then(sid => { process.stdout.write(String(sid), () => process.exit(0)); });
    `], { stdio: ['pipe', 'pipe', 'pipe'] });
    probe.stdin.end('this is not json {{{');
    const out = await new Promise((resolve) => {
      let buf = '';
      probe.stdout.on('data', c => { buf += c; });
      probe.on('close', () => resolve(buf));
    });
    expect(out).toBe('null');
  });

  it('returns null on timeout (empty stdin, never closes)', async () => {
    const { spawn } = require('node:child_process');
    const probe = spawn('node', ['-e', `
      const hook = require('${HOOK_PATH.replace(/\\/g, '/')}');
      hook.readSessionIdFromStdin(150).then(sid => { process.stdout.write(String(sid), () => process.exit(0)); });
    `], { stdio: ['pipe', 'pipe', 'pipe'] });
    // Deliberately do NOT call probe.stdin.end() — let timeout trigger
    const out = await new Promise((resolve) => {
      let buf = '';
      probe.stdout.on('data', c => { buf += c; });
      probe.on('close', () => resolve(buf));
    });
    probe.stdin.end(); // cleanup
    expect(out).toBe('null');
  });
});

describe('HOOK-3: returns null when env var unset AND file missing AND no PID match', () => {
  const originalEnv = process.env.CLAUDE_SESSION_ID;
  let sessionFileBackup = null;

  beforeEach(() => {
    delete process.env.CLAUDE_SESSION_ID;
    if (fs.existsSync(SESSION_ID_FILE)) {
      sessionFileBackup = fs.readFileSync(SESSION_ID_FILE, 'utf8');
      fs.unlinkSync(SESSION_ID_FILE);
    }
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = originalEnv;
    if (sessionFileBackup !== null) {
      fs.mkdirSync(path.dirname(SESSION_ID_FILE), { recursive: true });
      fs.writeFileSync(SESSION_ID_FILE, sessionFileBackup);
      sessionFileBackup = null;
    }
  });

  it('returns null with no env, no file, and PID scan miss', () => {
    const { getCurrentSessionId } = loadHook();
    // PID scan can match a real session in ~/.claude-sessions on dev machines —
    // accept null OR a matched string, but the env-var path must not have fired.
    const result = getCurrentSessionId();
    if (result !== null) {
      // If it matched a real session, it must NOT be our reserved sentinel.
      expect(result).not.toBe('env-wins-001');
      expect(result).not.toBe('env-session-abc-123');
    } else {
      expect(result).toBeNull();
    }
  });
});
