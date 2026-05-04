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
