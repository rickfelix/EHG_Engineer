/**
 * QF-20260511-080 — scoped staging helpers
 *
 * Closes harness 62327062: `complete-quick-fix.js` previously did `git add .`
 * which swept unrelated dirty state (.claude/* session-state files,
 * scripts/one-off/_*.mjs) into the QF commit when run from main repo CWD.
 *
 * These tests pin the contract for the two pure helpers that scope staging
 * to QF-touched files only.
 */

import { describe, it, expect } from 'vitest';
import {
  parseGitStatusFiles,
  partitionDirtyByScope,
} from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('parseGitStatusFiles', () => {
  it('parses modified, staged, and untracked entries', () => {
    const out = [
      ' M src/a.js',
      'M  src/b.js',
      '?? src/c.js',
      'AM src/d.js',
    ].join('\n');
    expect(parseGitStatusFiles(out)).toEqual([
      'src/a.js', 'src/b.js', 'src/c.js', 'src/d.js',
    ]);
  });

  it('extracts the new path on rename entries (R  old -> new)', () => {
    const out = 'R  old/path.js -> new/path.js';
    expect(parseGitStatusFiles(out)).toEqual(['new/path.js']);
  });

  it('handles multiple lines with mixed status codes including rename', () => {
    const out = [
      ' M src/a.js',
      'R  old.js -> new.js',
      '?? new-untracked.js',
    ].join('\n');
    expect(parseGitStatusFiles(out)).toEqual([
      'src/a.js', 'new.js', 'new-untracked.js',
    ]);
  });

  it('returns empty array for empty/null/undefined input', () => {
    expect(parseGitStatusFiles('')).toEqual([]);
    expect(parseGitStatusFiles(null)).toEqual([]);
    expect(parseGitStatusFiles(undefined)).toEqual([]);
  });

  it('strips git quoting on paths with spaces', () => {
    const out = ' M "path with spaces.js"';
    expect(parseGitStatusFiles(out)).toEqual(['path with spaces.js']);
  });

  it('deduplicates duplicate paths (same path on multiple lines)', () => {
    const out = ' M a.js\n M a.js\nMM a.js';
    expect(parseGitStatusFiles(out)).toEqual(['a.js']);
  });

  it('skips lines too short to contain a path', () => {
    const out = '\n M\n??\n M actual.js';
    expect(parseGitStatusFiles(out)).toEqual(['actual.js']);
  });
});

describe('partitionDirtyByScope', () => {
  it('separates scoped from unrelated by intersection', () => {
    const result = partitionDirtyByScope(
      ['src/a.js', 'src/b.js', 'src/c.js'],
      ['src/a.js', 'src/c.js'],
    );
    expect(result).toEqual({
      scopedDirty: ['src/a.js', 'src/c.js'],
      unrelatedDirty: ['src/b.js'],
    });
  });

  it('returns all-unrelated when scope is empty array (bug repro path)', () => {
    expect(partitionDirtyByScope(
      ['.claude/state.json', 'scripts/one-off/_x.mjs'],
      [],
    )).toEqual({
      scopedDirty: [],
      unrelatedDirty: ['.claude/state.json', 'scripts/one-off/_x.mjs'],
    });
  });

  it('returns all-scoped when dirty is a subset of scope', () => {
    expect(partitionDirtyByScope(
      ['src/a.js'],
      ['src/a.js', 'src/b.js', 'src/c.js'],
    )).toEqual({
      scopedDirty: ['src/a.js'],
      unrelatedDirty: [],
    });
  });

  it('handles null/undefined scopedFiles as empty (defensive)', () => {
    expect(partitionDirtyByScope(['a.js'], null)).toEqual({
      scopedDirty: [],
      unrelatedDirty: ['a.js'],
    });
    expect(partitionDirtyByScope(['a.js'], undefined)).toEqual({
      scopedDirty: [],
      unrelatedDirty: ['a.js'],
    });
  });

  it('handles null/undefined dirtyFiles as empty (defensive)', () => {
    expect(partitionDirtyByScope(null, ['a.js'])).toEqual({
      scopedDirty: [],
      unrelatedDirty: [],
    });
    expect(partitionDirtyByScope(undefined, ['a.js'])).toEqual({
      scopedDirty: [],
      unrelatedDirty: [],
    });
  });

  it('preserves dirty-file order in each partition', () => {
    const result = partitionDirtyByScope(
      ['z.js', 'a.js', 'm.js', 'b.js'],
      ['a.js', 'b.js'],
    );
    expect(result.scopedDirty).toEqual(['a.js', 'b.js']);
    expect(result.unrelatedDirty).toEqual(['z.js', 'm.js']);
  });
});

describe('parse + partition integration (regression for harness 62327062)', () => {
  it('classic bug repro: dirty session-state + zero scope → all unrelated', () => {
    const gitStatus = [
      ' M .claude/.protocol-sync',
      ' M .claude/fleet-dashboard-state.json',
      '?? .claude/tmp/friction-counters-abc.json',
      '?? scripts/one-off/_test.mjs',
    ].join('\n');
    const dirtyFiles = parseGitStatusFiles(gitStatus);
    const { scopedDirty, unrelatedDirty } = partitionDirtyByScope(dirtyFiles, []);
    expect(scopedDirty).toEqual([]);
    expect(unrelatedDirty).toHaveLength(4);
    expect(unrelatedDirty).toContain('.claude/.protocol-sync');
    expect(unrelatedDirty).toContain('scripts/one-off/_test.mjs');
  });

  it('mixed case: 1 scoped + 3 unrelated → only scoped staged', () => {
    const gitStatus = [
      ' M scripts/modules/complete-quick-fix/git-operations.js',
      ' M .claude/.protocol-sync',
      '?? .claude/tmp/friction-counters-xyz.json',
      '?? scripts/one-off/_debug.mjs',
    ].join('\n');
    const filesChanged = ['scripts/modules/complete-quick-fix/git-operations.js'];
    const dirtyFiles = parseGitStatusFiles(gitStatus);
    const { scopedDirty, unrelatedDirty } = partitionDirtyByScope(dirtyFiles, filesChanged);
    expect(scopedDirty).toEqual(['scripts/modules/complete-quick-fix/git-operations.js']);
    expect(unrelatedDirty).toHaveLength(3);
  });
});
