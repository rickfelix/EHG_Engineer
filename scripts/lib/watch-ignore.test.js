/**
 * Unit tests — SD-FDBK-FIX-STAGE-WORKER-SUPERVISOR-001
 * isDotfileBasename ignores dotfiles by BASENAME only, so a '.worktrees' (or any dotted)
 * ANCESTOR no longer excludes the whole stage-worker watch tree.
 */
import { describe, it, expect } from 'vitest';
import { isDotfileBasename } from './watch-ignore.mjs';

const OLD_REGEX = /(^|[/\\])\../; // the buggy path-wide matcher we replaced

describe('isDotfileBasename', () => {
  it('ignores real dotfiles by basename', () => {
    expect(isDotfileBasename('/repo/.git')).toBe(true);
    expect(isDotfileBasename('/repo/lib/eva/.env')).toBe(true);
    expect(isDotfileBasename('/repo/.cache/x')).toBe(false); // .cache is an ancestor here; leaf is 'x'
    expect(isDotfileBasename('/repo/lib/eva/.cache')).toBe(true); // .cache is the leaf
  });

  it('does NOT ignore a tree that merely lives under a dotted ancestor (the fix)', () => {
    const underWorktree = 'C:/repo/.worktrees/SD-X/lib/eva/foo.js';
    expect(isDotfileBasename(underWorktree)).toBe(false);
    expect(isDotfileBasename('C:/repo/.worktrees/SD-X/lib/eva')).toBe(false);
    // Regression control: the OLD regex WOULD have excluded the whole tree.
    expect(OLD_REGEX.test(underWorktree)).toBe(true);
    expect(isDotfileBasename(underWorktree)).not.toBe(OLD_REGEX.test(underWorktree));
  });

  it('still ignores a real dotfile leaf even under a dotted ancestor', () => {
    expect(isDotfileBasename('C:/repo/.worktrees/SD-X/.git')).toBe(true);
  });

  it('handles non-string / empty input without throwing', () => {
    expect(isDotfileBasename('')).toBe(false);
    expect(isDotfileBasename(undefined)).toBe(false); // String(undefined)='undefined' -> basename 'undefined'
  });
});
