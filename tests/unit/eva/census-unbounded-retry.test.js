/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-4): census-as-code positive control. A broken query
 * (e.g. wrong table/column) would silently return 0 exactly like a correct query with nothing
 * to report -- this test seeds a known specimen and asserts the census actually finds it.
 */
import { describe, it, expect, vi } from 'vitest';
import { findUnboundedRetryVentures } from '../../../scripts/eva/census-unbounded-retry.mjs';
import { GATE_RETRY_CEILING } from '../../../lib/eva/gate-retry-guard.js';

function makeSupabaseMock({ attempts, ventures }) {
  return {
    from: vi.fn((table) => {
      if (table === 'eva_stage_gate_attempts') {
        return { select: vi.fn(async () => ({ data: attempts, error: null })) };
      }
      if (table === 'ventures') {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: ventures, error: null })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('findUnboundedRetryVentures (FR-4 positive control)', () => {
  it('reports a venture/stage past the ceiling that is NOT terminalized', async () => {
    const attempts = Array.from({ length: GATE_RETRY_CEILING + 1 }, () => ({ venture_id: 'v-stuck', stage_number: 21 }));
    const api = makeSupabaseMock({
      attempts,
      ventures: [{ id: 'v-stuck', metadata: {} }],
    });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ venture_id: 'v-stuck', stage_number: 21, attempt_count: GATE_RETRY_CEILING + 1 });
  });

  it('excludes a venture already terminalized (gating_decision.parked=true)', async () => {
    const attempts = Array.from({ length: GATE_RETRY_CEILING + 1 }, () => ({ venture_id: 'v-parked', stage_number: 21 }));
    const api = makeSupabaseMock({
      attempts,
      ventures: [{ id: 'v-parked', metadata: { gating_decision: { parked: true } } }],
    });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(0);
  });

  it('reports 0 when no venture is near the ceiling (the expected post-ship state)', async () => {
    const attempts = [{ venture_id: 'v-normal', stage_number: 5 }, { venture_id: 'v-normal', stage_number: 5 }];
    const api = makeSupabaseMock({ attempts, ventures: [] });
    const result = await findUnboundedRetryVentures(api);
    expect(result).toHaveLength(0);
  });
});
