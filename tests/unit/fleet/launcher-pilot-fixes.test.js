// SD-LEO-INFRA-LEO-LAUNCHER-LIVE-ACTIVATION-CHECKPOINT-3-001 — the 4 pre-drill PILOT FIXES.
// A launcher that spawns-but-does-not-register/isolate would pass a shallow drill and fail reality;
// these fixes (full claude.cmd path, repo-root cwd, no silent isolation degrade) gate the S4-S6 drills.
import { describe, it, expect, vi } from 'vitest';
import { resolveClaudeCmd, resolveRepoRoot, buildLiveSpawnInvocation } from '../../../lib/fleet/spawn-control.js';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';

describe('FR-1 resolveClaudeCmd — full claude launcher path (bare claude fails in wt.exe 0x80070002)', () => {
  it('returns an explicit FLEET_CLAUDE_CMD override', () => {
    expect(resolveClaudeCmd({ FLEET_CLAUDE_CMD: 'X:/tools/claude.cmd' })).toBe('X:/tools/claude.cmd');
  });
  it('returns an explicit CLAUDE_CLI_PATH override', () => {
    expect(resolveClaudeCmd({ CLAUDE_CLI_PATH: 'Y:/claude.exe' })).toBe('Y:/claude.exe');
  });
  it('falls back to bare "claude" when no override and no resolvable APPDATA path', () => {
    expect(resolveClaudeCmd({})).toBe('claude');
  });
  it('resolves to a claude / claude.cmd token in the current env (shape check across hosts + CI)', () => {
    expect(resolveClaudeCmd()).toMatch(/claude(\.cmd)?$/);
  });
});

describe('FR-2 resolveRepoRoot + invocation cwd — spawned session starts at repo root (hook registration)', () => {
  it('honors a FLEET_REPO_ROOT override', () => {
    expect(resolveRepoRoot({ FLEET_REPO_ROOT: 'D:/repo' })).toBe('D:/repo');
  });
  it('resolves a concrete absolute repo root by default', () => {
    const root = resolveRepoRoot({});
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(0);
  });
  it('bakes -d <startDir> BEFORE the -- separator (applies to the new tab) and returns cwd', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'C', cwd: 'R:/root' });
    const dIdx = inv.args.indexOf('-d');
    expect(dIdx).toBeGreaterThanOrEqual(0);
    expect(inv.args[dIdx + 1]).toBe('R:/root');
    expect(inv.cwd).toBe('R:/root');
    expect(inv.args.indexOf('--')).toBeGreaterThan(dIdx + 1); // -d start dir precedes '--'
  });
});

describe('FR-3 reboot-respawn isolation must NOT silently degrade', () => {
  const logFn = async () => ({ ok: true });

  it('FAILS LOUD (no spawn) when a REQUESTED account_profile cannot be resolved', async () => {
    const spawnFn = vi.fn();
    const res = await runRebootRespawn({
      live: true,
      loadFn: async () => [{ name: 'Canary-1', role: 'worker', account_profile: 'canary' }],
      resolveProfileDirFn: () => { throw new Error('FLEET_ACCOUNT_PROFILES_DIR is not configured'); },
      spawnFn, logFn,
    });
    const r = res.results[0];
    expect(r.isolation_failed).toBe(true);
    expect(r.spawned).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled(); // never spawned unisolated
  });

  it('proceeds normally when NO account_profile is requested (profileDir=null is legitimate)', async () => {
    const spawnFn = vi.fn(() => ({ pid: 1, unref() {} }));
    const res = await runRebootRespawn({
      live: true,
      loadFn: async () => [{ name: 'W', role: 'worker' }],
      spawnFn, logFn,
    });
    const r = res.results[0];
    expect(r.isolation_failed).toBeUndefined();
    expect(r.spawned).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });
});
