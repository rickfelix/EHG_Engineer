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
    // QF-20260525-425: disable the LEARN-129 RCA repeat-invocation guard (ENF 11).
    // These tests spawn the hook repeatedly with the SAME command (e.g. T3-T7,T10 all
    // send 'git push --force-with-lease') under a constant session_id ('enf9-test'),
    // so the session-scoped 10-min repeat counter (.claude/retry-state-enf9-test.json)
    // accumulates across cases AND runs, tripping a tiered block that pre-empts the
    // enforcement rule under test → non-deterministic RED. The guard is orthogonal to
    // ENF-15/ENF-SD-CREATE-SKILL, so neutralize it (mirrors LEO_NPM_INSTALL_GUARD above).
    env: {
      ...process.env,
      SUPABASE_URL: '',
      LEO_NPM_INSTALL_GUARD: 'off',
      LEO_RCA_ENFORCEMENT: 'off',
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

// SD-FDBK-INFRA-ALLOW-FORCE-LEASE-001 ENF-15: force-push gate.
// 5-condition AND gate (env-var + sole-author + branch-allowlist + --with-lease + non-protected).
// Decision tree cascades deny-by-default. Test seam: TEST_OVERRIDE_BRANCH and
// TEST_OVERRIDE_GIT_LOG short-circuit the git subprocess calls (the hook is spawned as
// a CJS subprocess — module-level mocking does not apply).
describe('ENF-15: force-push gate (SD-FDBK-INFRA-ALLOW-FORCE-LEASE-001)', () => {
  it('T1 blocks bare --force regardless of env var', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push origin HEAD --force'),
      { LEO_FORCE_PUSH_OWN_BRANCH: 'allow', TEST_OVERRIDE_BRANCH: 'feat/SD-X' }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=bare_force_disallowed/);
  });

  it('T2 blocks --force-with-lease on main even with env=allow', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease origin HEAD'),
      { LEO_FORCE_PUSH_OWN_BRANCH: 'allow', TEST_OVERRIDE_BRANCH: 'main' }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=protected_branch_denylist/);
  });

  it('T3 blocks when env var unset (default flag-OFF)', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      { LEO_FORCE_PUSH_OWN_BRANCH: '', TEST_OVERRIDE_BRANCH: 'feat/SD-X' }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=env_var_unset/);
  });

  it('T4 blocks when branch is not in SD/QF allowlist', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      { LEO_FORCE_PUSH_OWN_BRANCH: 'allow', TEST_OVERRIDE_BRANCH: 'hotfix/123' }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=branch_not_allowlisted/);
  });

  it('T5 blocks when commit reachable from origin/main..HEAD has non-self email', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      {
        LEO_FORCE_PUSH_OWN_BRANCH: 'allow',
        TEST_OVERRIDE_BRANCH: 'feat/SD-X',
        TEST_OVERRIDE_USER_EMAIL: 'me@example.com',
        TEST_OVERRIDE_GIT_LOG: 'me@example.com,me@example.com\nother@example.com,me@example.com'
      }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=multi_author_branch/);
  });

  it('T6 grants override on solo SD branch when all 5 conditions pass', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      {
        LEO_FORCE_PUSH_OWN_BRANCH: 'allow',
        TEST_OVERRIDE_BRANCH: 'feat/SD-FDBK-INFRA-ALLOW-FORCE-LEASE-001',
        TEST_OVERRIDE_USER_EMAIL: 'me@example.com',
        TEST_OVERRIDE_GIT_LOG: 'me@example.com,me@example.com\nme@example.com,me@example.com'
      }
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });

  it('T7 blocks --force-with-lease on release/* branch (denylist match)', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      { LEO_FORCE_PUSH_OWN_BRANCH: 'allow', TEST_OVERRIDE_BRANCH: 'release/v2.0' }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=protected_branch_denylist/);
  });

  it('T8 unrelated git commands are not affected by ENF-15', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push origin HEAD'),
      { LEO_FORCE_PUSH_OWN_BRANCH: 'allow', TEST_OVERRIDE_BRANCH: 'feat/SD-X' }
    );
    // Plain git push (no --force) must pass-through ENF-15 — should not match the gate.
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });

  it('T9 bypasses gate when command contains --help', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease --help'),
      { LEO_FORCE_PUSH_OWN_BRANCH: '' } // even with env unset
    );
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });
});

// ENF-15 sole-contributor: requires git config user.email parity. The T6 success path
// relies on git config in CI returning a value; vitest CI sets git config. The test
// would otherwise fall through to git_error when user.email is empty — covered by T10.
describe('ENF-15: git-environment edge cases', () => {
  it('T10 blocks when commit log shows different email than current user', async () => {
    // When user.email is "me@example.com" but commit log only has "someone-else@example.com",
    // the gate must block (no parity between current user identity and branch authors).
    const r = await spawnHookEnforce(
      bashPayload('git push --force-with-lease'),
      {
        LEO_FORCE_PUSH_OWN_BRANCH: 'allow',
        TEST_OVERRIDE_BRANCH: 'feat/SD-X',
        TEST_OVERRIDE_USER_EMAIL: 'me@example.com',
        TEST_OVERRIDE_GIT_LOG: 'someone-else@example.com,someone-else@example.com'
      }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[ENF-15\] BLOCKED reason=multi_author_branch/);
  });
});

// QF-20260525-345 (RCA 6188492f): ENF-15 must match only the OPERATIVE `git push …
// --force` command, never an incidental MENTION of the phrase inside a quoted argument.
// Pre-fix the boundary class `[\s;&|`]` admitted a bare space AND a backtick, so PR/issue
// bodies (markdown code-spans use backticks), commit messages, and echo/grep that
// referenced the phrase were blocked. Mirrors the QF-484 ENF-SD-CREATE-SKILL fix.
describe('ENF-15: quoted-mention false-positives no longer block (QF-20260525-345)', () => {
  // Non-allowlisted branch + override flag unset → a FALSE match would surface as
  // `[ENF-15] BLOCKED reason=env_var_unset` (the reported bug). Post-fix these are not
  // the operative command, so ENF-15 must pass-through (no [ENF-15] BLOCKED emitted).
  const env = { LEO_FORCE_PUSH_OWN_BRANCH: '', TEST_OVERRIDE_BRANCH: 'hotfix/123' };

  it('T11 gh pr --body with backtick-markdown mention does not block (reported case)', async () => {
    const r = await spawnHookEnforce(
      bashPayload('gh pr create --body "share the command `git push --force-with-lease` here"'),
      env
    );
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });

  it('T12 git commit -m with phrase mention does not block', async () => {
    const r = await spawnHookEnforce(
      bashPayload('git commit -m "fix: handle git push --force edge case"'),
      env
    );
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });

  it('T13 echo with phrase mention does not block', async () => {
    const r = await spawnHookEnforce(
      bashPayload('echo "run git push --force-with-lease to deploy"'),
      env
    );
    expect(r.stderr).not.toMatch(/\[ENF-15\] BLOCKED/);
  });
});
