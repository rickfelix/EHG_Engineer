// Tests for QF-20260504-840 — session-cleanup.js stdin port
// Pre-fix: same env-var bug → SESSION_ID collided to 'default' across peers,
// risking deletion of peer session marker files during cleanup walk.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../session-cleanup.js').replace(/\\/g, '/');

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

describe('QF-840 CLEANUP-STDIN-1: session_id from stdin populates SESSION_ID', () => {
  it('reads session_id from UserPromptSubmit stdin', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'cleanup-stdin-1-abc',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'test'
    }), { CLAUDE_SESSION_ID: '' });
    expect(JSON.parse(r.stdout).session_id).toBe('cleanup-stdin-1-abc');
  });
});

describe('QF-840 CLEANUP-STDIN-2: empty stdin → env fallback', () => {
  it('falls back to env when stdin empty', async () => {
    const r = await spawnHook(null, { CLAUDE_SESSION_ID: 'env-cleanup-002' });
    expect(JSON.parse(r.stdout).session_id).toBe('env-cleanup-002');
  });
});

describe('QF-840 CLEANUP-STDIN-3: malformed stdin → env fallback, no throw', () => {
  it('does not crash on malformed stdin', async () => {
    const r = await spawnHook('not json {{{', { CLAUDE_SESSION_ID: 'malformed-cleanup-003' });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).session_id).toBe('malformed-cleanup-003');
  });
});
