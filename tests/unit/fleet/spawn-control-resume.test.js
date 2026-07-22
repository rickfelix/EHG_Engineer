/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-4 — buildLiveSpawnInvocation `--resume` extension.
 * Updated for SD-LEO-INFRA-LEO-LAUNCHER-LIVE-ACTIVATION-CHECKPOINT-3-001 pilot fixes: the base argv is
 * now `new-tab -d <repo-root> -- <resolved claude.cmd>` (full claude path for wt.exe + repo-root
 * start-dir so the spawned session registers in claude_sessions). Assertions are resolver-aware
 * (against resolveClaudeCmd()/resolveRepoRoot()) so they hold on both Windows fleet hosts and CI.
 */
import { describe, it, expect } from 'vitest';
import { buildLiveSpawnInvocation, resolveClaudeCmd, resolveRepoRoot } from '../../../lib/fleet/spawn-control.js';

describe('buildLiveSpawnInvocation --resume (FR-4) + CHECKPOINT-3 pilot fixes', () => {
  it('appends [--resume, <uuid>] after the base argv (new-tab -d <root> -- <claude>)', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1', resumeUuid: 'abc-123' });
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', 'abc-123']);
    expect(inv.program).toBe('wt.exe');
  });

  it('builds the base argv + repo-root cwd when no resumeUuid is given (pilot FR-1/FR-2)', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1' });
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd()]);
    expect(inv.cwd).toBe(resolveRepoRoot()); // FR-2: spawned session starts at repo root
  });

  it('coerces a non-string resume token via String() (never leaks a raw object into argv)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 42 });
    expect(inv.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', '42']);
  });

  it('honors an explicit cwd override (used to pin the start-dir in tests / non-default hosts)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', cwd: 'D:\\repo\\root' });
    expect(inv.cwd).toBe('D:\\repo\\root');
    expect(inv.args).toEqual(['new-tab', '-d', 'D:\\repo\\root', '--', resolveClaudeCmd()]);
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
