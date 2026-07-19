/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-3, TS-10.
 *
 * Baseline Observation (this SD's PRD) confirmed via code read + a live run that
 * ship-witness-enforce-readiness.mjs already re-fetches merges and telemetry rows fresh on
 * every invocation, with `today` defaulting to a live Date.now()-derived value — no caching
 * layer. This locks that finding in as a regression test rather than leaving it as an
 * unverified code-read claim.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeLiveReadiness } from '../../../scripts/ship-witness-enforce-readiness.mjs';

describe('computeLiveReadiness (TS-10): no caching/memoization between invocations', () => {
  it('calls the merge-fetch function fresh on every invocation — no memoized result reused', async () => {
    const fetchMerges = vi.fn((owner, name) => [{ repo: `${owner}/${name}`.toLowerCase(), prNumber: 1, mergedAt: '2026-07-04T00:00:00Z' }]);
    // QF-20260719-201: reads now go through fetchAllWitnessRows (.select().order().range()).
    const page = async () => ({ data: [{ repo: 'rickfelix/ehg_engineer', pr_number: 1 }], error: null });
    const supabase = { from: () => ({ select: () => ({ order: () => ({ range: page }) }) }) };

    await computeLiveReadiness(supabase, { fetchMerges });
    await computeLiveReadiness(supabase, { fetchMerges });

    // 2 platform repos x 2 invocations = 4 calls -- each invocation independently re-fetches,
    // proving no shared/memoized merges list survives across calls.
    expect(fetchMerges).toHaveBeenCalledTimes(4);
  });

  it('calls the merge_witness_telemetry select fresh on every invocation', async () => {
    // QF-20260719-201: count paginated reads at the select choke (one page per invocation).
    const select = vi.fn(() => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }));
    const supabase = { from: () => ({ select }) };
    const fetchMerges = () => [];

    await computeLiveReadiness(supabase, { fetchMerges });
    await computeLiveReadiness(supabase, { fetchMerges });

    expect(select).toHaveBeenCalledTimes(2);
  });

  it('a second invocation reflects NEW data the first invocation did not see (no stale snapshot)', async () => {
    let callCount = 0;
    const fetchMerges = (owner, name) => {
      callCount++;
      // Second pass (calls 3-4, since 2 repos x 2 passes) simulates a brand-new merge landing.
      if (callCount > 2) return [{ repo: `${owner}/${name}`.toLowerCase(), prNumber: 99, mergedAt: '2026-07-04T12:00:00Z' }];
      return [];
    };
    const supabase = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) };

    const first = await computeLiveReadiness(supabase, { fetchMerges });
    const second = await computeLiveReadiness(supabase, { fetchMerges });

    expect(first.dailyBreakdown).toEqual([]);
    // PLATFORM_REPOS has 2 entries, so the "new merge" fires for both on the second pass --
    // 2 unwitnessed merges land on the same day, one per repo.
    expect(second.dailyBreakdown.length).toBeGreaterThan(0);
    expect(second.dailyBreakdown[0].unwitnessed).toBe(2);
  });
});
