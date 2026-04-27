import { describe, it, expect } from 'vitest';
import { classifyPR } from '../../scripts/backfill-pr-tracking.js';

describe('backfill-pr-tracking — classifyPR', () => {
  it('classifies a feat/SD-* PR as a candidate', () => {
    const result = classifyPR({
      number: 100,
      headRefName: 'feat/SD-XYZ-001-some-slug',
      mergedAt: '2026-04-26T12:00:00Z',
      mergeCommit: { oid: 'abc123' },
    });
    expect(result.outcome).toBe('candidate');
    expect(result.kind).toBe('SD');
    expect(result.sd_key).toBe('SD-XYZ-001');
    expect(result.pr_number).toBe(100);
    expect(result.branch).toBe('feat/SD-XYZ-001-some-slug');
  });

  it('classifies a qf/QF-* PR as a QF candidate', () => {
    const result = classifyPR({
      number: 200,
      headRefName: 'qf/QF-20260101-001',
      mergedAt: '2026-04-26T12:00:00Z',
      mergeCommit: { oid: 'abc' },
    });
    expect(result.outcome).toBe('candidate');
    expect(result.kind).toBe('QF');
  });

  it('skips PRs whose branch has no SD/QF key', () => {
    const result = classifyPR({
      number: 300,
      headRefName: 'random-branch-name',
    });
    expect(result.outcome).toBe('skip');
    expect(result.reason).toMatch(/no SD\/QF key/);
  });

  it('skips PRs missing required fields', () => {
    expect(classifyPR(null).outcome).toBe('skip');
    expect(classifyPR({}).outcome).toBe('skip');
    expect(classifyPR({ number: 1 }).outcome).toBe('skip');
  });

  it('handles missing mergeCommit gracefully', () => {
    const result = classifyPR({
      number: 400,
      headRefName: 'feat/SD-XYZ-001',
      mergedAt: '2026-04-26T12:00:00Z',
    });
    expect(result.outcome).toBe('candidate');
    expect(result.mergeOid).toBeNull();
  });
});
