// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-2) -- TS-1, TS-2, TS-3, TS-6, TS-9(partial via meter
// param), TS-11, TS-13.
import { describe, it, expect } from 'vitest';
import { projectBurn, VERDICTS } from '../../../lib/fleet/account-usage-burn-projection.cjs';

/** Minimal chainable mock matching exactly the .from().select().eq().order().limit() shape
 *  account-usage-burn-projection.cjs calls. */
function makeSupabase(rowsByAccount, { errorForAccount } = {}) {
  return {
    from(table) {
      expect(table).toBe('account_usage_pastes');
      return {
        select() {
          return {
            eq(col, val) {
              expect(col).toBe('account_uuid8');
              return {
                order() {
                  return {
                    async limit(n) {
                      if (errorForAccount && errorForAccount === val) {
                        return { data: null, error: { message: 'connection reset' } };
                      }
                      const rows = (rowsByAccount[val] || []).slice(0, n);
                      return { data: rows, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('projectBurn', () => {
  it('TS-1: two rows with increasing pct yield a confident positive-slope projection citing both row ids', async () => {
    const supabase = makeSupabase({
      X: [
        { id: 53, pasted_at: '2026-08-28T00:00:00Z', week_all_models_pct: 70, week_reset_at: '2026-09-01T00:00:00Z' },
        { id: 41, pasted_at: '2026-08-24T00:00:00Z', week_all_models_pct: 38, week_reset_at: '2026-09-01T00:00:00Z' },
      ],
    });
    const result = await projectBurn('X', 'week_all_models', { supabase });
    expect(result.slope_pct_per_day).toBeCloseTo(8, 0);
    expect(result.row_ids).toEqual([41, 53]);
    expect([VERDICTS.CONFIDENT_OK, VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET]).toContain(result.verdict);
  });

  it('TS-2: exactly one row never fabricates a slope', async () => {
    const supabase = makeSupabase({ Y: [{ id: 1, pasted_at: '2026-08-28T00:00:00Z', session_pct: 50, session_reset_at: null }] });
    const result = await projectBurn('Y', 'session', { supabase });
    expect(result.verdict).toBe(VERDICTS.INSUFFICIENT_DATA);
    expect(result.rows_available).toBe(1);
    expect(result.slope_pct_per_day).toBeUndefined();
    expect(result.projected_exhaustion_at).toBeUndefined();
  });

  it('zero rows also yields INSUFFICIENT_DATA without throwing', async () => {
    const supabase = makeSupabase({});
    const result = await projectBurn('Z', 'session', { supabase });
    expect(result.verdict).toBe(VERDICTS.INSUFFICIENT_DATA);
    expect(result.rows_available).toBe(0);
  });

  it('TS-6: a query error is DATA_UNAVAILABLE, never reinterpreted as INSUFFICIENT_DATA', async () => {
    const supabase = makeSupabase({}, { errorForAccount: 'W' });
    const result = await projectBurn('W', 'session', { supabase });
    expect(result.verdict).toBe(VERDICTS.DATA_UNAVAILABLE);
    expect(result.rows_available).toBeUndefined();
  });

  it('TS-13: a non-positive slope yields CONFIDENT_NO_RISK, not a false exhaustion warning', async () => {
    const supabase = makeSupabase({
      V: [
        { id: 2, pasted_at: '2026-08-28T00:00:00Z', session_pct: 30, session_reset_at: '2026-08-30T00:00:00Z' },
        { id: 1, pasted_at: '2026-08-24T00:00:00Z', session_pct: 60, session_reset_at: '2026-08-30T00:00:00Z' },
      ],
    });
    const result = await projectBurn('V', 'session', { supabase });
    expect(result.verdict).toBe(VERDICTS.CONFIDENT_NO_RISK);
    expect(result.projected_exhaustion_at).toBeUndefined();
  });

  it('exhaustion before reset is distinguished from exhaustion after reset', async () => {
    // slope = (90-80)/1 day = 10%/day; exhausts 1 day after the newer reading (08-29), well
    // before the reset at 09-05.
    const supabase = makeSupabase({
      A: [
        { id: 2, pasted_at: '2026-08-28T00:00:00Z', week_fable_pct: 90, week_reset_at: '2026-09-05T00:00:00Z' },
        { id: 1, pasted_at: '2026-08-27T00:00:00Z', week_fable_pct: 80, week_reset_at: '2026-09-05T00:00:00Z' },
      ],
    });
    const result = await projectBurn('A', 'week_fable', { supabase });
    expect(result.verdict).toBe(VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET);
  });

  it('exhaustion projected AFTER reset yields CONFIDENT_OK, not a false alarm', async () => {
    // Same slope, but the reset lands before the projected exhaustion date.
    const supabase = makeSupabase({
      B2: [
        { id: 2, pasted_at: '2026-08-28T00:00:00Z', week_fable_pct: 90, week_reset_at: '2026-08-28T12:00:00Z' },
        { id: 1, pasted_at: '2026-08-27T00:00:00Z', week_fable_pct: 80, week_reset_at: '2026-08-28T12:00:00Z' },
      ],
    });
    const result = await projectBurn('B2', 'week_fable', { supabase });
    expect(result.verdict).toBe(VERDICTS.CONFIDENT_OK);
  });

  it('TS-11: projecting for account A never reads/cites account B\'s rows', async () => {
    const supabase = makeSupabase({
      A: [
        { id: 10, pasted_at: '2026-08-28T00:00:00Z', session_pct: 50, session_reset_at: null },
        { id: 11, pasted_at: '2026-08-24T00:00:00Z', session_pct: 20, session_reset_at: null },
      ],
      B: [
        { id: 20, pasted_at: '2026-08-28T00:00:00Z', session_pct: 99, session_reset_at: null },
        { id: 21, pasted_at: '2026-08-24T00:00:00Z', session_pct: 5, session_reset_at: null },
      ],
    });
    const resultA = await projectBurn('A', 'session', { supabase });
    expect(resultA.row_ids.every((id) => [10, 11].includes(id))).toBe(true);
    expect(resultA.row_ids.some((id) => [20, 21].includes(id))).toBe(false);
  });

  it('rejects an invalid meter argument', async () => {
    await expect(projectBurn('X', 'not_a_meter', { supabase: {} })).rejects.toThrow(/invalid meter/);
  });

  it('a NULL meter reading on one of the 2 rows is treated as insufficient, not a computed slope', async () => {
    const supabase = makeSupabase({
      N: [
        { id: 2, pasted_at: '2026-08-28T00:00:00Z', week_fable_pct: null, week_reset_at: null },
        { id: 1, pasted_at: '2026-08-24T00:00:00Z', week_fable_pct: 40, week_reset_at: null },
      ],
    });
    const result = await projectBurn('N', 'week_fable', { supabase });
    expect(result.verdict).toBe(VERDICTS.INSUFFICIENT_DATA);
  });
});
