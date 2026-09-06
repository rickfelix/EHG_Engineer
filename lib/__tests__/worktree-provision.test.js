// SD-LEO-INFRA-SMART-PER-WORKTREE-001 — smart per-worktree node_modules provisioning.
import { describe, it, expect, vi } from 'vitest';
import {
  decideWorktreeProvisionMode,
  provisionWorktreeNodeModules,
  defaultRunInstall,
  getIsolationMode,
  writeIsolatedFleetLockHashMarkerSync,
} from '../worktree-provision.js';
import { readMarker as readFleetLockHashMarker } from '../fleet-lock-hash.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    writeLockHashMarker: vi.fn(),
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
    // SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-3: the marker now carries the REASON.
    expect(d.writeMarker).toHaveBeenCalledWith('/wt', expect.stringMatching(/^isolated:/));
    // QF-20260903-765: the isolate success path must also write the fleet-lock-hash
    // marker, or sd-start's checker finds no marker and re-installs on a complete tree.
    expect(d.writeLockHashMarker).toHaveBeenCalledWith('/wt', undefined);
  });

  it('JUNCTION and FALLBACK paths do NOT write the fleet-lock-hash marker (no real install ran)', () => {
    const junction = spies();
    junction.decide.mockReturnValue({ strategy: 'junction', reason: 'auto_solo' });
    provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', deps: junction });
    expect(junction.writeLockHashMarker).not.toHaveBeenCalled();

    const fallback = spies();
    fallback.decide.mockReturnValue({ strategy: 'isolate', reason: 'auto_concurrent' });
    fallback.runInstall.mockImplementation(() => { throw new Error('npm boom'); });
    provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', deps: fallback });
    expect(fallback.writeLockHashMarker).not.toHaveBeenCalled();
  });

  it('JUNCTION: symlinks (worktree, repoRoot), writes junction marker, does NOT install', () => {
    const d = spies();
    d.decide.mockReturnValue({ strategy: 'junction', reason: 'auto_solo' });
    const r = provisionWorktreeNodeModules('/wt', { repoRoot: '/repo', activeSessionCount: 1, deps: d });
    expect(r).toEqual({ strategy: 'junction', reason: 'auto_solo' });
    expect(d.symlink).toHaveBeenCalledWith('/wt', '/repo');
    expect(d.runInstall).not.toHaveBeenCalled();
    // FR-3: a DELIBERATE junction records WHY it was chosen.
    expect(d.writeMarker).toHaveBeenCalledWith('/wt', expect.stringMatching(/^junction:/));
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
    // FR-3, THE POINT OF THE CHANGE: this junction is DEGRADED (install failed), and it must be
    // distinguishable from the deliberate one above. Both used to write a bare 'junction', so no
    // teardown or triage tool could tell them apart — and this SD's own LEAD phase was misled by
    // exactly that ambiguity when it cited a marker census as evidence of topology.
    expect(d.writeMarker).toHaveBeenLastCalledWith('/wt', 'junction:isolate_failed_fallback');
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

// QF-20260903-765: end-to-end against a REAL temp directory (real fs, no mocks) — proves the
// isolate success path's marker is genuinely readable by the SAME checker sd-start consults
// (lib/fleet-lock-hash.mjs's own readMarker), not just that some function was called.
describe('QF-20260903-765: isolate success path writes a fleet-lock-hash marker sd-start can read', () => {
  function makeFakeWorktree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-lock-hash-'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'fake', lockfileVersion: 3 }));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    return dir;
  }

  it('writeIsolatedFleetLockHashMarkerSync writes a marker readMarker() accepts', async () => {
    const dir = makeFakeWorktree();
    try {
      const result = writeIsolatedFleetLockHashMarkerSync(dir, 'sess-abc123');
      expect(result.written).toBe(true);
      expect(result.hash).toMatch(/^[0-9a-f]{12}$/);
      const readBack = await readFleetLockHashMarker(dir);
      expect(readBack).toBe(result.hash);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing (no throw, written:false) when node_modules is missing — best-effort, never crashes the install path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-lock-hash-'));
    try {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
      // node_modules deliberately NOT created
      expect(writeIsolatedFleetLockHashMarkerSync(dir, 'sess-x')).toEqual({ written: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('provisionWorktreeNodeModules end-to-end (real install stub, real fs): isolate leaves a marker readMarker() accepts, so a SECOND provision on the same tree would see a hash match', async () => {
    const dir = makeFakeWorktree();
    try {
      const d = {
        decide: () => ({ strategy: 'isolate', reason: 'auto_concurrent' }),
        symlink: vi.fn(),
        // Simulate `npm install` completing (real install is out of scope for a unit test) —
        // node_modules already exists from makeFakeWorktree(), matching a just-finished install.
        runInstall: vi.fn(),
        ensureHuskyHooks: () => ({ ok: true }),
        log: () => {},
      };
      const r = provisionWorktreeNodeModules(dir, { repoRoot: '/repo', activeSessionCount: 2, sessionId: 'sess-e2e', deps: d });
      expect(r.strategy).toBe('isolate');
      const storedHash = await readFleetLockHashMarker(dir);
      expect(storedHash).toMatch(/^[0-9a-f]{12}$/);
      const currentHash = await computeCurrentLockHash(dir);
      expect(storedHash).toBe(currentHash); // the exact equality evaluateInstallDecision needs to skip a redundant install
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

async function computeCurrentLockHash(dir) {
  const { computeLockHash } = await import('../fleet-lock-hash.mjs');
  return computeLockHash(dir);
}
