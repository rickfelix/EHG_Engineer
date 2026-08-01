/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-6 — the kill switch is a fourth
 * fail-open, and an acceptance run must assert its own state.
 *
 * WORKTREE_RESIDENCY_GUARD=off makes the residency guards return blocked:false outright.
 * A green acceptance result with the switch off proves nothing — it may only mean the
 * guard was disabled. This child originally listed three fail-opens and did not include
 * this one, and no smoke step asserted the switch state.
 *
 * It gates THREE call sites, not the one the plan named: cwdResidencyBlocks (the SYNC
 * chokepoint on every delete path), heartbeatResidencyBlocksRemoval, and the new
 * treeResidencyBlocksRemoval. All three are asserted here.
 */
import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cwdResidencyBlocks,
  treeResidencyBlocksRemoval,
  REAP_BLOCKED_RESIDENT,
  REAP_BLOCKED_TREE_RESIDENT,
} from '../../../lib/worktree-reaper/residency-guard.js';

const quiet = () => {};
const original = process.env.WORKTREE_RESIDENCY_GUARD;
afterEach(() => {
  if (original === undefined) delete process.env.WORKTREE_RESIDENCY_GUARD;
  else process.env.WORKTREE_RESIDENCY_GUARD = original;
});

describe('FR-6 — the acceptance run asserts its own guard state', () => {
  test('WORKTREE_RESIDENCY_GUARD is NOT disabled while this suite runs', () => {
    // If this fails, every other residency assertion in this SD is meaningless.
    const v = String(process.env.WORKTREE_RESIDENCY_GUARD || '').toLowerCase();
    expect(['off', '0', 'false']).not.toContain(v);
  });
});

describe('FR-6 — the switch really does disable all three guards', () => {
  // Asserted rather than assumed: this is what makes the check above load-bearing.
  test('cwdResidencyBlocks bypasses when off (the SYNC chokepoint on every delete path)', () => {
    const dir = process.cwd();
    process.env.WORKTREE_RESIDENCY_GUARD = 'off';
    const off = cwdResidencyBlocks(dir, { cwd: dir, logger: quiet });
    expect(off.blocked).toBe(false);
    expect(off.bypassed).toBe(true);

    delete process.env.WORKTREE_RESIDENCY_GUARD;
    const on = cwdResidencyBlocks(dir, { cwd: dir, logger: quiet });
    expect(on.blocked).toBe(true);
    expect(on.reason).toBe(REAP_BLOCKED_RESIDENT);
  });

  test('treeResidencyBlocksRemoval bypasses when off', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr6-'));
    try {
      const now = Date.now();
      const opts = { nowMs: now, statFn: () => ({ mtimeMs: now - 1000 }), gitRunner: () => ({ code: 128, stdout: '' }), logger: quiet };

      delete process.env.WORKTREE_RESIDENCY_GUARD;
      const on = treeResidencyBlocksRemoval(dir, opts);
      expect(on.blocked).toBe(true);
      expect(on.reason).toBe(REAP_BLOCKED_TREE_RESIDENT);

      process.env.WORKTREE_RESIDENCY_GUARD = 'off';
      const off = treeResidencyBlocksRemoval(dir, opts);
      expect(off.blocked).toBe(false);
      expect(off.bypassed).toBe(true);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  test.each(['off', '0', 'false'])('the disabling spellings are all honoured: %s', (val) => {
    const dir = process.cwd();
    process.env.WORKTREE_RESIDENCY_GUARD = val;
    expect(cwdResidencyBlocks(dir, { cwd: dir, logger: quiet }).bypassed).toBe(true);
  });

  test('an unrelated value does NOT disable the guard', () => {
    // A typo'd value must fail SAFE — otherwise the switch is easier to trip than to set.
    process.env.WORKTREE_RESIDENCY_GUARD = 'on';
    const dir = process.cwd();
    expect(cwdResidencyBlocks(dir, { cwd: dir, logger: quiet }).blocked).toBe(true);
  });
});
