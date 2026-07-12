/**
 * Unit tests for the venture-scoped operating-burn substrate
 * (SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1).
 */
import { describe, it, expect } from 'vitest';
import { periodMonthOf, readBurnRow, upsertBurnInputs } from '../../../lib/operator/venture-burn-substrate.js';

describe('periodMonthOf', () => {
  it('returns the first-of-month YYYY-MM-01 for the given instant', () => {
    expect(periodMonthOf(Date.parse('2026-07-12T09:00:00Z'))).toBe('2026-07-01');
    expect(periodMonthOf(Date.parse('2026-01-31T23:59:00Z'))).toBe('2026-01-01');
  });
});

function fakeSupabase({ selectResult = { data: null, error: null }, upsertResult = { data: { id: 'row-1' }, error: null } } = {}) {
  const calls = { from: [], eq: [], upsert: [] };
  return {
    calls,
    from: (table) => {
      calls.from.push(table);
      const builder = {
        select: () => builder,
        eq: (col, val) => { calls.eq.push([col, val]); return builder; },
        maybeSingle: async () => selectResult,
        upsert: (row, opts) => { calls.upsert.push({ row, opts }); return builder; },
        single: async () => upsertResult,
      };
      return builder;
    },
  };
}

describe('readBurnRow', () => {
  it('queries by venture_id + source_application + period_month', async () => {
    const sb = fakeSupabase({ selectResult: { data: { infra_cost_usd: 1.23 }, error: null } });
    const row = await readBurnRow('venture-1', 'apex_niche_ai', '2026-07-01', sb);
    expect(sb.calls.from).toEqual(['venture_operating_burn']);
    expect(sb.calls.eq).toEqual([
      ['venture_id', 'venture-1'],
      ['source_application', 'apex_niche_ai'],
      ['period_month', '2026-07-01'],
    ]);
    expect(row).toEqual({ infra_cost_usd: 1.23 });
  });

  it('returns null when no row exists (never fabricates a value)', async () => {
    const sb = fakeSupabase({ selectResult: { data: null, error: null } });
    const row = await readBurnRow('venture-1', 'apex_niche_ai', '2026-07-01', sb);
    expect(row).toBeNull();
  });

  it('throws on a genuine DB error (not swallowed silently)', async () => {
    const sb = fakeSupabase({ selectResult: { data: null, error: { message: 'boom' } } });
    await expect(readBurnRow('venture-1', 'apex_niche_ai', '2026-07-01', sb)).rejects.toThrow('boom');
  });
});

describe('upsertBurnInputs', () => {
  it('requires ventureId and sourceApplication', async () => {
    const sb = fakeSupabase();
    await expect(upsertBurnInputs(null, 'apex_niche_ai', '2026-07-01', {}, sb)).rejects.toThrow('ventureId');
    await expect(upsertBurnInputs('venture-1', null, '2026-07-01', {}, sb)).rejects.toThrow('sourceApplication');
  });

  it('only writes the fields provided, stamping the matching *_last_synced_at', async () => {
    const sb = fakeSupabase();
    const nowIso = '2026-07-12T12:00:00.000Z';
    await upsertBurnInputs('venture-1', 'apex_niche_ai', '2026-07-01', { infra_cost_usd: 5.5 }, sb, nowIso);
    const [{ row }] = sb.calls.upsert;
    expect(row.infra_cost_usd).toBe(5.5);
    expect(row.infra_cost_last_synced_at).toBe(nowIso);
    expect(row.ai_cost_usd).toBeUndefined();
    expect(row.ai_cost_status).toBeUndefined();
  });

  it('defaults ai_cost_status to measured when ai_cost_usd is written without an explicit status', async () => {
    const sb = fakeSupabase();
    await upsertBurnInputs('venture-1', 'apex_niche_ai', '2026-07-01', { ai_cost_usd: 2 }, sb, '2026-07-12T12:00:00.000Z');
    const [{ row }] = sb.calls.upsert;
    expect(row.ai_cost_status).toBe('measured');
  });

  it('conflicts on the composite (venture_id, source_application, period_month) key', async () => {
    const sb = fakeSupabase();
    await upsertBurnInputs('venture-1', 'apex_niche_ai', '2026-07-01', { infra_cost_usd: 1 }, sb, '2026-07-12T12:00:00.000Z');
    const [{ opts }] = sb.calls.upsert;
    expect(opts.onConflict).toBe('venture_id,source_application,period_month');
  });
});
