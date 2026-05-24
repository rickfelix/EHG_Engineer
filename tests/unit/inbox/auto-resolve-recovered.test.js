/**
 * Tests for auto-resolve-recovered.js (CAPA-7 of SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001).
 *
 * Covers the decision matrix (shouldAutoResolve), argument parsing, and gh-runs
 * fetcher fallback. End-to-end DB writes are not exercised here — the module is
 * structured so the core decision is a pure function over (runs, rowCreatedAt, k).
 *
 * @module tests/unit/inbox/auto-resolve-recovered.test
 */

import { describe, it, expect, vi } from 'vitest';

// Stub supabase + dotenv so importing the module does not exit() or hit network.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: () => ({ update: () => ({ eq: () => ({}) }) }) })),
}));
vi.mock('dotenv/config', () => ({}));
vi.mock('../../../lib/utils/is-main-module.js', () => ({ isMainModule: () => false }));

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { shouldAutoResolve, parseArgs, fetchRecentRuns, isEligibleForResolve, isWorkflowUnhealthy } = await import(
  '../../../scripts/modules/inbox/auto-resolve-recovered.js'
);

describe('shouldAutoResolve decision matrix', () => {
  const rowCreatedAt = '2026-05-01T00:00:00Z';
  const success = (createdAt) => ({ conclusion: 'success', createdAt });

  it('returns true when all K runs are success AND newest > rowCreatedAt', () => {
    const runs = [
      success('2026-05-11T10:00:00Z'),
      success('2026-05-10T10:00:00Z'),
      success('2026-05-09T10:00:00Z'),
      success('2026-05-08T10:00:00Z'),
      success('2026-05-07T10:00:00Z'),
    ];
    expect(shouldAutoResolve(runs, rowCreatedAt, 5)).toBe(true);
  });

  it('returns false when runs.length < k (insufficient evidence)', () => {
    const runs = [success('2026-05-11T10:00:00Z'), success('2026-05-10T10:00:00Z')];
    expect(shouldAutoResolve(runs, rowCreatedAt, 5)).toBe(false);
  });

  it('returns false when even one run is a failure', () => {
    const runs = [
      success('2026-05-11T10:00:00Z'),
      success('2026-05-10T10:00:00Z'),
      { conclusion: 'failure', createdAt: '2026-05-09T10:00:00Z' },
      success('2026-05-08T10:00:00Z'),
      success('2026-05-07T10:00:00Z'),
    ];
    expect(shouldAutoResolve(runs, rowCreatedAt, 5)).toBe(false);
  });

  it('returns false when newest run is older than rowCreatedAt (no post-row recovery)', () => {
    const rowAfterRuns = '2026-06-01T00:00:00Z';
    const runs = [
      success('2026-05-11T10:00:00Z'),
      success('2026-05-10T10:00:00Z'),
      success('2026-05-09T10:00:00Z'),
      success('2026-05-08T10:00:00Z'),
      success('2026-05-07T10:00:00Z'),
    ];
    expect(shouldAutoResolve(runs, rowAfterRuns, 5)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(shouldAutoResolve([], rowCreatedAt, 5)).toBe(false);
  });

  it('returns false for null / non-array input', () => {
    expect(shouldAutoResolve(null, rowCreatedAt, 5)).toBe(false);
    expect(shouldAutoResolve(undefined, rowCreatedAt, 5)).toBe(false);
    expect(shouldAutoResolve('not-array', rowCreatedAt, 5)).toBe(false);
  });

  it('treats unconventional conclusion values (cancelled, neutral) as non-success', () => {
    const runs = [
      { conclusion: 'cancelled', createdAt: '2026-05-11T10:00:00Z' },
      success('2026-05-10T10:00:00Z'),
      success('2026-05-09T10:00:00Z'),
      success('2026-05-08T10:00:00Z'),
      success('2026-05-07T10:00:00Z'),
    ];
    expect(shouldAutoResolve(runs, rowCreatedAt, 5)).toBe(false);
  });

  it('honors variable k (k=3 with 3 successes passes; k=5 with same input fails)', () => {
    const runs = [
      success('2026-05-11T10:00:00Z'),
      success('2026-05-10T10:00:00Z'),
      success('2026-05-09T10:00:00Z'),
    ];
    expect(shouldAutoResolve(runs, rowCreatedAt, 3)).toBe(true);
    expect(shouldAutoResolve(runs, rowCreatedAt, 5)).toBe(false);
  });
});

describe('parseArgs', () => {
  it('returns defaults for empty argv', () => {
    const f = parseArgs([]);
    expect(f).toEqual({ maxItems: 20, dryRun: false, k: 5, staleHours: 24 });
  });

  it('parses --dry-run flag', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --max-items, --k, --stale-hours together', () => {
    const f = parseArgs(['--max-items', '50', '--k', '10', '--stale-hours', '48']);
    expect(f).toEqual({ maxItems: 50, dryRun: false, k: 10, staleHours: 48 });
  });

  it('falls back to defaults on non-numeric values', () => {
    const f = parseArgs(['--max-items', 'abc', '--k', 'NaN', '--stale-hours', '']);
    expect(f.maxItems).toBe(20);
    expect(f.k).toBe(5);
    expect(f.staleHours).toBe(24);
  });

  it('ignores trailing flag without value', () => {
    const f = parseArgs(['--max-items']);
    expect(f.maxItems).toBe(20);
  });
});

describe('isEligibleForResolve (QF-20260511-453: widen filter for status=new post-merge)', () => {
  const NOW = new Date('2026-05-11T20:00:00Z').getTime();

  it('returns true for status=new regardless of age (post-merge race)', () => {
    // Witness: QF-499 PR #3727 merged 19:26Z, feedback emitted 19:52Z (8 min old).
    // Before the fix, the SQL .lt(created_at, cutoffIso) excluded this row.
    const freshNewRow = { status: 'new', created_at: '2026-05-11T19:52:00Z' };
    expect(isEligibleForResolve(freshNewRow, 24, NOW)).toBe(true);
  });

  it('returns true for old status=new row too (no upper-age bound on new)', () => {
    const oldNewRow = { status: 'new', created_at: '2026-04-01T00:00:00Z' };
    expect(isEligibleForResolve(oldNewRow, 24, NOW)).toBe(true);
  });

  it('returns true for status=in_progress older than staleHours', () => {
    const oldRow = { status: 'in_progress', created_at: '2026-05-09T00:00:00Z' };
    expect(isEligibleForResolve(oldRow, 24, NOW)).toBe(true);
  });

  it('returns false for status=in_progress younger than staleHours', () => {
    const freshRow = { status: 'in_progress', created_at: '2026-05-11T10:00:00Z' };
    expect(isEligibleForResolve(freshRow, 24, NOW)).toBe(false);
  });

  it('returns false for status=resolved / triaged / other', () => {
    expect(isEligibleForResolve({ status: 'resolved', created_at: '2026-05-09T00:00:00Z' }, 24, NOW)).toBe(false);
    expect(isEligibleForResolve({ status: 'triaged', created_at: '2026-05-09T00:00:00Z' }, 24, NOW)).toBe(false);
    expect(isEligibleForResolve({ status: 'wont_fix', created_at: '2026-05-09T00:00:00Z' }, 24, NOW)).toBe(false);
  });

  it('returns false for null / missing status', () => {
    expect(isEligibleForResolve(null, 24, NOW)).toBe(false);
    expect(isEligibleForResolve({}, 24, NOW)).toBe(false);
    expect(isEligibleForResolve({ status: null, created_at: '2026-05-09T00:00:00Z' }, 24, NOW)).toBe(false);
  });

  it('honors variable staleHours (status=in_progress boundary)', () => {
    // Exactly 1h old; staleHours=2 → not yet eligible; staleHours=1 → eligible.
    const row = { status: 'in_progress', created_at: '2026-05-11T19:00:00Z' };
    expect(isEligibleForResolve(row, 2, NOW)).toBe(false);
    expect(isEligibleForResolve(row, 1, NOW)).toBe(true);
  });
});

describe('fetchRecentRuns', () => {
  it('returns parsed JSON on successful exec', () => {
    const mockExec = vi.fn(() => JSON.stringify([{ conclusion: 'success', createdAt: '2026-05-11T10:00:00Z' }]));
    const result = fetchRecentRuns('owner/repo', 'My Workflow', 5, mockExec);
    expect(result).toEqual([{ conclusion: 'success', createdAt: '2026-05-11T10:00:00Z' }]);
    expect(mockExec).toHaveBeenCalledTimes(1);
    const cmd = mockExec.mock.calls[0][0];
    expect(cmd).toContain('gh run list --repo owner/repo');
    expect(cmd).toContain('--workflow="My Workflow"');
    expect(cmd).toContain('--limit 5');
  });

  it('strips double-quotes from workflow name to prevent shell escape', () => {
    const mockExec = vi.fn(() => '[]');
    fetchRecentRuns('owner/repo', 'Evil"Workflow', 5, mockExec);
    const cmd = mockExec.mock.calls[0][0];
    expect(cmd).toContain('--workflow="EvilWorkflow"');
    expect(cmd).not.toContain('Evil"');
  });

  it('returns null when exec throws (gh CLI failure, workflow not found, etc.)', () => {
    const mockExec = vi.fn(() => { throw new Error('gh: workflow not found'); });
    const result = fetchRecentRuns('owner/repo', 'Missing Workflow', 5, mockExec);
    expect(result).toBe(null);
  });

  it('returns null on malformed JSON from gh CLI', () => {
    const mockExec = vi.fn(() => 'not-json-at-all');
    const result = fetchRecentRuns('owner/repo', 'Workflow', 5, mockExec);
    expect(result).toBe(null);
  });
});

describe('isWorkflowUnhealthy (QF-20260523-339: 0%-success / no-runs sweep)', () => {
  const fail = (c = 'failure') => ({ conclusion: c, createdAt: '2026-05-10T10:00:00Z' });
  const success = () => ({ conclusion: 'success', createdAt: '2026-05-10T10:00:00Z' });

  it('returns false for null (transient gh error / unknown — never resolve on uncertainty)', () => {
    expect(isWorkflowUnhealthy(null, 5)).toBe(false);
    expect(isWorkflowUnhealthy(undefined, 5)).toBe(false);
  });

  it('returns true for empty array (no runs in window: workflow deleted/renamed/inactive)', () => {
    expect(isWorkflowUnhealthy([], 5)).toBe(true);
  });

  it('returns true when >= minRuns and none succeeded (0% success)', () => {
    expect(isWorkflowUnhealthy([fail(), fail(), fail(), fail(), fail()], 5)).toBe(true);
  });

  it('returns false when fewer than minRuns (insufficient evidence)', () => {
    expect(isWorkflowUnhealthy([fail(), fail()], 5)).toBe(false);
  });

  it('returns false when at least one recent run succeeded', () => {
    expect(isWorkflowUnhealthy([fail(), fail(), success(), fail(), fail()], 5)).toBe(false);
  });

  it('treats cancelled/null/neutral conclusions as non-success', () => {
    expect(isWorkflowUnhealthy([fail('cancelled'), fail('neutral'), fail(null), fail(), fail()], 5)).toBe(true);
  });

  it('honors variable minRuns (3 failures: unhealthy at minRuns=3, not at minRuns=5)', () => {
    const threeFails = [fail(), fail(), fail()];
    expect(isWorkflowUnhealthy(threeFails, 3)).toBe(true);
    expect(isWorkflowUnhealthy(threeFails, 5)).toBe(false);
  });
});
