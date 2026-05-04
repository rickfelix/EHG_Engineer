// Tests for QF-20260504-932 — pre-tool-enforce.cjs stdin port
// Pre-fix: hook read process.env.CLAUDE_TOOL_NAME / CLAUDE_TOOL_INPUT /
// CLAUDE_SESSION_ID — Claude Code propagates none of these to PreToolUse
// subprocesses (verified by RCA #2 canaries). All 13 enforcement rules
// silently no-op fleet-wide. Post-fix: hook reads {tool_name, tool_input,
// session_id} JSON payload from stdin per documented PreToolUse contract.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../pre-tool-enforce.cjs').replace(/\\/g, '/');

function spawnHook(stdinPayload, extraEnv = {}) {
  const { spawn } = require('node:child_process');
  // The hook supports a TEST_DUMP_RESOLVED=1 mode that prints the resolved
  // {tool_name, tool_input_raw, session_id} as JSON and exits before any
  // enforcement runs. This lets tests verify the resolution path without
  // triggering side-effects (audit writes, exit-2 blocks, etc).
  const probe = spawn('node', [HOOK_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TEST_DUMP_RESOLVED: '1', ...extraEnv }
  });
  if (stdinPayload === null) {
    probe.stdin.end();
  } else {
    probe.stdin.end(stdinPayload);
  }
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

describe('QF-932 ENF-STDIN-1: tool_name from stdin populates TOOL_NAME', () => {
  it('reads tool_name from stdin payload', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'enf-stdin-1-abc',
      tool_name: 'Bash',
      tool_input: { command: 'echo hi' },
      hook_event_name: 'PreToolUse'
    }), { CLAUDE_TOOL_NAME: '' });
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tool_name).toBe('Bash');
  });
});

describe('QF-932 ENF-STDIN-2: tool_input from stdin (object) becomes TOOL_INPUT_RAW (JSON string)', () => {
  it('serializes object tool_input back to JSON string', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'enf-stdin-2-abc',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la', description: 'list' },
      hook_event_name: 'PreToolUse'
    }), { CLAUDE_TOOL_INPUT: '' });
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tool_input_raw).toBe(JSON.stringify({ command: 'ls -la', description: 'list' }));
  });
});

describe('QF-932 ENF-STDIN-3: session_id from stdin populates _SESSION_ID', () => {
  it('reads session_id from stdin payload', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'enf-stdin-3-xyz-789',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/x' },
      hook_event_name: 'PreToolUse'
    }), { CLAUDE_SESSION_ID: '', SESSION_ID: '' });
    const parsed = JSON.parse(r.stdout);
    expect(parsed.session_id).toBe('enf-stdin-3-xyz-789');
  });
});

describe('QF-932 ENF-STDIN-4: empty stdin → env fallback works', () => {
  it('falls back to env vars when stdin is empty', async () => {
    const r = await spawnHook(null, {
      CLAUDE_TOOL_NAME: 'Glob',
      CLAUDE_TOOL_INPUT: '{"pattern":"**/*.js"}',
      CLAUDE_SESSION_ID: 'env-fallback-session-001'
    });
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tool_name).toBe('Glob');
    expect(parsed.tool_input_raw).toBe('{"pattern":"**/*.js"}');
    expect(parsed.session_id).toBe('env-fallback-session-001');
  });
});

describe('QF-932 ENF-STDIN-5: malformed stdin JSON → graceful env fallback, no throw', () => {
  it('does not crash on malformed stdin', async () => {
    const r = await spawnHook('this is not json {{{', {
      CLAUDE_TOOL_NAME: 'Edit',
      CLAUDE_TOOL_INPUT: '{"file_path":"/tmp/y"}',
      CLAUDE_SESSION_ID: 'malformed-fallback-002'
    });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tool_name).toBe('Edit');
    expect(parsed.session_id).toBe('malformed-fallback-002');
  });
});

describe('QF-932 ENF-STDIN-6: stdin precedence over env', () => {
  it('stdin tool_name + session_id win over env when both present', async () => {
    const r = await spawnHook(JSON.stringify({
      session_id: 'stdin-wins-789',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/z', content: 'data' },
      hook_event_name: 'PreToolUse'
    }), {
      CLAUDE_TOOL_NAME: 'Glob',
      CLAUDE_TOOL_INPUT: '{"pattern":"x"}',
      CLAUDE_SESSION_ID: 'env-loses-001'
    });
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tool_name).toBe('Write');
    expect(parsed.session_id).toBe('stdin-wins-789');
    expect(parsed.tool_input_raw).toBe(JSON.stringify({ file_path: '/tmp/z', content: 'data' }));
  });
});

// QF-20260504-484: ENF-SD-CREATE-SKILL matcher tightening.
// Pre-fix: /leo-create-sd\.js/ substring match false-positived on script-name
// MENTIONS in argument strings. Post-fix: regex requires `node ` prefix at
// command-start or after shell separator. Tests run real enforcement (no
// TEST_DUMP_RESOLVED) and assert exit-code-2 (block) vs 0 (pass).
function spawnHookEnforce(stdinPayload, extraEnv = {}) {
  const { spawn } = require('node:child_process');
  const probe = spawn('node', [HOOK_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // SUPABASE_URL='' short-circuits audit-log writes so tests don't hit the DB.
    // Other ENF guards keyed off env vars set to safe-default values.
    env: {
      ...process.env,
      SUPABASE_URL: '',
      LEO_NPM_INSTALL_GUARD: 'off',
      ...extraEnv
    }
  });
  probe.stdin.end(stdinPayload);
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    probe.stdout.on('data', c => { stdout += c; });
    probe.stderr.on('data', c => { stderr += c; });
    probe.on('close', code => resolve({ stdout, stderr, code }));
  });
}

function bashPayload(command) {
  return JSON.stringify({
    session_id: 'enf9-test',
    tool_name: 'Bash',
    tool_input: { command },
    hook_event_name: 'PreToolUse'
  });
}

describe('QF-484 ENF-SD-CREATE-SKILL: false-positives no longer block', () => {
  it('passes log-harness-bug.js with script name in quoted description', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'node scripts/log-harness-bug.js "ENF-SD-CREATE-SKILL false-positive on leo-create-sd.js mention"'
    ));
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/PROTOCOL VIOLATION/);
  });

  it('passes gh search containing the script name', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'gh pr list --search "leo-create-sd.js"'
    ));
    expect(r.code).toBe(0);
  });

  it('passes Grep-equivalent grep over the script name', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'grep -r leo-create-sd.js scripts/'
    ));
    expect(r.code).toBe(0);
  });

  it('passes echo with script-name string content', async () => {
    const r = await spawnHookEnforce(bashPayload(
      "echo 'see scripts/leo-create-sd.js for details'"
    ));
    expect(r.code).toBe(0);
  });
});

describe('QF-484 ENF-SD-CREATE-SKILL: true-positives still block', () => {
  it('blocks bare node invocation', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'node scripts/leo-create-sd.js LEO infrastructure "test"'
    ));
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/ENF-SD-CREATE-SKILL/);
  });

  it('blocks node invocation after && chain', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'cd /tmp && node scripts/leo-create-sd.js --from-feedback abc'
    ));
    expect(r.code).toBe(2);
  });

  it('blocks node ./scripts/leo-create-sd.js path variant', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'node ./scripts/leo-create-sd.js LEO infrastructure "title"'
    ));
    expect(r.code).toBe(2);
  });
});

describe('QF-484 ENF-SD-CREATE-SKILL: bypass mechanisms', () => {
  it('passes when prefixed with SD_CREATE_VIA_SKILL=1', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js LEO infrastructure "test"'
    ));
    expect(r.code).toBe(0);
  });

  it('passes --help invocation', async () => {
    const r = await spawnHookEnforce(bashPayload(
      'node scripts/leo-create-sd.js --help'
    ));
    expect(r.code).toBe(0);
  });
});
