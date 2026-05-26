/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-3 — venture-worktree hardening (E2E-surfaced gaps).
 *
 * G-A: a venture worktree (inside a venture clone) legitimately lacks EHG_Engineer's
 *      scripts/lib/node_modules/.env. validateWorktreeSubstrate must accept a venture substrate
 *      set (.git + package.json) so the post-creation gate stops rejecting venture worktrees.
 * G-B: stripWorktreeSuffix yields the canonical main root from a `.worktrees/<sd>` path, so
 *      venture sibling-clone derivation is correct whether run from main or a worktree.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SUBSTRATE_ITEMS, VENTURE_SUBSTRATE_ITEMS, validateWorktreeSubstrate } from '../../lib/worktree-manager.js';
import { stripWorktreeSuffix } from '../../lib/repo-paths.js';

describe('G-A: venture-aware worktree substrate', () => {
  it('VENTURE_SUBSTRATE_ITEMS is the minimal venture checkout (.git + package.json) — no EHG_Engineer tooling', () => {
    expect(VENTURE_SUBSTRATE_ITEMS).toEqual(['.git', 'package.json']);
    for (const ehgItem of ['scripts', 'lib', 'node_modules', '.env']) {
      expect(VENTURE_SUBSTRATE_ITEMS).not.toContain(ehgItem);
    }
  });

  it('a venture worktree (only .git + package.json) PASSES the venture set but FAILS the EHG_Engineer set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'venture-wt-'));
    try {
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, 'package.json'), '{"name":"crongenius"}');
      // Venture substrate: satisfied.
      expect(validateWorktreeSubstrate(dir, VENTURE_SUBSTRATE_ITEMS)).toEqual({ ok: true, missing: [] });
      // EHG_Engineer substrate: still requires scripts/lib/node_modules/.env (proves the default is unchanged
      // and that a venture worktree would have been wrongly rejected without the venture set).
      const platform = validateWorktreeSubstrate(dir, SUBSTRATE_ITEMS);
      expect(platform.ok).toBe(false);
      expect(platform.missing).toEqual(['scripts', 'lib', 'node_modules', '.env']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('default items is still SUBSTRATE_ITEMS (parity preserved for platform worktrees)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'platform-wt-'));
    try {
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, 'package.json'), '{}');
      // No items arg → defaults to SUBSTRATE_ITEMS → still misses the EHG_Engineer items.
      expect(validateWorktreeSubstrate(dir).missing).toEqual(['scripts', 'lib', 'node_modules', '.env']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('venture set still catches a broken/empty worktree (missing .git)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'broken-wt-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{}'); // no .git
      expect(validateWorktreeSubstrate(dir, VENTURE_SUBSTRATE_ITEMS)).toEqual({ ok: false, missing: ['.git'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('G-B: stripWorktreeSuffix canonical main root', () => {
  it('no-op when not inside a .worktrees subtree', () => {
    expect(stripWorktreeSuffix('C:/Users/x/_EHG/EHG_Engineer')).toBe('C:/Users/x/_EHG/EHG_Engineer');
    expect(stripWorktreeSuffix('/home/x/_EHG/EHG_Engineer')).toBe('/home/x/_EHG/EHG_Engineer');
  });

  it('strips a trailing /.worktrees/<sd> to the canonical main root', () => {
    const main = path.resolve('C:/Users/x/_EHG/EHG_Engineer');
    expect(stripWorktreeSuffix('C:/Users/x/_EHG/EHG_Engineer/.worktrees/SD-FOO-001')).toBe(main);
  });

  it('handles Windows backslash paths', () => {
    const out = stripWorktreeSuffix('C:\\Users\\x\\_EHG\\EHG_Engineer\\.worktrees\\SD-FOO-001');
    expect(out.replace(/\\/g, '/')).toBe(path.resolve('C:/Users/x/_EHG/EHG_Engineer').replace(/\\/g, '/'));
    expect(out).not.toMatch(/\.worktrees/);
  });
});
