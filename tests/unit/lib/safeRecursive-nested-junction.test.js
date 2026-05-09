import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { safeRecursiveRm, safeRecursiveCp } from '../../../lib/worktree-manager.js';

/**
 * QF-20260509-NESTED-JUNCTION — runtime regression pin
 *
 * Witness 2026-05-09T23:27Z: scripts/worktree-reaper.mjs called safeRecursiveRm
 * on .worktrees/SD-LEO-INFRA-MAKE-SESSIONSTART-WORKTREE-001 which contained a
 * NESTED junction (one level deep below the top-level worktree path). The
 * pre-fix safeRecursiveRm only unlinked top-level junctions; the nested
 * junction was followed by the final fs.rmSync({recursive:true}), wiping
 * repo-root node_modules and bricking 5 parallel Claude Code sessions.
 *
 * This test pins the recursive-walk fix: a junction at depth >= 2 must be
 * unlinked (NOT followed) so the final rmSync cannot delete the link target.
 *
 * Cross-platform: junction is a Windows reparse-point construct
 * (fs.symlinkSync(target, link, 'junction')). On non-Windows we use a regular
 * directory symlink which Node's recursive rm already handles safely; the
 * test still asserts the recursive-walk shape on non-Windows too.
 */

const isWindows = process.platform === 'win32';

describe('safeRecursiveRm — nested junction regression pin (QF-20260509-NESTED-JUNCTION)', () => {
  let tmpRoot;
  let externalTarget;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-nested-junction-rm-'));
    externalTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-junction-target-'));
    fs.writeFileSync(path.join(externalTarget, 'sentinel.txt'), 'preserve-me');
  });

  afterEach(() => {
    // best-effort cleanup; we use the helper-under-test for tmpRoot to avoid
    // re-introducing the bug from the cleanup path itself.
    try { safeRecursiveRm(tmpRoot); } catch {}
    try { safeRecursiveRm(externalTarget); } catch {}
  });

  it('NESTED junction at depth=2 does not cause target wipe', () => {
    const wt = path.join(tmpRoot, 'wt');
    const sub = path.join(wt, 'sub');
    fs.mkdirSync(sub, { recursive: true });

    const linkPath = path.join(sub, 'node_modules');
    if (isWindows) {
      fs.symlinkSync(externalTarget, linkPath, 'junction');
    } else {
      fs.symlinkSync(externalTarget, linkPath, 'dir');
    }

    safeRecursiveRm(wt);

    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(externalTarget)).toBe(true);
    expect(fs.existsSync(path.join(externalTarget, 'sentinel.txt'))).toBe(true);
  });

  it('NESTED junction at depth=3 also survives', () => {
    const wt = path.join(tmpRoot, 'wt');
    const deep = path.join(wt, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });

    const linkPath = path.join(deep, 'linked');
    if (isWindows) {
      fs.symlinkSync(externalTarget, linkPath, 'junction');
    } else {
      fs.symlinkSync(externalTarget, linkPath, 'dir');
    }

    safeRecursiveRm(wt);

    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(path.join(externalTarget, 'sentinel.txt'))).toBe(true);
  });

  it('TOP-LEVEL junction (the original case) still survives', () => {
    const wt = path.join(tmpRoot, 'wt');
    fs.mkdirSync(wt, { recursive: true });

    const linkPath = path.join(wt, 'node_modules');
    if (isWindows) {
      fs.symlinkSync(externalTarget, linkPath, 'junction');
    } else {
      fs.symlinkSync(externalTarget, linkPath, 'dir');
    }

    safeRecursiveRm(wt);

    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(path.join(externalTarget, 'sentinel.txt'))).toBe(true);
  });
});

describe('safeRecursiveCp — nested junction regression pin (QF-20260509-NESTED-JUNCTION)', () => {
  let tmpRoot;
  let externalTarget;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-nested-junction-cp-'));
    externalTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-cp-target-'));
    fs.writeFileSync(path.join(externalTarget, 'big-content.txt'), 'a'.repeat(1024));
  });

  afterEach(() => {
    try { safeRecursiveRm(tmpRoot); } catch {}
    try { safeRecursiveRm(externalTarget); } catch {}
  });

  it('NESTED junction is recreated as link, not copied', () => {
    const src = path.join(tmpRoot, 'src');
    const sub = path.join(src, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(src, 'real-file.txt'), 'real');

    const linkPath = path.join(sub, 'linked');
    if (isWindows) {
      fs.symlinkSync(externalTarget, linkPath, 'junction');
    } else {
      fs.symlinkSync(externalTarget, linkPath, 'dir');
    }

    const dest = path.join(tmpRoot, 'dest');
    safeRecursiveCp(src, dest);

    expect(fs.existsSync(path.join(dest, 'real-file.txt'))).toBe(true);
    const destLinkPath = path.join(dest, 'sub', 'linked');
    expect(fs.existsSync(destLinkPath)).toBe(true);
    const destLinkStat = fs.lstatSync(destLinkPath);
    expect(destLinkStat.isSymbolicLink()).toBe(true);
    // Junction target's contents must NOT be duplicated under dest/sub/linked
    // (i.e. lstat reports a symlink, the helper preserved the link).
  });
});
