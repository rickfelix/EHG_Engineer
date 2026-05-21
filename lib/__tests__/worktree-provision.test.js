// SD-LEO-INFRA-SMART-PER-WORKTREE-001 — smart per-worktree node_modules provisioning.
import { describe, it, expect, vi } from 'vitest';
import {
  decideWorktreeProvisionMode,
  provisionWorktreeNodeModules,
  defaultRunInstall,
  getIsolationMode,
} from '../worktree-provision.js';

const GB = 1024 * 1024 * 1024;

describe('decideWorktreeProvisionMode (pure decision)', () => {
  it('auto + solo (1) -> junction', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 1 })).toEqual({ strategy: 'junction', reason: 'auto_solo' });
  });
  it('auto + zero (0) -> junction', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 0 })).toEqual({ strategy: 'junction', reason: 'auto_solo' });
  });
  it('auto + concurrent (2) -> isolate', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 2 })).toEqual({ strategy: 'isolate', reason: 'auto_concurrent' });
  });
  it('auto + many (3) -> isolate', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 3 }).strategy).toBe('isolate');
  });
  it('exactly-1 boundary -> junction (pins the >=2 threshold)', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 1 }).strategy).toBe('junction');
  });
  it('always + solo -> isolate', () => {
    expect(decideWorktreeProvisionMode({ mode: 'always', activeSessionCount: 1 })).toEqual({ strategy: 'isolate', reason: 'mode_always' });
  });
  it('never + concurrent -> junction', () => {
    expect(decideWorktreeProvisionMode({ mode: 'never', activeSessionCount: 5 })).toEqual({ strategy: 'junction', reason: 'mode_never' });
  });
  it('auto + uncertain count (null) -> isolate (conservative)', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: null })).toEqual({ strategy: 'isolate', reason: 'auto_uncertain_count' });
  });
  it('unknown mode -> isolate (fail-safe)', () => {
    expect(decideWorktreeProvisionMode({ mode: 'garbage', activeSessionCount: 1 })).toEqual({ strategy: 'isolate', reason: 'mode_unknown_failsafe' });
  });
  it('disk floor forces junction even under always/concurrent', () => {
    expect(decideWorktreeProvisionMode({ mode: 'always', activeSessionCount: 5, freeDiskBytes: 2 * GB })).toEqual({ strategy: 'junction', reason: 'disk_floor' });
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 5, freeDiskBytes: 2 * GB }).reason).toBe('disk_floor');
  });
  it('sufficient disk does not trigger the floor', () => {
    expect(decideWorktreeProvisionMode({ mode: 'auto', activeSessionCount: 2, freeDiskBytes: 50 * GB }).strategy).toBe('isolate');
  });
});

describe('getIsolationMode', () => {
  it('defaults to auto and normalizes unknown to auto', () => {
    expect(getIsolationMode({})).toBe('auto');
    expect(getIsolationMode({ WORKTREE_ISOLATION_MODE: 'ALWAYS' })).toBe('always');
    expect(getIsolationMode({ WORKTREE_ISOLATION_MODE: 'bogus' })).toBe('auto');
  });
});

function spies() {
  return {
    decide: vi.fn(),
    symlink: vi.fn(),
    runInstall: vi.fn(),
    writeMarker: vi.fn(),
    rm: vi.fn(),
    log: vi.fn(),
  };
}

describe('provisionWorktreeNodeModules (execution)', () => {
  it('ISOLATE: runs install, writes isolated marker, does NOT junction', () => {
    const d = spies();
    d.decide.mockReturnValue({ strategy: 'isolate', reason: 'auto_concurrent' });
    const r = provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', activeSessionCount: 2, deps: d });
    expect(r).toEqual({ strategy: 'isolate', reason: 'auto_concurrent' });
    expect(d.runInstall).toHaveBeenCalledWith('/wt');
    expect(d.symlink).not.toHaveBeenCalled();
    expect(d.writeMarker).toHaveBeenCalledWith('/wt', 'isolated');
  });

  it('JUNCTION: symlinks (worktree, repoRoot), writes junction marker, does NOT install', () => {
    const d = spies();
    d.decide.mockReturnValue({ strategy: 'junction', reason: 'auto_solo' });
    const r = provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', activeSessionCount: 1, deps: d });
    expect(r).toEqual({ strategy: 'junction', reason: 'auto_solo' });
    expect(d.symlink).toHaveBeenCalledWith('/wt', '/repo');
    expect(d.runInstall).not.toHaveBeenCalled();
    expect(d.writeMarker).toHaveBeenCalledWith('/wt', 'junction');
  });

  it('FALLBACK: isolate install failure -> clean partial -> junction (worktree always usable)', () => {
    const d = spies();
    d.decide.mockReturnValue({ strategy: 'isolate', reason: 'auto_concurrent' });
    d.runInstall.mockImplementation(() => { throw new Error('npm boom'); });
    const r = provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', deps: d });
    expect(r.strategy).toBe('junction');
    expect(r.reason).toBe('isolate_failed_fallback');
    expect(r.fallbackReason).toMatch(/npm boom/);
    expect(d.symlink).toHaveBeenCalledWith('/wt', '/repo'); // fell back to junction
    expect(d.writeMarker).toHaveBeenLastCalledWith('/wt', 'junction');
  });
});

describe('defaultRunInstall (command + cwd contract)', () => {
  it('runs additive `npm install --ignore-scripts` with cwd === worktreePath (never repoRoot)', () => {
    const exec = vi.fn();
    defaultRunInstall('/wt', { execSyncImpl: exec });
    expect(exec).toHaveBeenCalledTimes(1);
    const [cmd, opts] = exec.mock.calls[0];
    expect(cmd).toMatch(/^npm install\b/);
    expect(cmd).toMatch(/--ignore-scripts/);
    expect(cmd).not.toMatch(/\bnpm ci\b/); // never the destructive command
    expect(opts.cwd).toBe('/wt');
  });
});
