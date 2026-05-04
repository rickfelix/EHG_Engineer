// Tests for QF-20260504-840 — autonomous-checkpoint.js stdin port
// Pre-fix: read process.env.CLAUDE_SESSION_ID (never propagated by Claude Code
// to UserPromptSubmit subprocesses) → all peers collided on session-default.json.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../autonomous-checkpoint.js').replace(/\\/g, '/');

function spawnHook(stdinPayload, extraEnv = {}) {
  const { spawn } = require('node:child_process');
  const probe = spawn('node', [HOOK_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TEST_DUMP_RESOLVED: '1', ...extraEnv }
  });
  if (stdinPayload === null) probe.stdin.end();
  else probe.stdin.end(stdinPayload);
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

describe('QF-840 CKPT-STDIN-1: session_id from stdin populates SESSION_ID', () => {
  it('reads session_id from UserPromptSubmit stdin payload', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'ckpt-stdin-1-abc',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'test'
    }), { CLAUDE_SESSION_ID: '' });
    expect(JSON.parse(r.stdout).session_id).toBe('ckpt-stdin-1-abc');
  });
});

describe('QF-840 CKPT-STDIN-2: empty stdin → env fallback', () => {
  it('falls back to CLAUDE_SESSION_ID env when stdin empty', async () => {
    const r = await spawnHook(null, { CLAUDE_SESSION_ID: 'env-ckpt-002' });
    expect(JSON.parse(r.stdout).session_id).toBe('env-ckpt-002');
  });
});

describe('QF-840 CKPT-STDIN-3: malformed stdin → env fallback, no throw', () => {
  it('does not crash on malformed stdin', async () => {
    const r = await spawnHook('not json {{{', { CLAUDE_SESSION_ID: 'malformed-ckpt-003' });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).session_id).toBe('malformed-ckpt-003');
  });
});

describe('QF-840 CKPT-STDIN-4: stdin precedence over env', () => {
  it('stdin session_id wins when both present', async () => {
    const r = await spawnHook(JSON.stringify({ session_id: 'stdin-wins-ckpt' }), {
      CLAUDE_SESSION_ID: 'env-loses-ckpt'
    });
    expect(JSON.parse(r.stdout).session_id).toBe('stdin-wins-ckpt');
  });
});
