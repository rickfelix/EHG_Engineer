// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-3) -- TS-8 (structural no-op on no-risk) + CLI report shapes.
import { describe, it, expect } from 'vitest';
import { composeCapacityAdvisoryLine, composeCapacityCliReport } from '../../../lib/fleet/exec-email-capacity-line.mjs';

function makeSupabase(rows) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return { limit: async () => ({ data: rows, error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('composeCapacityAdvisoryLine', () => {
  it('TS-8: returns null (renders nothing) when there is no active exhaustion-before-reset risk', async () => {
    const supabase = makeSupabase([
      { id: 2, pasted_at: '2026-08-28T00:00:00Z', session_pct: 20, session_reset_at: '2026-09-05T00:00:00Z' },
      { id: 1, pasted_at: '2026-08-27T00:00:00Z', session_pct: 18, session_reset_at: '2026-09-05T00:00:00Z' },
    ]);
    const result = await composeCapacityAdvisoryLine('acct-1', 'session', { supabase });
    expect(result).toBeNull();
  });

  it('returns null (not an "unavailable" string) with insufficient data -- a distinct absence from an active risk', async () => {
    const supabase = makeSupabase([{ id: 1, pasted_at: '2026-08-28T00:00:00Z', session_pct: 20 }]);
    const result = await composeCapacityAdvisoryLine('acct-1', 'session', { supabase });
    expect(result).toBeNull();
  });

  it('renders a line citing both source row ids on an active exhaustion-before-reset risk', async () => {
    const supabase = makeSupabase([
      { id: 20, pasted_at: '2026-08-28T00:00:00Z', session_pct: 95, session_reset_at: '2026-08-29T00:00:00Z' },
      { id: 10, pasted_at: '2026-08-27T00:00:00Z', session_pct: 60, session_reset_at: '2026-08-29T00:00:00Z' },
    ]);
    const result = await composeCapacityAdvisoryLine('acct-1', 'session', { supabase });
    expect(result).not.toBeNull();
    expect(result.rowIds).toEqual([10, 20]);
    expect(result.line).toMatch(/ref usage_projection:10,20/);
  });

  it('renders "(unavailable this run)" distinctly on a query error, never null', async () => {
    const supabase = { from() { return { select() { return { eq() { return { order() { return { limit: async () => ({ data: null, error: { message: 'boom' } }) }; } }; } }; } }; } };
    const result = await composeCapacityAdvisoryLine('acct-1', 'session', { supabase });
    expect(result).not.toBeNull();
    expect(result.line).toMatch(/unavailable this run/);
  });

  it('returns null when no supabase client is provided (fail-soft)', async () => {
    const result = await composeCapacityAdvisoryLine('acct-1', 'session', {});
    expect(result).toBeNull();
  });
});

describe('composeCapacityCliReport', () => {
  it('prints an explicit insufficient-data line, never a fabricated slope', async () => {
    const supabase = makeSupabase([{ id: 1, pasted_at: '2026-08-28T00:00:00Z', session_pct: 20 }]);
    const report = await composeCapacityCliReport('acct-1', 'session', { supabase });
    expect(report).toMatch(/INSUFFICIENT DATA/);
    expect(report).not.toMatch(/%\/day/);
  });

  it('prints a confident block with slope, ETA, and reset comparison', async () => {
    const supabase = makeSupabase([
      { id: 2, pasted_at: '2026-08-28T00:00:00Z', session_pct: 95, session_reset_at: '2026-08-29T00:00:00Z' },
      { id: 1, pasted_at: '2026-08-27T00:00:00Z', session_pct: 60, session_reset_at: '2026-08-29T00:00:00Z' },
    ]);
    const report = await composeCapacityCliReport('acct-1', 'session', { supabase });
    expect(report).toMatch(/%\/day/);
    expect(report).toMatch(/EXHAUSTS/);
    expect(report).toMatch(/Rows: 1,2/);
  });
});
