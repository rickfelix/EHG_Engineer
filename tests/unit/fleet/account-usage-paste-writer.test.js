// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-1, FR-5) -- TS-3, TS-7, TS-12, AC-3.
import { describe, it, expect } from 'vitest';
import { recordUsagePaste, sanitizePromoNote } from '../../../lib/fleet/account-usage-paste-writer.cjs';

/** In-memory store keyed by id, matching the writer's exact
 *  .insert(row).select(...).single() then .select(...).eq('id',...).single() readback shape. */
function makeSupabase({ readbackOverride } = {}) {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    from(table) {
      expect(table).toBe('account_usage_pastes');
      return {
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  const stored = { id: nextId++, ...row };
                  rows.push(stored);
                  return { data: stored, error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(col, val) {
              expect(col).toBe('id');
              return {
                async single() {
                  if (readbackOverride) return readbackOverride;
                  const found = rows.find((r) => r.id === val);
                  return { data: found ? { id: found.id, account_uuid8: found.account_uuid8, pasted_at: found.pasted_at } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const IDENTITY_X = { email: 'x@example.com', orgName: 'Org X', accountUuid8: 'X-uuid8' };
const IDENTITY_Y = { email: 'y@example.com', orgName: 'Org Y', accountUuid8: 'Y-uuid8' };

describe('recordUsagePaste', () => {
  it('AC-3: refuses when the account identity cannot be resolved', async () => {
    const supabase = makeSupabase();
    const result = await recordUsagePaste({ sessionPct: 50 }, { supabase, identity: null });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('account_identity_unavailable');
  });

  it('requires a supabase client', async () => {
    const result = await recordUsagePaste({}, { identity: IDENTITY_X });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('supabase_client_required');
  });

  it('TS-3: two same-day pastes for two different accounts land on two distinct rows', async () => {
    const supabase = makeSupabase();
    const sameInstant = '2026-08-28T12:00:00Z';
    const r1 = await recordUsagePaste({ pastedAt: sameInstant, sessionPct: 10 }, { supabase, identity: IDENTITY_X });
    const r2 = await recordUsagePaste({ pastedAt: sameInstant, sessionPct: 20 }, { supabase, identity: IDENTITY_Y });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.row.id).not.toBe(r2.row.id);
    expect(supabase.rows.filter((r) => r.account_uuid8 === 'X-uuid8')).toHaveLength(1);
    expect(supabase.rows.filter((r) => r.account_uuid8 === 'Y-uuid8')).toHaveLength(1);
  });

  it('a second paste for the same account at a different instant is a second row, not an overwrite', async () => {
    const supabase = makeSupabase();
    await recordUsagePaste({ pastedAt: '2026-08-24T00:00:00Z', sessionPct: 10 }, { supabase, identity: IDENTITY_X });
    await recordUsagePaste({ pastedAt: '2026-08-28T00:00:00Z', sessionPct: 40 }, { supabase, identity: IDENTITY_X });
    expect(supabase.rows.filter((r) => r.account_uuid8 === 'X-uuid8')).toHaveLength(2);
  });

  it('an unread meter is stored as null, never coerced to 0', async () => {
    const supabase = makeSupabase();
    await recordUsagePaste({ pastedAt: '2026-08-28T00:00:00Z', sessionPct: undefined }, { supabase, identity: IDENTITY_X });
    expect(supabase.rows[0].session_pct).toBeNull();
  });

  it('TS-7: promo_note control/ANSI characters are stripped before storage', async () => {
    const supabase = makeSupabase();
    const dirty = 'Discount\x1b[31m code\n applies\x07';
    await recordUsagePaste({ pastedAt: '2026-08-28T00:00:00Z', promoNote: dirty }, { supabase, identity: IDENTITY_X });
    expect(supabase.rows[0].promo_note).toBe('Discount[31m code applies');
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x1F\x7F-\x9F]/.test(supabase.rows[0].promo_note)).toBe(false);
  });

  it('promo_note longer than 280 chars is clamped', () => {
    const long = 'a'.repeat(400);
    expect(sanitizePromoNote(long).length).toBe(280);
  });

  it('TS-12: a readback mismatch is reported as a write failure, not a silent success', async () => {
    const supabase = makeSupabase({ readbackOverride: { data: { id: 999, account_uuid8: 'WRONG', pasted_at: '2026-01-01T00:00:00Z' }, error: null } });
    const result = await recordUsagePaste({ pastedAt: '2026-08-28T00:00:00Z', sessionPct: 50 }, { supabase, identity: IDENTITY_X });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/readback_mismatch/);
  });
});
