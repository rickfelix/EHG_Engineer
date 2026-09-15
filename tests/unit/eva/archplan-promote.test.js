/**
 * SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001, FR-2, TS-1/TS-2.
 *
 * promoteArchPlan() already refused self-approval (promotedBy === created_by) before this SD,
 * but discarded the approver identity it verified -- the UPDATE never persisted it anywhere.
 * These tests assert the fix: a distinct-seat approval writes approved_by/approved_by_at,
 * a self-approval refusal still writes nothing at all, a concurrent-promotion race is lost
 * safely (compare-and-swap on chairman_approved), and the write degrades gracefully if the
 * new columns are not yet live (42703).
 */
import { describe, it, expect } from 'vitest';
import { promoteArchPlan } from '../../../lib/eva/archplan-promote.js';

/**
 * Mock Supabase client covering what promoteArchPlan touches: a SELECT (read the row) and an
 * UPDATE (the promotion write, chained through N .eq() filters before .select().single()).
 * Simulates a real compare-and-swap: the UPDATE only "succeeds" (matches a row) while the
 * mock's own chairman_approved is still false at the moment the update is issued -- so a test
 * can simulate a concurrent race by flipping it between the read and the write.
 *
 * @param {object} opts
 * @param {object} opts.row - the row returned by the initial SELECT
 * @param {boolean} [opts.raceWon] - if false, the row is already approved by the time the
 *   UPDATE runs (simulating a concurrent winner) -- the UPDATE matches zero rows (PGRST116).
 * @param {number} [opts.failCallsWithCode] - if set, this many leading UPDATE calls fail with
 *   this error code before subsequent calls succeed normally (used for the 42703 fail-soft
 *   retry test: the first, full-payload call fails; the second, fallback call succeeds).
 */
function makeSupabase({ row, raceWon = true, failCallsWithCode = null }) {
  const capture = { updates: [] };
  let failuresRemaining = failCallsWithCode ? failCallsWithCode.count : 0;
  const failCode = failCallsWithCode ? failCallsWithCode.code : null;
  return {
    capture,
    from(table) {
      expect(table).toBe('eva_architecture_plans');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
        update: (payload) => {
          capture.updates.push(payload);
          const shouldFail = failuresRemaining > 0;
          if (shouldFail) failuresRemaining -= 1;
          const chain = {
            eq: () => chain,
            select: () => ({
              single: async () => {
                if (shouldFail) {
                  return { data: null, error: { code: failCode, message: `simulated ${failCode}` } };
                }
                if (!raceWon) {
                  return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
                }
                return { data: { ...row, ...payload }, error: null };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
}

describe('promoteArchPlan (FR-2, TS-1): distinct-seat approval writes approved_by/approved_by_at', () => {
  it('writes approved_by=promotedBy and a real approved_by_at timestamp', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'seat-A', quality_checked: true },
    });

    const result = await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(true);
    expect(result.columnsApplied).toBe(true);
    const updated = sb.capture.updates[0];
    expect(updated.approved_by).toBe('seat-B');
    expect(typeof updated.approved_by_at).toBe('string');
    expect(new Date(updated.approved_by_at).toString()).not.toBe('Invalid Date');
  });

  it('leaves chairman_approved/chairman_approved_at behavior unchanged (existing fields still set)', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'seat-A', quality_checked: true },
    });

    await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    const updated = sb.capture.updates[0];
    expect(updated.status).toBe('active');
    expect(updated.chairman_approved).toBe(true);
    expect(typeof updated.chairman_approved_at).toBe('string');
  });

  it('never writes created_by (author provenance untouched)', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'seat-A', quality_checked: true },
    });

    await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    expect(sb.capture.updates[0]).not.toHaveProperty('created_by');
  });
});

describe('promoteArchPlan (FR-2, TS-2): self-approval refusal writes nothing', () => {
  it('refuses when promotedBy === row.created_by, and no UPDATE call is made at all', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'eva-archplan-command', quality_checked: true },
    });

    const result = await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'eva-archplan-command' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('self_approval_refused');
    expect(sb.capture.updates).toHaveLength(0);
  });

  it('already-approved rows are a no-op at the pre-write check and write nothing', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'active', chairman_approved: true, created_by: 'seat-A', quality_checked: true },
    });

    const result = await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('already_approved');
    expect(sb.capture.updates).toHaveLength(0);
  });
});

describe('promoteArchPlan: concurrency guard (adversarial /ship review finding, MEDIUM)', () => {
  it('a promotion that loses a concurrent race (row flips to approved between read and write) reports already_approved, not a hard error', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'seat-A', quality_checked: true },
      raceWon: false,
    });

    const result = await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('already_approved');
    // the UPDATE WAS attempted (unlike the pre-write no-op cases above) -- it just matched 0 rows
    expect(sb.capture.updates).toHaveLength(1);
  });
});

describe('promoteArchPlan: fail-soft when approved_by/approved_by_at are not yet live (adversarial /ship review finding, HIGH)', () => {
  it('a 42703 on the full payload retries with only the 3 pre-existing fields, and still promotes', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', plan_key: 'PLAN-X', status: 'draft', chairman_approved: false, created_by: 'seat-A', quality_checked: true },
      failCallsWithCode: { count: 1, code: '42703' }, // 1st call (full payload) fails; 2nd (fallback) succeeds
    });

    const result = await promoteArchPlan({ supabase: sb, planKey: 'PLAN-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(true);
    expect(result.columnsApplied).toBe(false);
    expect(sb.capture.updates).toHaveLength(2);
    expect(sb.capture.updates[0]).toHaveProperty('approved_by'); // the attempted full payload
    expect(sb.capture.updates[1]).not.toHaveProperty('approved_by'); // the fallback payload
    expect(sb.capture.updates[1].status).toBe('active');
    expect(sb.capture.updates[1].chairman_approved).toBe(true);
  });
});
