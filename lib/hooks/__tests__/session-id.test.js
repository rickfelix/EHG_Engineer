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
