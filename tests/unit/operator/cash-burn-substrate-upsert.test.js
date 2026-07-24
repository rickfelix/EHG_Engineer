/**
 * upsertSubstrateInputs() DB-write tests (SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-B).
 *
 * The rest of cash-burn-substrate.test.js is pure-function-only (no DB); this focused suite
 * exercises the one DB-touching function's manual_revenue_usd fail-soft path with a hand-rolled
 * Supabase upsert mock, per this repo's DB-test-guard convention.
 */
import { describe, it, expect, vi } from 'vitest';
import { upsertSubstrateInputs } from '../../../lib/operator/cash-burn-substrate.js';

function makeSupabase({ firstUpsertError = null, retryUpsertError = null } = {}) {
  const calls = [];
  let call = 0;
  return {
    calls,
    from: (table) => ({
      upsert: (row) => {
        call++;
        calls.push(row);
        const error = call === 1 ? firstUpsertError : retryUpsertError;
        return {
          select: () => ({
            single: async () => (error ? { data: null, error } : { data: { ...row, id: 'row-1' }, error: null }),
          }),
        };
      },
    }),
  };
}

const PGRST204_MISSING_MANUAL_REVENUE = { code: 'PGRST204', message: "Could not find the 'manual_revenue_usd' column of 'operator_cash_burn_monthly' in the schema cache" };

describe('upsertSubstrateInputs — manual_revenue_usd fail-soft (staged migration not yet applied)', () => {
  it('retries WITHOUT manual_revenue fields on a schema-cache column-not-found error, and the already-live fields still write', async () => {
    const supabase = makeSupabase({ firstUpsertError: PGRST204_MISSING_MANUAL_REVENUE });
    const data = await upsertSubstrateInputs(
      '2026-07-01',
      { revenue_usd: 700, revenue_livemode: true, manual_revenue_usd: 200 },
      supabase,
      '2026-07-24T12:00:00.000Z'
    );
    expect(supabase.calls).toHaveLength(2);
    expect(supabase.calls[0]).toMatchObject({ revenue_usd: 700, manual_revenue_usd: 200 });
    // retry omits the not-yet-existent columns entirely, but keeps the already-live write intact
    expect(supabase.calls[1]).not.toHaveProperty('manual_revenue_usd');
    expect(supabase.calls[1]).not.toHaveProperty('manual_revenue_last_synced_at');
    expect(supabase.calls[1]).toMatchObject({ revenue_usd: 700, revenue_livemode: true });
    expect(data).toMatchObject({ revenue_usd: 700 });
  });

  it('does not retry (and does not lose the write) once the migration is applied and the column exists', async () => {
    const supabase = makeSupabase(); // no error on first attempt
    const data = await upsertSubstrateInputs(
      '2026-07-01',
      { revenue_usd: 700, manual_revenue_usd: 200 },
      supabase,
      '2026-07-24T12:00:00.000Z'
    );
    expect(supabase.calls).toHaveLength(1);
    expect(data).toMatchObject({ revenue_usd: 700, manual_revenue_usd: 200 });
  });

  it('still throws on a genuine, unrelated upsert error (does not silently swallow real failures)', async () => {
    const supabase = makeSupabase({ firstUpsertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    await expect(
      upsertSubstrateInputs('2026-07-01', { revenue_usd: 700, manual_revenue_usd: 200 }, supabase, '2026-07-24T12:00:00.000Z')
    ).rejects.toThrow(/duplicate key/);
    expect(supabase.calls).toHaveLength(1); // no retry attempted for a non-schema-cache error
  });

  it('still throws if the retry itself also fails', async () => {
    const supabase = makeSupabase({
      firstUpsertError: PGRST204_MISSING_MANUAL_REVENUE,
      retryUpsertError: { code: 'PGRST000', message: 'connection refused' },
    });
    await expect(
      upsertSubstrateInputs('2026-07-01', { revenue_usd: 700, manual_revenue_usd: 200 }, supabase, '2026-07-24T12:00:00.000Z')
    ).rejects.toThrow(/connection refused/);
    expect(supabase.calls).toHaveLength(2);
  });

  it('does not attempt a retry when manual_revenue_usd was never in fields (unrelated PGRST204)', async () => {
    const supabase = makeSupabase({ firstUpsertError: { code: 'PGRST204', message: "Could not find the 'cash_usd' column" } });
    await expect(
      upsertSubstrateInputs('2026-07-01', { revenue_usd: 700 }, supabase, '2026-07-24T12:00:00.000Z')
    ).rejects.toThrow(/cash_usd/);
    expect(supabase.calls).toHaveLength(1);
  });
});
