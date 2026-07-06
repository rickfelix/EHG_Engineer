/**
 * Unit test for the QF-20260705-181 disposition-recording script. Mocked supabase — no live
 * DB writes; the actual leo_feature_flags row was already recorded via a one-time live run.
 * QF-20260705-181 deliberately does NOT flip PROD_ERROR_SWEEP_LOOP_ENABLE — the WIRE
 * completion flag (2026-06-21) explicitly recorded activation as a chairman/operator
 * decision, not code-decidable. This script records that disposition durably instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { main, FLAG_KEY, DISPOSITION_ROW } from '../../../scripts/one-off/qf-20260705-181-record-prod-error-sweep-activation-decision.mjs';

function createMockSupabase({ error = null } = {}) {
  const upsertCalls = [];
  const fromMock = vi.fn().mockImplementation(() => ({
    upsert: vi.fn().mockImplementation((row, opts) => {
      upsertCalls.push({ row, opts });
      return Promise.resolve({ data: error ? null : [row], error });
    }),
  }));
  return { from: fromMock, _upsertCalls: upsertCalls };
}

describe('QF-20260705-181: DISPOSITION_ROW', () => {
  it('records the flag as disabled, NOT flipped to enabled', () => {
    expect(DISPOSITION_ROW.flag_key).toBe(FLAG_KEY);
    expect(DISPOSITION_ROW.is_enabled).toBe(false);
    expect(DISPOSITION_ROW.lifecycle_state).toBe('disabled');
  });
  it('names the chairman as owner and states the trigger for reactivation', () => {
    expect(DISPOSITION_ROW.owner_type).toBe('team');
    expect(DISPOSITION_ROW.owner_id).toBe('chairman');
    expect(DISPOSITION_ROW.enablement_criteria).toMatch(/chairman\/operator sets PROD_ERROR_SWEEP_LOOP_ENABLE=true/);
  });
});

describe('QF-20260705-181: main() (mocked supabase)', () => {
  it('upserts the disposition row keyed on flag_key (idempotent)', async () => {
    const supabase = createMockSupabase();
    const result = await main(supabase);
    expect(result).toEqual({ flag_key: FLAG_KEY, recorded: true });
    expect(supabase._upsertCalls).toHaveLength(1);
    expect(supabase._upsertCalls[0].opts).toEqual({ onConflict: 'flag_key' });
    expect(supabase._upsertCalls[0].row.flag_key).toBe(FLAG_KEY);
  });

  it('throws on a DB error instead of silently swallowing it', async () => {
    const supabase = createMockSupabase({ error: { message: 'constraint violation' } });
    await expect(main(supabase)).rejects.toThrow('constraint violation');
  });
});
