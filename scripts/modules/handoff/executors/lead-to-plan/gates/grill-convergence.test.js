/**
 * Tests for GATE_GRILL_CONVERGENCE bypass-quota reads (LEAD-TO-PLAN)
 * SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-1.
 *
 * Founding defect: `(sdBypassCount || 0) >= BYPASS_QUOTA_PER_SD` / the day-quota equivalent
 * coerced an unmeasurable count (count: null, error: null -- e.g. a missing/renamed relation or
 * an RLS denial that PostgREST reports without an error) to 0, so the quota check always passed
 * and the gate fell through to the "Quota OK — record bypass and allow" branch, granting an
 * UNLIMITED bypass on a broken query. safeCount throws COUNT_UNMEASURABLE instead, so the grant
 * path can never be reached on an unmeasurable count.
 */

import { describe, it, expect } from 'vitest';
import { createGrillConvergenceGate } from './grill-convergence.js';

/** A minimal thenable that resolves to a queued {count, error} result on each await. */
function makeAuditLogSupabase(countResults) {
  let idx = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    then: (resolve, reject) => Promise.resolve(countResults[idx++]).then(resolve, reject),
  };
  return {
    from: (table) => {
      if (table === 'audit_log') {
        return {
          select: () => chain,
          insert: () => Promise.resolve({ data: null, error: null }),
        };
      }
      throw new Error(`unexpected table in this mock: ${table}`);
    },
  };
}

function bypassSD(overrides = {}) {
  return {
    id: 'sd-1',
    sd_key: 'SD-TEST-001',
    metadata: {
      open_questions_for_plan_phase: ['what about X?'],
      grill_bypass: true,
      grill_bypass_reason: 'documented chairman-approved bypass reason',
      ...overrides,
    },
  };
}

describe('GATE_GRILL_CONVERGENCE bypass-quota counts', () => {
  it('grants the bypass when both counts are measurable and under quota', async () => {
    const supabase = makeAuditLogSupabase([{ count: 0, error: null }, { count: 0, error: null }]);
    const gate = createGrillConvergenceGate(supabase);

    const result = await gate.validator({ sd: bypassSD() });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.bypass_accepted).toBe(true);
  });

  it('refuses the bypass when the measurable per-SD count is at quota', async () => {
    const supabase = makeAuditLogSupabase([{ count: 3, error: null }]);
    const gate = createGrillConvergenceGate(supabase);

    const result = await gate.validator({ sd: bypassSD() });

    expect(result.passed).toBe(false);
    expect(result.details.bypass_rejected).toBe('sd_quota');
  });

  it('refuses the bypass when the measurable per-day count is at quota', async () => {
    const supabase = makeAuditLogSupabase([{ count: 0, error: null }, { count: 10, error: null }]);
    const gate = createGrillConvergenceGate(supabase);

    const result = await gate.validator({ sd: bypassSD() });

    expect(result.passed).toBe(false);
    expect(result.details.bypass_rejected).toBe('day_quota');
  });

  it('FR-1: refuses (throws, never grants) when the per-SD count is unmeasurable', async () => {
    const supabase = makeAuditLogSupabase([{ count: null, error: null }]);
    const gate = createGrillConvergenceGate(supabase);

    await expect(gate.validator({ sd: bypassSD() })).rejects.toThrow('COUNT_UNMEASURABLE');
  });

  it('FR-1: refuses (throws, never grants) when the per-day count is unmeasurable', async () => {
    const supabase = makeAuditLogSupabase([{ count: 0, error: null }, { count: null, error: null }]);
    const gate = createGrillConvergenceGate(supabase);

    await expect(gate.validator({ sd: bypassSD() })).rejects.toThrow('COUNT_UNMEASURABLE');
  });
});
