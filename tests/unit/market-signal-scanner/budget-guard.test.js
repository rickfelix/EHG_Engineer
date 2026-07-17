/**
 * Tests for the market-signal-scanner FinOps budget guard (FR-5).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * Uses an in-memory fake Supabase client (no live DB) that mimics the
 * subset of the supabase-js query builder budget-guard.js relies on:
 * .from(table).select('*').eq('month_key', k).maybeSingle()
 * .from(table).insert(row).select('*').single()
 * .from(table).update(patch).eq('month_key', k).select('spent_usd').single()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkBudget, recordSpend, DEFAULT_CAP_USD } from '../../../lib/market-signal-scanner/budget-guard.js';

function makeFakeSupabase() {
  /** @type {Map<string, { month_key: string, spent_usd: number, cap_usd: number, updated_at: string }>} */
  const rowsByMonth = new Map();

  function from(table) {
    expect(table).toBe('market_signal_scanner_budget');

    return {
      select() {
        return {
          eq(_col, monthKey) {
            return {
              async maybeSingle() {
                const row = rowsByMonth.get(monthKey);
                return { data: row ? { ...row } : null, error: null };
              },
            };
          },
        };
      },
      insert(row) {
        return {
          select() {
            return {
              async single() {
                if (rowsByMonth.has(row.month_key)) {
                  return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
                }
                const stored = {
                  month_key: row.month_key,
                  spent_usd: row.spent_usd ?? 0,
                  cap_usd: row.cap_usd ?? DEFAULT_CAP_USD,
                  updated_at: new Date().toISOString(),
                };
                rowsByMonth.set(row.month_key, stored);
                return { data: { ...stored }, error: null };
              },
            };
          },
        };
      },
      update(patch) {
        return {
          eq(_col, monthKey) {
            return {
              select() {
                return {
                  async single() {
                    const existing = rowsByMonth.get(monthKey);
                    if (!existing) {
                      return { data: null, error: { message: 'no row to update' } };
                    }
                    const updated = { ...existing, ...patch };
                    rowsByMonth.set(monthKey, updated);
                    return { data: { spent_usd: updated.spent_usd }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  return { from, __rows: rowsByMonth };
}

describe('market-signal-scanner budget-guard', () => {
  let supabase;

  beforeEach(() => {
    supabase = makeFakeSupabase();
  });

  it('(a) checkBudget under the cap returns allowed:true, auto-provisioning a default-cap row on first use', async () => {
    const result = await checkBudget({ supabase, monthKey: '2026-07' });

    expect(result.allowed).toBe(true);
    expect(result.spentUsd).toBe(0);
    expect(result.capUsd).toBe(DEFAULT_CAP_USD);
    expect(result.reason).toBeNull();

    // Row should now exist for future calls in the same month.
    expect(supabase.__rows.has('2026-07')).toBe(true);
  });

  it('(b) checkBudget at/over the cap returns allowed:false with a reason', async () => {
    // Spend right up to the cap.
    await recordSpend({ supabase, monthKey: '2026-08', amountUsd: DEFAULT_CAP_USD });

    const atCap = await checkBudget({ supabase, monthKey: '2026-08' });
    expect(atCap.allowed).toBe(false);
    expect(atCap.spentUsd).toBe(DEFAULT_CAP_USD);
    expect(atCap.capUsd).toBe(DEFAULT_CAP_USD);
    expect(atCap.reason).toMatch(/Monthly FinOps cap exceeded/);
    expect(atCap.reason).toMatch(/2026-08/);

    // And spending further over the cap stays blocked.
    await recordSpend({ supabase, monthKey: '2026-08', amountUsd: 5 });
    const overCap = await checkBudget({ supabase, monthKey: '2026-08' });
    expect(overCap.allowed).toBe(false);
    expect(overCap.spentUsd).toBe(DEFAULT_CAP_USD + 5);
  });

  it('(c) recordSpend correctly accumulates across multiple calls in the same month', async () => {
    const first = await recordSpend({ supabase, monthKey: '2026-09', amountUsd: 3.5 });
    expect(first).toBe(3.5);

    const second = await recordSpend({ supabase, monthKey: '2026-09', amountUsd: 4.25 });
    expect(second).toBe(7.75);

    const third = await recordSpend({ supabase, monthKey: '2026-09', amountUsd: 0.25 });
    expect(third).toBe(8);

    // A different month is unaffected (no cross-month bleed).
    const otherMonth = await checkBudget({ supabase, monthKey: '2026-10' });
    expect(otherMonth.spentUsd).toBe(0);

    const summaryCheck = await checkBudget({ supabase, monthKey: '2026-09' });
    expect(summaryCheck.spentUsd).toBe(8);
    expect(summaryCheck.allowed).toBe(true);
  });

  it('throws a clear error when required params are missing', async () => {
    await expect(checkBudget({ supabase, monthKey: undefined })).rejects.toThrow(/monthKey/);
    await expect(recordSpend({ supabase: undefined, monthKey: '2026-07', amountUsd: 1 })).rejects.toThrow(/supabase/);
    await expect(recordSpend({ supabase, monthKey: '2026-07', amountUsd: -5 })).rejects.toThrow(/amountUsd/);
  });
});
