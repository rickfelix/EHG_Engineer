// SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 (FR-5): unit tests for the per-venture exec-email
// actuals line (cost from venture_token_ledger + health from ops_product_health).
import { describe, it, expect } from 'vitest';
import { formatVentureActualsLine, computeOpsActualsLines } from './exec-email-ops-actuals.mjs';

describe('formatVentureActualsLine (pure formatter)', () => {
  it('formats cost + uptime when both are present', () => {
    const line = formatVentureActualsLine({ name: 'MarketLens' }, { costUsd: 12.5, uptimePct: 99.4, hasHealthRow: true });
    expect(line).toBe('MarketLens: $12.50 cost (30d) · 99.4% uptime');
  });

  it('shows $0.00 cost when no ledger rows exist yet', () => {
    const line = formatVentureActualsLine({ name: 'MarketLens' }, { costUsd: 0, uptimePct: null, hasHealthRow: false });
    expect(line).toContain('$0.00 cost (30d)');
  });

  it('shows "no data yet" for health when no ops_product_health row exists (not a fabricated 0%)', () => {
    const line = formatVentureActualsLine({ name: 'MarketLens' }, { costUsd: 5, uptimePct: null, hasHealthRow: false });
    expect(line).toContain('health: no data yet');
    expect(line).not.toContain('0.0% uptime');
  });

  it('falls back to a placeholder name when venture is missing a name', () => {
    const line = formatVentureActualsLine({}, { costUsd: 0, uptimePct: null, hasHealthRow: false });
    expect(line).toContain('Unknown venture');
  });
});

/** Minimal fake supabase for computeOpsActualsLines. */
function makeSupabase({ ventures = [], ledgerByVenture = {}, healthByVenture = {} } = {}) {
  return {
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; }, not() { return this; }, neq() { return this; },
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
      }
      if (table === 'venture_token_ledger') {
        const ctx = {};
        return {
          select() { return this; },
          eq(col, val) { ctx.venture_id = val; return this; },
          gte() { return this; },
          order() { return this; }, // fetchAllPaginated tiebreaker (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6)
          then: (resolve) => resolve({ data: ledgerByVenture[ctx.venture_id] || [], error: null }),
          range() { return Promise.resolve({ data: ledgerByVenture[ctx.venture_id] || [], error: null }); },
        };
      }
      if (table === 'ops_product_health') {
        const ctx = {};
        return {
          select() { return this; },
          eq(col, val) { if (col === 'venture_id') ctx.venture_id = val; return this; },
          maybeSingle: async () => ({ data: healthByVenture[ctx.venture_id] || null, error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('computeOpsActualsLines', () => {
  it('returns one line per live-deployment venture, summing ledger cost and reading today\'s health', async () => {
    const ventures = [{ id: 'v1', name: 'MarketLens', deployment_url: 'https://x' }];
    const ledgerByVenture = { v1: [{ cost_usd: 1.5 }, { cost_usd: 2.25 }] };
    const healthByVenture = { v1: { uptime_pct: 99.9 } };

    const lines = await computeOpsActualsLines({ supabase: makeSupabase({ ventures, ledgerByVenture, healthByVenture }) });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('MarketLens: $3.75 cost (30d) · 99.9% uptime');
  });

  it('returns an empty array (fail-soft) when there are no live-deployment ventures', async () => {
    const lines = await computeOpsActualsLines({ supabase: makeSupabase({ ventures: [] }) });
    expect(lines).toEqual([]);
  });

  it('never throws when supabase is missing (fail-soft)', async () => {
    await expect(computeOpsActualsLines({})).resolves.toEqual([]);
  });

  it('degrades a single venture to $0/no-data on a per-table query error without dropping other ventures', async () => {
    const ventures = [
      { id: 'v1', name: 'MarketLens', deployment_url: 'https://x' },
      { id: 'v2', name: 'CronGenius', deployment_url: 'https://y' },
    ];
    const supabase = makeSupabase({ ventures, ledgerByVenture: { v2: [{ cost_usd: 4 }] }, healthByVenture: { v2: { uptime_pct: 80 } } });
    const lines = await computeOpsActualsLines({ supabase });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('$0.00 cost');
    expect(lines[1]).toContain('$4.00 cost');
  });
});
