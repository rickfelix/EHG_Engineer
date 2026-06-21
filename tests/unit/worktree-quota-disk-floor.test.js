/**
 * SD-FDBK-INFRA-DISK-FULL-RECURS-001 — worktree creation must be blocked when the .worktrees volume is
 * below a free-space FLOOR (the recurring fleet-wide disk-full), not only when the COUNT quota is hit.
 * The guard is FAIL-OPEN: an unreadable free-space read never blocks. Tests the pure helpers and the
 * enforceWorktreeQuota integration via the injectable getFreeDisk seam (no real disk needed).
 */
import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import {
  checkDiskFloor, createDiskPressureError, enforceWorktreeQuota, WORKTREE_DISK_FLOOR_BYTES,
} from '../../lib/worktree-quota.js';
import { getFreeDiskBytes } from '../../lib/worktree-provision.js';

const GB = 1024 * 1024 * 1024;

describe('getFreeDiskBytes — real statfs smoke (the fail-open-no-op risk)', () => {
  // The guard fails OPEN when free space is unreadable. If fs.statfsSync silently stopped working on
  // this platform/Node version, the guard would become a permanent no-op with no other signal. This
  // smoke test asserts the real reader returns a finite positive number on a known dir, so a Node
  // downgrade/regression that breaks statfs is caught here rather than silently disabling the guard.
  it('returns a finite positive byte count for os.tmpdir()', () => {
    const free = getFreeDiskBytes(os.tmpdir());
    expect(typeof free).toBe('number');
    expect(Number.isFinite(free)).toBe(true);
    expect(free).toBeGreaterThan(0);
  });
});

describe('checkDiskFloor (pure, fail-open)', () => {
  it('ok when free >= floor', () => {
    expect(checkDiskFloor(10 * GB, 5 * GB)).toMatchObject({ ok: true, reason: 'sufficient' });
  });
  it('blocks when free strictly below floor', () => {
    expect(checkDiskFloor(2 * GB, 5 * GB)).toMatchObject({ ok: false, reason: 'below_floor' });
  });
  it('boundary: free exactly at floor is ok', () => {
    expect(checkDiskFloor(5 * GB, 5 * GB).ok).toBe(true);
  });
  it('FAIL-OPEN on unreadable free space (undefined/null/NaN)', () => {
    for (const v of [undefined, null, NaN]) {
      expect(checkDiskFloor(v, 5 * GB)).toMatchObject({ ok: true, reason: 'unreadable' });
    }
  });
  it('default floor is the exported WORKTREE_DISK_FLOOR_BYTES', () => {
    // with the module default floor, 0 bytes free must block (unless the env opted out to 0)
    if (WORKTREE_DISK_FLOOR_BYTES > 0) expect(checkDiskFloor(0).ok).toBe(false);
    else expect(checkDiskFloor(0).ok).toBe(true);
  });
});

describe('createDiskPressureError', () => {
  it('carries errorCode WORKTREE_DISK_PRESSURE + reaper remediation', () => {
    const e = createDiskPressureError(2 * GB, 5 * GB);
    expect(e.errorCode).toBe('WORKTREE_DISK_PRESSURE');
    expect(e.message).toMatch(/worktree-reaper\.mjs/);
    expect(e.message).toMatch(/2\.00GB free/);
    expect(e.message).toMatch(/floor 5\.0GB/);
  });
});

describe('enforceWorktreeQuota — disk-floor integration (injected getFreeDisk)', () => {
  // A gitRunner that reports an empty worktree list keeps the COUNT check passing so we isolate the disk path.
  const emptyGit = () => 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n';
  const base = { max: 20, logger: () => {}, gitRunner: emptyGit, diskFloorBytes: 5 * GB };

  it('throws WORKTREE_DISK_PRESSURE when free disk is below the floor', () => {
    expect(() => enforceWorktreeQuota('/repo', '/repo/.worktrees', { ...base, getFreeDisk: () => 1 * GB }))
      .toThrow(/disk pressure/i);
  });
  it('does NOT throw when free disk is above the floor', () => {
    expect(() => enforceWorktreeQuota('/repo', '/repo/.worktrees', { ...base, getFreeDisk: () => 50 * GB }))
      .not.toThrow();
  });
  it('FAIL-OPEN: does NOT throw when free disk is unreadable (undefined)', () => {
    expect(() => enforceWorktreeQuota('/repo', '/repo/.worktrees', { ...base, getFreeDisk: () => undefined }))
      .not.toThrow();
  });
  it('opt-out: diskFloorBytes=0 skips the disk check entirely', () => {
    const spy = vi.fn(() => 0);
    expect(() => enforceWorktreeQuota('/repo', '/repo/.worktrees', { ...base, diskFloorBytes: 0, getFreeDisk: spy }))
      .not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
