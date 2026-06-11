// SD-LEO-INFRA-PARK-VISIBILITY-LOOP-STATE-001 (class fix): the migration reminder
// hook read tool_name/tool_input from CLAUDE_TOOL_* env vars the harness never sets
// (RCA #2 2026-05-04) — dead since ship. Pins payload-first resolution with the env
// vars ABSENT, plus the env fallback for manual invocations.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../migration-execution-reminder.cjs');

function spawnHook(stdinPayload, env = {}) {
  const { spawn } = require('node:child_process');
  const spawnEnv = { ...process.env, ...env };
  for (const k of ['CLAUDE_TOOL_NAME', 'CLAUDE_TOOL_INPUT', 'CLAUDE_TOOL_OUTPUT']) {
    if (!(k in env)) delete spawnEnv[k];
  }
  const probe = spawn('node', [HOOK_PATH], { stdio: ['pipe', 'pipe', 'pipe'], env: spawnEnv });
  if (stdinPayload === null) probe.stdin.end();
  else probe.stdin.end(stdinPayload);
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

const MIGRATION_WRITE = {
  session_id: 'mig-payload-1',
  hook_event_name: 'PostToolUse',
  tool_name: 'Write',
  tool_input: {
    file_path: 'database/migrations/20260611_test_migration.sql',
    content: '-- SD-LEO-INFRA-PARK-VISIBILITY-LOOP-STATE-001\nCREATE TABLE x();'
  }
};

describe('MIG-PAYLOAD: harness-shaped invocation (env vars absent)', () => {
  it('emits the reminder for a migration Write delivered via stdin payload', async () => {
    const r = await spawnHook(JSON.stringify(MIGRATION_WRITE));
    expect(r.stdout).toContain('MIGRATION FILE CREATED');
    expect(r.stdout).toContain('20260611_test_migration.sql');
    expect(r.code).toBe(0);
  });

  it('silent for a non-Write payload', async () => {
    const r = await spawnHook(JSON.stringify({ ...MIGRATION_WRITE, tool_name: 'Bash' }));
    expect(r.stdout).not.toContain('MIGRATION FILE CREATED');
    expect(r.code).toBe(0);
  });

  it('silent for a Write to a non-migration path', async () => {
    const r = await spawnHook(JSON.stringify({
      ...MIGRATION_WRITE,
      tool_input: { file_path: 'src/components/Foo.tsx', content: 'x' }
    }));
    expect(r.stdout).not.toContain('MIGRATION FILE CREATED');
    expect(r.code).toBe(0);
  });

  it('silent + exit 0 with no stdin and no env (fail-open)', async () => {
    const r = await spawnHook(null);
    expect(r.stdout).not.toContain('MIGRATION FILE CREATED');
    expect(r.code).toBe(0);
  });
});

describe('MIG-ENV-FALLBACK: manual invocations still work via env', () => {
  it('emits the reminder when tool name/input arrive ONLY via env', async () => {
    const r = await spawnHook(null, {
      CLAUDE_TOOL_NAME: 'Write',
      CLAUDE_TOOL_INPUT: JSON.stringify(MIGRATION_WRITE.tool_input)
    });
    expect(r.stdout).toContain('MIGRATION FILE CREATED');
    expect(r.code).toBe(0);
  });
});
