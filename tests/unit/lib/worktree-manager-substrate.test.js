/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-001 + FR-002)
 *
 * Verifies SUBSTRATE_ITEMS frozen const + validateWorktreeSubstrate behavior.
 * Covers test scenarios TS-001 through TS-004 from the PRD.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SUBSTRATE_ITEMS, validateWorktreeSubstrate } from '../../../lib/worktree-manager.js';

/** Build a fake worktree directory containing every SUBSTRATE_ITEMS entry. */
function buildHealthyWorktree(root) {
  fs.mkdirSync(root, { recursive: true });
  // .git and .env are FILES; the rest are directories
  for (const item of SUBSTRATE_ITEMS) {
    const full = path.join(root, item);
    if (item === '.git' || item === '.env') {
      fs.writeFileSync(full, '');
    } else {
      fs.mkdirSync(full, { recursive: true });
    }
  }
}

describe('SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 — SUBSTRATE_ITEMS const', () => {
  it('exports a frozen array of strings', () => {
    expect(Array.isArray(SUBSTRATE_ITEMS)).toBe(true);
    expect(Object.isFrozen(SUBSTRATE_ITEMS)).toBe(true);
    for (const item of SUBSTRATE_ITEMS) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(0);
    }
  });

  it('contains the 6 substrate items required for a healthy worktree', () => {
    // Stable contract — adding/removing requires a coordinated PRD amendment.
    expect(SUBSTRATE_ITEMS).toContain('.git');
    expect(SUBSTRATE_ITEMS).toContain('package.json');
    expect(SUBSTRATE_ITEMS).toContain('scripts');
    expect(SUBSTRATE_ITEMS).toContain('lib');
    expect(SUBSTRATE_ITEMS).toContain('node_modules');
    expect(SUBSTRATE_ITEMS).toContain('.env');
    expect(SUBSTRATE_ITEMS.length).toBe(6);
  });
});

describe('SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 — validateWorktreeSubstrate', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // TS-001
  it('returns { ok: true, missing: [] } on a healthy worktree', () => {
    buildHealthyWorktree(tmpRoot);
    const result = validateWorktreeSubstrate(tmpRoot);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // TS-002 — six individual-missing cases generated from SUBSTRATE_ITEMS
  describe.each(SUBSTRATE_ITEMS)('with %s missing', (missingItem) => {
    it(`returns ok:false with missing=[${missingItem}]`, () => {
      buildHealthyWorktree(tmpRoot);
      fs.rmSync(path.join(tmpRoot, missingItem), { recursive: true, force: true });
      const result = validateWorktreeSubstrate(tmpRoot);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([missingItem]);
    });
  });

  // TS-003
  it('returns multiple missing items in SUBSTRATE_ITEMS order', () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    fs.mkdirSync(path.join(tmpRoot, 'scripts'));
    // Missing: package.json, lib, node_modules, .env (in that order per SUBSTRATE_ITEMS)
    const result = validateWorktreeSubstrate(tmpRoot);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['package.json', 'lib', 'node_modules', '.env']);
  });

  // TS-004
  describe('invalid input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['number', 0],
      ['object', {}]
    ])('throws TypeError on %s', (_label, badInput) => {
      expect(() => validateWorktreeSubstrate(badInput)).toThrow(TypeError);
    });
  });

  // Performance budget — non-fatal but tracked. Hard cap at 200ms per PRD risk #3.
  it('completes in well under 200ms on a healthy worktree', () => {
    buildHealthyWorktree(tmpRoot);
    const start = process.hrtime.bigint();
    validateWorktreeSubstrate(tmpRoot);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    expect(elapsedMs).toBeLessThan(200);
  });

  // Symlink awareness — node_modules is typically a symlink/junction in worktrees
  it('treats symlinked node_modules as present', () => {
    buildHealthyWorktree(tmpRoot);
    // Replace the directory with a symlink to a real dir
    const realModules = fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-modules-'));
    fs.rmSync(path.join(tmpRoot, 'node_modules'), { recursive: true, force: true });
    try {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(realModules, path.join(tmpRoot, 'node_modules'), linkType);
      const result = validateWorktreeSubstrate(tmpRoot);
      expect(result.ok).toBe(true);
    } catch (err) {
      // Windows non-admin sessions can't always create symlinks — skip rather than fail
      if (err.code === 'EPERM' || err.code === 'EACCES') return;
      throw err;
    } finally {
      try { fs.rmSync(realModules, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  // Adversarial review of PR #3488 (finding 1): the prior fs.existsSync
  // call followed symlinks and falsely reported a broken-target junction
  // as missing. lstatSync sees the link itself, so a transient broken
  // target (sibling npm install mid-swap) still reports the substrate
  // item as present.
  it('treats broken-target node_modules junction as present (lstat semantics)', () => {
    buildHealthyWorktree(tmpRoot);
    const targetThatWillBeDeleted = fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-vanish-'));
    fs.rmSync(path.join(tmpRoot, 'node_modules'), { recursive: true, force: true });
    try {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(targetThatWillBeDeleted, path.join(tmpRoot, 'node_modules'), linkType);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') return;
      throw err;
    }
    // Break the link by removing the target — fs.existsSync would now lie
    fs.rmSync(targetThatWillBeDeleted, { recursive: true, force: true });
    const result = validateWorktreeSubstrate(tmpRoot);
    expect(result.missing).not.toContain('node_modules');
    expect(result.ok).toBe(true);
  });
});
