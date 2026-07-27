/**
 * buildLiveSpawnInvocation `--resume` extension — now DELEGATES to the canonical buildSessionLaunch
 * (SD-LEO-INFRA-LEO-APP-LAUNCHER-001 FR-2). The base argv is `new-tab -d <repo-root> -- <resolved
 * claude.cmd>` (full claude path + repo-root start dir so the session registers in claude_sessions).
 * Assertions are resolver-aware so they hold on both Windows fleet hosts and CI.
 */
import { describe, it, expect } from 'vitest';
import { buildLiveSpawnInvocation } from '../../../lib/fleet/spawn-control.js';
import { resolveClaudeCmd, resolveRepoRoot } from '../../../lib/fleet/build-session-launch.cjs';

describe('buildLiveSpawnInvocation --resume (via canonical buildSessionLaunch)', () => {
  it('appends [--resume, <uuid>] after the base argv (new-tab -d <root> -- <claude>)', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1', resumeUuid: 'abc-123' });
    expect(inv.args).toEqual(['-w', 'new', 'new-tab', '--title', 'Worker-1', '--suppressApplicationTitle', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--permission-mode', 'auto', '--resume', 'abc-123']);
    expect(inv.program).toBe('wt.exe');
  });

  it('builds the base argv + a MINTED --session-id + repo-root cwd + persistent when no resumeUuid is given', () => {
    // FR-3: with no conversation to resume, the spawner mints the session id so it knows in advance
    // what the child will register as. uuidFn is injected purely for determinism.
    const MINTED = '11111111-2222-4333-8444-555555555555';
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1' }, { uuidFn: () => MINTED });
    expect(inv.args).toEqual(['-w', 'new', 'new-tab', '--title', 'Worker-1', '--suppressApplicationTitle', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--permission-mode', 'auto', '--session-id', MINTED]);
    expect(inv.sessionId).toBe(MINTED);
    expect(inv.cwd).toBe(resolveRepoRoot());
    expect(inv.persistent).toBe(true);
  });

  it('FR-3: --session-id and --resume are mutually exclusive (resuming adopts an existing id)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 'abc-123' });
    expect(inv.args).not.toContain('--session-id');
    expect(inv.sessionId).toBe('abc-123'); // still known to the caller, via the resume token
  });

  it('FR-3: DROPS a malformed minted id rather than passing a value the CLI would reject', () => {
    // The CLI requires a valid UUID and fails the launch on anything else. Losing correlation is
    // recoverable; losing the session is not — so a bad id degrades to no --session-id at all.
    const inv = buildLiveSpawnInvocation({ callsign: 'W' }, { uuidFn: () => 'not-a-uuid' });
    expect(inv.args).not.toContain('--session-id');
    expect(inv.args).not.toContain('not-a-uuid');
    expect(inv.sessionId).toBeNull();
  });

  it('FR-3: mints a DISTINCT id per spawn (two sessions must never collide on one id)', () => {
    const a = buildLiveSpawnInvocation({ callsign: 'W1' });
    const b = buildLiveSpawnInvocation({ callsign: 'W2' });
    expect(a.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('coerces a non-string resume token via String() (never leaks a raw object into argv)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 42 });
    expect(inv.args).toEqual(['-w', 'new', 'new-tab', '--title', 'W', '--suppressApplicationTitle', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--permission-mode', 'auto', '--resume', '42']);
  });

  it('injects CLAUDE_CONFIG_DIR only into the returned env, never process.env, and never as an argv token', () => {
    const before = process.env.CLAUDE_CONFIG_DIR;
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1', profileDir: 'C:\\profiles\\canary', resumeUuid: 'u-1' });
    expect(inv.env.CLAUDE_CONFIG_DIR).toBe('C:\\profiles\\canary');
    expect(inv.args).not.toContain('C:\\profiles\\canary');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(before); // isolation invariant untouched
  });

  it('omits CLAUDE_CONFIG_DIR from env when no profileDir is given', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 'u' });
    expect(inv.env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(inv.env.FLEET_WORKER_CALLSIGN).toBe('W');
  });
});
