import { describe, it, expect } from 'vitest';
import { classifyOpenPR, findOrphans } from '../../scripts/audit-orphan-prs.mjs';

describe('audit-orphan-prs — classifyOpenPR', () => {
  const NOW = Date.parse('2026-04-27T00:00:00Z');

  it('parses an SD-prefix open PR with age', () => {
    const out = classifyOpenPR(
      { number: 100, headRefName: 'feat/SD-X-001-slug', createdAt: '2026-04-20T00:00:00Z' },
      'rickfelix/EHG_Engineer',
      NOW
    );
    expect(out).toMatchObject({
      kind: 'SD',
      key: 'SD-X-001',
      pr_number: 100,
      repo: 'rickfelix/EHG_Engineer',
      age_days: 7,
    });
  });

  it('parses a QF-prefix open PR', () => {
    const out = classifyOpenPR(
      { number: 200, headRefName: 'qf/QF-20260101-001', createdAt: '2026-04-26T12:00:00Z' },
      'rickfelix/ehg',
      NOW
    );
    expect(out).toMatchObject({ kind: 'QF', key: 'QF-20260101-001' });
  });

  it('returns null for unrecognized branches', () => {
    expect(
      classifyOpenPR({ number: 1, headRefName: 'random-branch' }, 'rickfelix/ehg', NOW)
    ).toBeNull();
  });

  it('returns null for malformed PR objects', () => {
    expect(classifyOpenPR(null, 'r')).toBeNull();
    expect(classifyOpenPR({}, 'r')).toBeNull();
  });

  it('handles missing createdAt with age_days=null', () => {
    const out = classifyOpenPR(
      { number: 5, headRefName: 'feat/SD-X-001' },
      'r',
      NOW
    );
    expect(out.age_days).toBeNull();
  });
});

describe('audit-orphan-prs — findOrphans', () => {
  it('returns SD orphans when their key is in completedSDs', () => {
    const candidates = [
      { kind: 'SD', key: 'SD-A-001', pr_number: 1, branch: 'feat/SD-A-001', repo: 'r', age_days: 1 },
      { kind: 'SD', key: 'SD-B-002', pr_number: 2, branch: 'feat/SD-B-002', repo: 'r', age_days: 1 },
    ];
    const orphans = findOrphans(candidates, new Set(['SD-A-001']), new Set());
    expect(orphans.length).toBe(1);
    expect(orphans[0].key).toBe('SD-A-001');
  });

  it('returns QF orphans when their key is in completedQFs', () => {
    const candidates = [
      { kind: 'QF', key: 'QF-20260101-001', pr_number: 3, branch: 'qf/...', repo: 'r', age_days: 1 },
    ];
    const orphans = findOrphans(candidates, new Set(), new Set(['QF-20260101-001']));
    expect(orphans.length).toBe(1);
  });

  it('returns empty when nothing matches', () => {
    expect(findOrphans([{ kind: 'SD', key: 'SD-A' }], new Set(), new Set())).toEqual([]);
  });

  it('skips falsy candidates and unknown kinds', () => {
    const orphans = findOrphans(
      [null, undefined, { kind: 'OTHER', key: 'x' }, { kind: 'SD', key: 'SD-Z-001' }],
      new Set(['SD-Z-001']),
      new Set()
    );
    expect(orphans.length).toBe(1);
    expect(orphans[0].key).toBe('SD-Z-001');
  });
});
