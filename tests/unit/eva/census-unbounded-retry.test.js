/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-4): census-as-code positive control. A broken query
 * (e.g. wrong table/column, or an unbounded select silently capped by PostgREST at 1000 rows --
 * SECURITY finding SEC-1 / TESTING finding, evidence 7b1758b7/11345782) would silently under- or
 * mis-report exactly like a correct query with nothing to report -- these tests seed a known
 * specimen (including one spanning more than one page) and assert the census actually finds it.
 */
import { describe, it, expect, vi } from 'vitest';
import { findUnboundedRetryVentures } from '../../../scripts/eva/census-unbounded-retry.mjs';
import { GATE_RETRY_CEILING } from '../../../lib/eva/gate-retry-guard.js';

/** Mock supabase whose eva_stage_gate_attempts select().range() genuinely paginates `allAttempts`. */
function makeSupabaseMock({ allAttempts, ventures }) {
  return {
    from: vi.fn((table) => {
      if (table === 'eva_stage_gate_attempts') {
        return {
          select: vi.fn(() => ({
            range: vi.fn(async (from, to) => ({ data: allAttempts.slice(from, to + 1), error: null })),
          })),
        };
      }
      if (table === 'ventures') {
        return { select: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: ventures, error: null })) })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('findUnboundedRetryVentures (FR-4 positive control)', () => {
  it('reports a venture/stage past the ceiling that is NOT terminalized', async () => {
    const allAttempts = Array.from({ length: GATE_RETRY_CEILING + 1 }, () => ({ venture_id: 'v-stuck', stage_number: 21 }));
    const api = makeSupabaseMock({ allAttempts, ventures: [{ id: 'v-stuck', metadata: {} }] });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ venture_id: 'v-stuck', stage_number: 21, attempt_count: GATE_RETRY_CEILING + 1 });
  });

  it('excludes a venture already terminalized (gating_decision.parked=true)', async () => {
    const allAttempts = Array.from({ length: GATE_RETRY_CEILING + 1 }, () => ({ venture_id: 'v-parked', stage_number: 21 }));
    const api = makeSupabaseMock({ allAttempts, ventures: [{ id: 'v-parked', metadata: { gating_decision: { parked: true } } }] });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(0);
  });

  it('reports 0 when no venture is near the ceiling (the expected post-ship state)', async () => {
    const allAttempts = [{ venture_id: 'v-normal', stage_number: 5 }, { venture_id: 'v-normal', stage_number: 5 }];
    const api = makeSupabaseMock({ allAttempts, ventures: [] });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(0);
  });

  // SEC-1 / TESTING regression coverage: proves pagination, not just a single page.
  it('does not truncate at the page boundary -- correctly counts a specimen spanning multiple pages (ApexNiche-shaped: 1902 rows against a 1000-row page)', async () => {
    const PAGE_SIZE = 1000;
    const TOTAL = 1902;
    const allAttempts = Array.from({ length: TOTAL }, () => ({ venture_id: 'v-apexniche-shaped', stage_number: 21 }));
    const api = makeSupabaseMock({ allAttempts, ventures: [{ id: 'v-apexniche-shaped', metadata: {} }] });
    const result = await findUnboundedRetryVentures(api, { pageSize: PAGE_SIZE });
    expect(result).toHaveLength(1);
    expect(result[0].attempt_count).toBe(TOTAL); // NOT 1000 -- a truncated implementation would fail this
  });

  it('a single-page implementation (no pagination) would have failed the above -- sanity check that .range() is actually called more than once for >1 page', async () => {
    const allAttempts = Array.from({ length: 1500 }, () => ({ venture_id: 'v-x', stage_number: 9 }));
    const rangeSpy = vi.fn(async (from, to) => ({ data: allAttempts.slice(from, to + 1), error: null }));
    const api = {
      from: vi.fn((table) => {
        if (table === 'eva_stage_gate_attempts') return { select: vi.fn(() => ({ range: rangeSpy })) };
        if (table === 'ventures') return { select: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [{ id: 'v-x', metadata: {} }], error: null })) })) })) };
        throw new Error(`unexpected table ${table}`);
      }),
    };
    await findUnboundedRetryVentures(api, { pageSize: 1000 });
    expect(rangeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
