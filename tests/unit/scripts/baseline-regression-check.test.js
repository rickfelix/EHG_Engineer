import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

import { execSync } from 'node:child_process';
import {
  DIMENSION,
  TARGET_APP,
  TABLE,
  testId,
  extractFailingIds,
  getChangedFiles,
  fetchBaselineSnapshot,
  classifyRegressions,
} from '../../../scripts/lib/baseline-regression-check.mjs';

describe('testId', () => {
  it('joins file and test with the ::  delimiter', () => {
    expect(testId({ file: 'tests/a.test.js', test: 'foo > bar' })).toBe('tests/a.test.js::foo > bar');
  });
});

describe('extractFailingIds', () => {
  it('builds identities from vitest 1.x shape', () => {
    const json = {
      testResults: [
        {
          name: 'tests/a.test.js',
          assertionResults: [
            { status: 'failed', fullName: 'a > fails' },
            { status: 'passed', fullName: 'a > passes' },
          ],
        },
      ],
    };
    expect(extractFailingIds(json)).toEqual(['tests/a.test.js::a > fails']);
  });

  it('builds identities from vitest 3.x+ shape', () => {
    const json = {
      files: [
        {
          filepath: 'tests/b.test.js',
          tasks: [{ type: 'test', name: 'b fails', result: { state: 'fail', errors: [] } }],
        },
      ],
    };
    expect(extractFailingIds(json)).toEqual(['tests/b.test.js::b fails']);
  });
});

describe('classifyRegressions', () => {
  it('falls back to count comparison when baselineIds is null (legacy snapshot)', () => {
    const result = classifyRegressions({
      currentFailed: 5,
      currentIds: ['x::1', 'x::2', 'x::3', 'x::4', 'x::5'],
      baselineFailedCount: 3,
      baselineIds: null,
      changedFiles: ['x'],
    });
    expect(result.usedFallback).toBe(true);
    expect(result.isRegression).toBe(true);
    expect(result.newFailureCount).toBe(2);
    expect(result.newRegressions).toEqual([]);
  });

  it('does not flag a pre-existing failure (in baseline) even if its file changed', () => {
    const result = classifyRegressions({
      currentFailed: 1,
      currentIds: ['src/a.js::still broken'],
      baselineFailedCount: 1,
      baselineIds: ['src/a.js::still broken'],
      changedFiles: ['src/a.js'],
    });
    expect(result.usedFallback).toBe(false);
    expect(result.isRegression).toBe(false);
    expect(result.newRegressions).toEqual([]);
  });

  it('does not flag a new-identity failure whose file the PR did not change', () => {
    const result = classifyRegressions({
      currentFailed: 1,
      currentIds: ['src/unrelated.js::flaky'],
      baselineFailedCount: 0,
      baselineIds: [],
      changedFiles: ['src/actually-changed.js'],
    });
    expect(result.isRegression).toBe(false);
    expect(result.newRegressions).toEqual([]);
  });

  it('flags a new-identity failure whose file the PR did change', () => {
    const result = classifyRegressions({
      currentFailed: 1,
      currentIds: ['src/actually-changed.js::newly broken'],
      baselineFailedCount: 0,
      baselineIds: [],
      changedFiles: ['src/actually-changed.js'],
    });
    expect(result.isRegression).toBe(true);
    expect(result.newRegressions).toEqual(['src/actually-changed.js::newly broken']);
  });

  it('reproduces the SD-EVIDENCE scenario: many pre-existing/unrelated failures do not block the PR', () => {
    // Mirrors PR #5330: 107 failures across 29 files the PR never touched, all
    // already present in the baseline (or at least not in the PR's diff).
    const preExistingIds = Array.from({ length: 107 }, (_, i) => `tests/unrelated-${i % 29}.test.js::flaky ${i}`);
    const result = classifyRegressions({
      currentFailed: preExistingIds.length,
      currentIds: preExistingIds,
      baselineFailedCount: 100,
      baselineIds: preExistingIds, // same identities were already failing on main
      changedFiles: ['scripts/my-actual-change.js'],
    });
    expect(result.isRegression).toBe(false);
    expect(result.newRegressions).toEqual([]);
  });

  it('falls back to identity-only (ignores reachability) when changedFiles is null', () => {
    const result = classifyRegressions({
      currentFailed: 1,
      currentIds: ['src/x.js::new'],
      baselineFailedCount: 0,
      baselineIds: [],
      changedFiles: null,
    });
    expect(result.isRegression).toBe(true);
    expect(result.newRegressions).toEqual(['src/x.js::new']);
  });
});

describe('getChangedFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses git diff --name-only output into a file list', () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('git diff')) return 'src/a.js\nsrc/b.js\n';
      return '';
    });
    const { files, error } = getChangedFiles({ baseRef: 'origin/main' });
    expect(error).toBeUndefined();
    expect(files).toEqual(['src/a.js', 'src/b.js']);
  });

  it('normalizes backslash path separators (Windows)', () => {
    execSync.mockImplementation(() => 'src\\a.js\n');
    const { files } = getChangedFiles({ baseRef: 'origin/main' });
    expect(files).toEqual(['src/a.js']);
  });

  it('fails open with { files: null, error } when git diff throws', () => {
    execSync.mockImplementation(() => { throw new Error('fatal: not a git repository'); });
    const { files, error } = getChangedFiles({ baseRef: 'origin/main' });
    expect(files).toBeNull();
    expect(error).toMatch(/not a git repository/);
  });
});

describe('fetchBaselineSnapshot', () => {
  function makeSupabase(rows, error = null) {
    const from = vi.fn();
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: rows, error })),
    };
    from.mockReturnValue(builder);
    return { from, __builder: builder };
  }

  it('queries the correct dimension/target_application/table and returns the matching branch', async () => {
    const rows = [
      { findings: [{ failed_count: 3, skipped_count: 5, failed_test_ids: ['a::b'], branch: 'main' }], scanned_at: '2026-01-01' },
    ];
    const supabase = makeSupabase(rows);
    const result = await fetchBaselineSnapshot(supabase, 'main');
    expect(supabase.from).toHaveBeenCalledWith(TABLE);
    expect(supabase.__builder.eq).toHaveBeenCalledWith('dimension', DIMENSION);
    expect(supabase.__builder.eq).toHaveBeenCalledWith('target_application', TARGET_APP);
    expect(result).toEqual({ failed_count: 3, skipped_count: 5, failed_test_ids: ['a::b'], scanned_at: '2026-01-01' });
  });

  it('returns null on cold start (no row matches the branch)', async () => {
    const supabase = makeSupabase([{ findings: [{ branch: 'other-branch', failed_count: 1 }], scanned_at: 't' }]);
    expect(await fetchBaselineSnapshot(supabase, 'main')).toBeNull();
  });

  it('sets failed_test_ids to null on a legacy snapshot missing the field', async () => {
    const supabase = makeSupabase([{ findings: [{ branch: 'main', failed_count: 5, skipped_count: 2 }], scanned_at: 't' }]);
    const result = await fetchBaselineSnapshot(supabase, 'main');
    expect(result.failed_test_ids).toBeNull();
  });

  it('throws on a DB error', async () => {
    const supabase = makeSupabase(null, { message: 'connection refused' });
    await expect(fetchBaselineSnapshot(supabase, 'main')).rejects.toThrow('connection refused');
  });
});
