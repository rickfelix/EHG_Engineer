// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-4) -- TS-4, TS-5, TS-9, TS-10, AC-5, AC-6.
//
// insertCoordinationRow/getActiveAdamId are injected via opts (CLAUDE_EXEC.md
// testability-aware-implementation) rather than module-mocked: the real dispatch.cjs
// insertCoordinationRow performs many additional live-DB guard queries (assertValidTarget,
// assertFleetAssignmentTarget, etc.) unrelated to this module's own idempotency logic.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeEmitExhaustionAdvisory } from '../../../lib/fleet/account-usage-exhaustion-advisory.cjs';
import { VERDICTS } from '../../../lib/fleet/account-usage-burn-projection.cjs';

const insertCoordinationRow = vi.fn(async () => ({ id: 'row-1' }));
const getActiveAdamId = vi.fn(async () => 'adam-session-1');

/** Seeds a fixed pair of rows and lets the test control the coordination-row idempotency SELECT
 *  result independently of the projection data. */
function makeSupabase({ ledgerRows, existingCoordinationRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'account_usage_pastes') {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return { limit: async () => ({ data: ledgerRows, error: null }) };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'session_coordination') {
        return {
          select() {
            const chain = {
              filters: {},
              eq(col, val) {
                chain.filters[col] = val;
                return chain;
              },
              async limit() {
                const match = existingCoordinationRows.find((r) =>
                  Object.entries(chain.filters).every(([k, v]) => r[k] === v));
                return { data: match ? [match] : [], error: null };
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const EXHAUSTING_ROWS = [
  { id: 2, pasted_at: '2026-08-28T00:00:00Z', week_all_models_pct: 95, week_reset_at: '2026-08-29T00:00:00Z' },
  { id: 1, pasted_at: '2026-08-27T00:00:00Z', week_all_models_pct: 60, week_reset_at: '2026-08-29T00:00:00Z' },
];

const NO_RISK_ROWS = [
  { id: 4, pasted_at: '2026-08-28T00:00:00Z', week_all_models_pct: 20, week_reset_at: '2026-09-05T00:00:00Z' },
  { id: 3, pasted_at: '2026-08-27T00:00:00Z', week_all_models_pct: 18, week_reset_at: '2026-09-05T00:00:00Z' },
];

describe('maybeEmitExhaustionAdvisory', () => {
  beforeEach(() => {
    insertCoordinationRow.mockClear();
    getActiveAdamId.mockClear();
  });

  it('TS-10: a non-exhaustion verdict never inserts an advisory row', async () => {
    const supabase = makeSupabase({ ledgerRows: NO_RISK_ROWS });
    const result = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(result.emitted).toBe(false);
    expect(result.verdict).not.toBe(VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET);
    expect(insertCoordinationRow).not.toHaveBeenCalled();
  });

  it('emits exactly one row on a genuine exhaustion-before-reset verdict', async () => {
    const supabase = makeSupabase({ ledgerRows: EXHAUSTING_ROWS });
    const result = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(result.emitted).toBe(true);
    expect(insertCoordinationRow).toHaveBeenCalledTimes(1);
    const [, row] = insertCoordinationRow.mock.calls[0];
    expect(row.target_session).toBe('adam-session-1');
    expect(row.payload.kind).toBe('adam_action_required');
    expect(row.payload.action_required).toBe(true);
    expect(row.payload.account_uuid8).toBe('acct-1');
    expect(row.payload.meter).toBe('week_all_models');
  });

  it('TS-4: calling twice for the same account/meter/reset_at inserts exactly one row', async () => {
    const resetEpoch = String(new Date('2026-08-29T00:00:00Z').getTime());
    const existing = [{ 'payload->>kind': 'adam_action_required', 'payload->>action_kind': 'usage_exhaustion_projection', 'payload->>account_uuid8': 'acct-1', 'payload->>meter': 'week_all_models', 'payload->>reset_at_epoch': resetEpoch }];
    const supabase = makeSupabase({ ledgerRows: EXHAUSTING_ROWS, existingCoordinationRows: existing });
    const result = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(result.emitted).toBe(false);
    expect(result.reason).toBe('already_recorded_for_epoch');
    expect(insertCoordinationRow).not.toHaveBeenCalled();
  });

  it('AC-5: matches on tuple existence regardless of ack state (no actioned_at filter)', async () => {
    // The existing row shape here deliberately carries no actioned_at info at all -- the
    // idempotency check must match purely on (account_uuid8, meter, reset_at_epoch).
    const resetEpoch = String(new Date('2026-08-29T00:00:00Z').getTime());
    const existing = [{ 'payload->>kind': 'adam_action_required', 'payload->>action_kind': 'usage_exhaustion_projection', 'payload->>account_uuid8': 'acct-1', 'payload->>meter': 'week_all_models', 'payload->>reset_at_epoch': resetEpoch }];
    const supabase = makeSupabase({ ledgerRows: EXHAUSTING_ROWS, existingCoordinationRows: existing });
    const result = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(result.emitted).toBe(false);
  });

  it('TS-5: a new, later reset_at re-arms the advisory', async () => {
    const oldEpoch = String(new Date('2026-08-29T00:00:00Z').getTime());
    const existing = [{ 'payload->>kind': 'adam_action_required', 'payload->>action_kind': 'usage_exhaustion_projection', 'payload->>account_uuid8': 'acct-1', 'payload->>meter': 'week_all_models', 'payload->>reset_at_epoch': oldEpoch }];
    const advancedRows = [
      { id: 6, pasted_at: '2026-09-02T00:00:00Z', week_all_models_pct: 95, week_reset_at: '2026-09-03T00:00:00Z' },
      { id: 5, pasted_at: '2026-09-01T00:00:00Z', week_all_models_pct: 60, week_reset_at: '2026-09-03T00:00:00Z' },
    ];
    const supabase = makeSupabase({ ledgerRows: advancedRows, existingCoordinationRows: existing });
    const result = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(result.emitted).toBe(true);
    expect(insertCoordinationRow).toHaveBeenCalledTimes(1);
  });

  it('TS-9: two different meters at the same reset_at each get their own advisory row', async () => {
    const rows = [
      { id: 8, pasted_at: '2026-08-28T00:00:00Z', week_all_models_pct: 95, week_fable_pct: 96, week_reset_at: '2026-08-29T00:00:00Z' },
      { id: 7, pasted_at: '2026-08-27T00:00:00Z', week_all_models_pct: 60, week_fable_pct: 61, week_reset_at: '2026-08-29T00:00:00Z' },
    ];
    const supabase = makeSupabase({ ledgerRows: rows });
    const r1 = await maybeEmitExhaustionAdvisory('acct-1', 'week_all_models', { supabase, insertCoordinationRow, getActiveAdamId });
    const r2 = await maybeEmitExhaustionAdvisory('acct-1', 'week_fable', { supabase, insertCoordinationRow, getActiveAdamId });
    expect(r1.emitted).toBe(true);
    expect(r2.emitted).toBe(true);
    expect(insertCoordinationRow).toHaveBeenCalledTimes(2);
    const meters = insertCoordinationRow.mock.calls.map(([, row]) => row.payload.meter);
    expect(meters.sort()).toEqual(['week_all_models', 'week_fable']);
  });
});
