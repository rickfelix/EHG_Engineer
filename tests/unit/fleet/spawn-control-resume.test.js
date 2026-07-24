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
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', 'abc-123']);
    expect(inv.program).toBe('wt.exe');
  });

  it('builds the base argv + repo-root cwd + persistent when no resumeUuid is given', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1' });
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd()]);
    expect(inv.cwd).toBe(resolveRepoRoot());
    expect(inv.persistent).toBe(true);
  });

  it('coerces a non-string resume token via String() (never leaks a raw object into argv)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 42 });
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', '42']);
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
