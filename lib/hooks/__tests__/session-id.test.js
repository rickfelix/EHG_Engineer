// Tests for QF-20260504-765 — shared lib/hooks/session-id.cjs helper
// Pattern: spawn child node processes to deterministically control stdin
// (vitest cannot easily mock process.stdin event timing in-process).

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HELPER_PATH = path.resolve(__dirname, '../session-id.cjs').replace(/\\/g, '/');

function spawnHelper(stdinPayload, timeoutMs = 1000, fn = 'readSessionIdFromStdin', extraEnv = {}) {
  const { spawn } = require('node:child_process');
  const code = `
    const helper = require('${HELPER_PATH}');
    const fn = helper.${fn};
    Promise.resolve(fn(${timeoutMs})).then(v => {
      process.stdout.write(String(v), () => process.exit(0));
    });
  `;
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv }
  });
  if (stdinPayload === 'NO_END') {
    // Deliberately do NOT close stdin — let timeout fire
  } else if (stdinPayload === null) {
    probe.stdin.end();
  } else {
    probe.stdin.end(stdinPayload);
  }
  return new Promise((resolve) => {
    let buf = '';
    probe.stdout.on('data', c => { buf += c; });
    probe.on('close', () => resolve(buf));
  });
}

describe('HELPER-1: readSessionIdFromStdin parses session_id from valid JSON payload', () => {
  it('returns the parsed session_id', async () => {
    const out = await spawnHelper(JSON.stringify({
      session_id: 'helper-test-abc-123',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash'
    }));
    expect(out).toBe('helper-test-abc-123');
  });
});

describe('HELPER-2: readSessionIdFromStdin returns null on malformed JSON', () => {
  it('returns null', async () => {
    const out = await spawnHelper('{not valid json{{');
    expect(out).toBe('null');
  });
});

describe('HELPER-3: readSessionIdFromStdin returns null on timeout', () => {
  it('returns null when stdin never closes', async () => {
    const out = await spawnHelper('NO_END', 200);
    expect(out).toBe('null');
  });
});

describe('HELPER-4: resolveSessionId tries stdin first, falls back to env', () => {
  it('returns env value when stdin returns null but env is set', async () => {
    const out = await spawnHelper(null, 200, 'resolveSessionId', {
      CLAUDE_SESSION_ID: 'env-fallback-xyz'
    });
    expect(out).toBe('env-fallback-xyz');
  });

  it('returns stdin value when both are set (stdin wins)', async () => {
    const out = await spawnHelper(JSON.stringify({ session_id: 'stdin-wins-001' }), 1000, 'resolveSessionId', {
      CLAUDE_SESSION_ID: 'env-loses-xyz'
    });
    expect(out).toBe('stdin-wins-001');
  });
});

describe('HELPER-5: resolveSessionId returns null when stdin + env both miss', () => {
  it('returns null with empty stdin + no env', async () => {
    const env = { ...process.env };
    delete env.CLAUDE_SESSION_ID;
    const out = await spawnHelper(null, 200, 'resolveSessionId', { CLAUDE_SESSION_ID: '' });
    expect(out).toBe('null');
  });
});

// =============================================================================
// QF-20260504-297 — readSessionIdFromIdentityMarker (3rd resolveSessionId fallback)
// =============================================================================
// Pre-fix: coordination-inbox.cjs:200 read .claude/session-id.json (singular file)
// — never written by any code in repo. Coord sessions that don't claim SDs had
// no entry in any of the 4 lookup paths and the hook silently exited.
// Post-fix: read .claude/session-identity/pid-<ccPid>.json (canonical SessionStart
// markers, written by capture-session-id.cjs).

import fs from 'node:fs';
import os from 'node:os';

describe('QF-297 SI-FALLBACK-1: readSessionIdFromIdentityMarker returns session_id from pid-<ccPid>.json', () => {
  it('reads marker file and returns valid session_id', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-1-'));
    fs.writeFileSync(path.join(tmpDir, 'pid-99999.json'), JSON.stringify({
      session_id: 'fallback-1-abc-123',
      cc_pid: '99999',
      sse_port: '49999',
      source: 'test'
    }));
    const { readSessionIdFromIdentityMarker } = require(HELPER_PATH);
    expect(readSessionIdFromIdentityMarker({ markerDir: tmpDir, ccPid: '99999' }))
      .toBe('fallback-1-abc-123');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('QF-297 SI-FALLBACK-2: returns null when no marker file exists', () => {
  it('returns null with empty markerDir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-2-'));
    const { readSessionIdFromIdentityMarker } = require(HELPER_PATH);
    expect(readSessionIdFromIdentityMarker({ markerDir: tmpDir, ccPid: '99999' }))
      .toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('QF-297 SI-FALLBACK-3 (precedence): resolveSessionId tries stdin first, never reads marker', () => {
  it('returns stdin value when marker would also work', async () => {
    // Spawn helper with valid stdin AND a marker file in a tmp dir.
    // Pass markerDirOverride via env so the spawn child reads the same temp dir.
    // Expected: stdin's session_id wins, marker is irrelevant.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-3-'));
    fs.writeFileSync(path.join(tmpDir, 'pid-99999.json'), JSON.stringify({
      session_id: 'marker-loses-789'
    }));
    // resolveSessionId in spawnHelper takes only timeoutMs; precedence is
    // testable via observation: pass valid stdin AND have a marker — stdin wins.
    const out = await spawnHelper(JSON.stringify({
      session_id: 'stdin-wins-precedence-001'
    }), 1000, 'resolveSessionId', {
      // Force marker-fallback path to use the tmp dir (read by helper if stdin/env both empty)
      QF297_MARKER_DIR_OVERRIDE: tmpDir,
      QF297_CCPID_OVERRIDE: '99999'
    });
    expect(out).toBe('stdin-wins-precedence-001');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('QF-297 SI-FALLBACK-4: malformed JSON in marker → returns null gracefully', () => {
  it('returns null without throwing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-4-'));
    fs.writeFileSync(path.join(tmpDir, 'pid-99999.json'), '{not valid json{{');
    const { readSessionIdFromIdentityMarker } = require(HELPER_PATH);
    expect(() => readSessionIdFromIdentityMarker({ markerDir: tmpDir, ccPid: '99999' }))
      .not.toThrow();
    expect(readSessionIdFromIdentityMarker({ markerDir: tmpDir, ccPid: '99999' }))
      .toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('QF-297 SI-FALLBACK-5: marker has invalid session_id (regex fail) → returns null', () => {
  it('returns null when session_id fails security M4 regex', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-5-'));
    fs.writeFileSync(path.join(tmpDir, 'pid-99999.json'), JSON.stringify({
      session_id: '../../etc/passwd; rm -rf /',
      cc_pid: '99999'
    }));
    const { readSessionIdFromIdentityMarker } = require(HELPER_PATH);
    expect(readSessionIdFromIdentityMarker({ markerDir: tmpDir, ccPid: '99999' }))
      .toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('QF-297 SI-FALLBACK-6: env-empty + stdin-empty + marker present → marker wins', () => {
  it('returns the marker session_id when both stdin and env are empty', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-fallback-6-'));
    fs.writeFileSync(path.join(tmpDir, 'pid-99999.json'), JSON.stringify({
      session_id: 'marker-wins-fallback-001',
      cc_pid: '99999'
    }));
    const out = await spawnHelper(null, 200, 'resolveSessionId', {
      CLAUDE_SESSION_ID: '',
      QF297_MARKER_DIR_OVERRIDE: tmpDir,
      QF297_CCPID_OVERRIDE: '99999'
    });
    expect(out).toBe('marker-wins-fallback-001');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('HELPER-6: rejects malformed session_id (security M4)', () => {
  it('returns null when stdin payload contains shell-injection-like session_id', async () => {
    const out = await spawnHelper(JSON.stringify({
      session_id: '../../etc/passwd; rm -rf /'
    }));
    expect(out).toBe('null');
  });

  it('returns null when env contains shell-injection-like session_id and stdin is empty', async () => {
    const out = await spawnHelper(null, 200, 'resolveSessionId', {
      CLAUDE_SESSION_ID: 'has spaces and metacharacters!'
    });
    expect(out).toBe('null');
  });
});
