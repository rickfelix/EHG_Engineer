/**
 * SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-2) — filterAlreadySuppressed(): the
 * write-time dedup gate itself, extracted from consultantAnalysisHandler() for direct
 * unit testability (TESTING sub-agent EXEC-phase review found this integration flow had
 * zero coverage, including the time-bound release-valve behavior -- fixed here).
 *
 * Simulates the real PostgREST .or('re_review_at.is.null,re_review_at.gt.<now>') filter:
 * a matching row suppresses the candidate UNLESS its re_review_at has already passed.
 */
import { describe, it, expect } from 'vitest';
import { filterAlreadySuppressed } from '../../../scripts/eva/consultant-analysis-round.mjs';

function mockClient(existingRows) {
  return {
    from: () => {
      let filtered = existingRows;
      const builder = {
        select: () => builder,
        in: (col, vals) => {
          filtered = filtered.filter((r) => vals.includes(r.fingerprint));
          return builder;
        },
        or: (filterStr) => {
          const nowIso = filterStr.match(/re_review_at\.gt\.(.+)$/)[1];
          const now = new Date(nowIso);
          const unexpired = filtered.filter((r) => r.re_review_at == null || new Date(r.re_review_at) > now);
          return Promise.resolve({ data: unexpired, error: null });
        },
      };
      return builder;
    },
  };
}

const NOW = '2026-07-17T00:00:00.000Z';

function finding(domain, title, sources = []) {
  return { domain, title, description: 'x', dataPoints: 5, sources };
}

describe('filterAlreadySuppressed (FR-2)', () => {
  it('a fresh finding with no matching fingerprint in the DB survives', async () => {
    const client = mockClient([]); // nothing in the DB yet
    const f = finding('okr_drift', 'A brand new finding');
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(client, [f], NOW);
    expect(survivors).toHaveLength(1);
    expect(dedupSuppressedCount).toBe(0);
  });

  it('a finding whose fingerprint exists with an UNEXPIRED re_review_at is suppressed', async () => {
    const f = finding('capability_delivery', 'Delivery skewed toward infrastructure SDs (65%)');
    // Recompute the real fingerprint the function would derive, so the mock DB row matches.
    const { computeFindingFingerprint } = await import('../../../scripts/eva/consultant-analysis-round.mjs');
    const fp = computeFindingFingerprint(f);
    const client = mockClient([{ fingerprint: fp, re_review_at: '2026-08-01T00:00:00.000Z' }]); // future
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(client, [f], NOW);
    expect(survivors).toHaveLength(0);
    expect(dedupSuppressedCount).toBe(1);
  });

  it('a finding whose matching row\'s re_review_at has ALREADY PASSED is re-emitted (the release valve)', async () => {
    const f = finding('capability_delivery', 'Delivery skewed toward infrastructure SDs (65%)');
    const { computeFindingFingerprint } = await import('../../../scripts/eva/consultant-analysis-round.mjs');
    const fp = computeFindingFingerprint(f);
    const client = mockClient([{ fingerprint: fp, re_review_at: '2026-06-01T00:00:00.000Z' }]); // past
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(client, [f], NOW);
    expect(survivors).toHaveLength(1);
    expect(dedupSuppressedCount).toBe(0);
  });

  it('a finding whose matching row has re_review_at=null is suppressed indefinitely (no expiry)', async () => {
    const f = finding('capability_delivery', 'Delivery skewed toward infrastructure SDs (65%)');
    const { computeFindingFingerprint } = await import('../../../scripts/eva/consultant-analysis-round.mjs');
    const fp = computeFindingFingerprint(f);
    const client = mockClient([{ fingerprint: fp, re_review_at: null }]);
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(client, [f], NOW);
    expect(survivors).toHaveLength(0);
    expect(dedupSuppressedCount).toBe(1);
  });

  it('a mix of fresh, suppressed, and re-emittable findings resolves each independently', async () => {
    const fresh = finding('okr_drift', 'A brand new finding');
    const suppressedFinding = finding('capability_delivery', 'Delivery skewed toward infrastructure SDs (65%)');
    const releasedFinding = finding('protocol_health', '12 pending protocol improvements (oldest: 9d)');
    const { computeFindingFingerprint } = await import('../../../scripts/eva/consultant-analysis-round.mjs');
    const client = mockClient([
      { fingerprint: computeFindingFingerprint(suppressedFinding), re_review_at: '2026-08-01T00:00:00.000Z' },
      { fingerprint: computeFindingFingerprint(releasedFinding), re_review_at: '2026-06-01T00:00:00.000Z' },
    ]);
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(
      client, [fresh, suppressedFinding, releasedFinding], NOW
    );
    expect(survivors.map((s) => s.title).sort()).toEqual(
      [fresh.title, releasedFinding.title].sort()
    );
    expect(dedupSuppressedCount).toBe(1);
  });

  it('an empty candidate list short-circuits without querying the DB', async () => {
    let queried = false;
    const client = { from: () => { queried = true; throw new Error('should not be called'); } };
    const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(client, [], NOW);
    expect(survivors).toEqual([]);
    expect(dedupSuppressedCount).toBe(0);
    expect(queried).toBe(false);
  });
});
