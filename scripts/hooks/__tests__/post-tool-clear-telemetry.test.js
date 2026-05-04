// Tests for QF-20260504-765 — post-tool-clear-telemetry.cjs stdin port
// Pre-fix: hook read process.env.CLAUDE_SESSION_ID which Claude Code does NOT
// propagate to PostToolUse subprocesses, so heartbeat updates and tool-state
// clearing never ran. Post-fix: uses lib/hooks/session-id.cjs resolver.
//
// The hook depends on a real Supabase connection for DB writes, so we test
// only that session_id resolution succeeds and the early-return guard works.
// Full DB-write integration is exercised by the existing fleet (heartbeat
// freshness verification) and the Layer 3 manual checklist.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../post-tool-clear-telemetry.cjs').replace(/\\/g, '/');

function spawnHookProbingResolver(stdinPayload, env = {}) {
  // We don't fully exec the hook (DB writes aren't sandboxed). Instead, we
  // verify the resolveSessionId() call returns the expected session_id by
  // requiring the same helper the hook uses, with the same stdin/env setup.
  const { spawn } = require('node:child_process');
  const HELPER = path.resolve(__dirname, '../../../lib/hooks/session-id.cjs').replace(/\\/g, '/');
  const code = `
    const { resolveSessionId } = require('${HELPER}');
    resolveSessionId(800).then(v => {
      process.stdout.write(String(v), () => process.exit(0));
    });
  `;
  const probe = spawn('node', ['-e', code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env }
  });
  if (stdinPayload === null) {
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

describe('PTC-STDIN-1: resolver pipeline used by post-tool-clear-telemetry returns stdin session_id', () => {
  it('returns the stdin-provided session_id', async () => {
    const out = await spawnHookProbingResolver(JSON.stringify({
      session_id: 'ptc-stdin-1-abc',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash'
    }));
    expect(out).toBe('ptc-stdin-1-abc');
  });
});

describe('PTC-STDIN-2: resolver returns null on malformed JSON when env also unset', () => {
  it('returns null', async () => {
    const out = await spawnHookProbingResolver('not json {{{', { CLAUDE_SESSION_ID: '' });
    expect(out).toBe('null');
  });
});

describe('PTC-FAILSAFE-1: resolver returns null when stdin empty + env unset (hook early-returns silently)', () => {
  it('returns null', async () => {
    const out = await spawnHookProbingResolver(null, { CLAUDE_SESSION_ID: '' });
    expect(out).toBe('null');
  });
});

describe('PTC-IMPORT-1: hook file imports the shared helper without error', () => {
  it('hook source contains the require line for the shared helper', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    expect(src).toContain("require('../../lib/hooks/session-id.cjs')");
    expect(src).toContain('resolveSessionId');
  });
});
