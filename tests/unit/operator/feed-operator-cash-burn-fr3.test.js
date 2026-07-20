/**
 * FR-3 revenue-mirror rewire tests for scripts/operator/feed-operator-cash-burn.mjs
 * SD-EHG-PRODUCT-UIUX-REMEDIATION-001-D (FR-5/H10, spec refresh 2026-07-10).
 *
 * The existing operator tests (parse-cash-flag.test.js, cash-burn-substrate.test.js)
 * are pure-function suites and never drive main(). No established main()-level
 * Supabase mock exists, so this focused suite builds the minimal graph mock needed
 * to exercise ONLY the FR-3 branch:
 *
 *   attribution live (ops_payment_events has any row)  → computeAttributedRevenue
 *      drives revenue_usd, revenue_livemode:true, source:'attribution_resolver'
 *      — even when THIS period has zero matching rows (a genuine live $0).
 *   attribution never wired (count 0)                  → fall back to the old
 *      income_capture_monthly mirror, source:'income_capture_monthly'.
 *
 * The other steps are neutralized (not tested): FR-cash goes inert (bank/teller
 * mocks return null, no --cash flag), FR-2's cost-report spawnSync is stubbed to
 * fail-soft (returns null), FR-5's ledger query returns []. computeAttributedRevenue
 * and periodMonthOf run for real so the assertions are meaningful.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted shared state: per-test Supabase responses + spies, referenced from the
// (hoisted) vi.mock factories below.
const H = vi.hoisted(() => ({
  state: { responses: {}, tablesQueried: [] },
  upsertSpy: vi.fn(async () => {}),
  spawnSyncMock: vi.fn(() => ({ status: 1, stdout: '', signal: null })),
}));

// --- Supabase service client: a table-routed, chainable, thenable query builder ---
vi.mock('../../../lib/supabase-client.js', () => {
  function tableBuilder(table) {
    const st = { opts: undefined };
    const resolveResult = () => {
      const r = H.state.responses[table] || {};
      // head-count query (select('id', { count:'exact', head:true }))
      if (st.opts && (st.opts.head || st.opts.count)) {
        return { count: r.count ?? 0, error: r.countError ?? null, data: null };
      }
      return { data: r.data ?? [], error: r.error ?? null, count: r.count ?? null };
    };
    const builder = {
      select: (_cols, opts) => { st.opts = opts; return builder; },
      eq: () => builder,
      gte: () => builder,
      lt: () => builder,
      or: () => builder,
      limit: () => builder,
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: fetchAllPaginated
      // chains .order() then calls .range() directly (not via .then()) — a single
      // page shorter than pageSize ends the paginate loop.
      order: () => builder,
      range: () => Promise.resolve(resolveResult()),
      then: (res, rej) => Promise.resolve().then(resolveResult).then(res, rej),
    };
    return builder;
  }
  return {
    createSupabaseServiceClient: () => ({
      from: (table) => {
        H.state.tablesQueried.push(table);
        return tableBuilder(table);
      },
    }),
  };
});

// --- Substrate lib: keep periodMonthOf/labels real, spy the write ---
vi.mock('../../../lib/operator/cash-burn-substrate.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, upsertSubstrateInputs: H.upsertSpy };
});

// --- Cash sources: keep FR-cash inert (no network/credentials) ---
vi.mock('../../../lib/operator/cash-sources/bank-read-service.js', () => ({
  readBankCashSlice: async () => null,
}));
vi.mock('../../../lib/operator/cash-sources/stripe-balance.js', () => ({
  readStripeCashSlice: async () => null,
}));
vi.mock('../../../lib/operator/cash-sources/token-vault.js', () => ({
  loadTellerCertPair: async () => ({ certPem: null, keyPem: null }),
}));
vi.mock('../../../lib/operator/cash-sources/teller-client.js', () => ({
  createTellerClient: () => ({}),
}));

// --- FR-2 cost report: fail-soft (spawnSync returns non-zero → ai_burn stays stale) ---
vi.mock('node:child_process', () => ({ spawnSync: H.spawnSyncMock }));

// computeAttributedRevenue + periodMonthOf are intentionally NOT mocked (real).
import { main } from '../../../scripts/operator/feed-operator-cash-burn.mjs';

function upsertCallWith(key) {
  return H.upsertSpy.mock.calls.find((c) => c[1] && key in c[1]);
}

describe('feed-operator-cash-burn FR-3 revenue-mirror rewire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.responses = {};
    H.state.tablesQueried = [];
    // FR-5 backfill: empty ledger so that step is a no-op.
    H.state.responses.venture_token_ledger = { data: [] };
  });

  it('(a) attribution live: computeAttributedRevenue drives revenue_usd, livemode:true, source:attribution_resolver', async () => {
    H.state.responses.ops_payment_events = {
      count: 2, // any row fleet-wide → attribution is live
      data: [
        {
          event_type: 'charge.succeeded',
          amount_cents: 12300,
          currency: 'usd',
          payment_intent_id: 'pi_1',
          stripe_charge_id: 'ch_1',
          id: 'e1',
        },
      ],
    };

    const result = await main();

    expect(result.revenue).toMatchObject({
      written: true,
      value_usd: 123, // 12300 cents / 100, via the real computeAttributedRevenue
      livemode: true,
      source: 'attribution_resolver',
    });
    const call = upsertCallWith('revenue_usd');
    expect(call).toBeTruthy();
    expect(call[1]).toMatchObject({ revenue_usd: 123, revenue_livemode: true });
    // fallback source must NOT have been consulted
    expect(H.state.tablesQueried).not.toContain('income_capture_monthly');
  });

  it('(b) attribution live but ZERO rows this period: genuine live $0, NOT a fallback', async () => {
    H.state.responses.ops_payment_events = {
      count: 1, // attribution wired fleet-wide...
      data: [], // ...but no events in the current period
    };

    const result = await main();

    expect(result.revenue).toMatchObject({
      written: true,
      value_usd: 0,
      livemode: true,
      source: 'attribution_resolver',
    });
    const call = upsertCallWith('revenue_usd');
    expect(call[1]).toMatchObject({ revenue_usd: 0, revenue_livemode: true });
    // must NOT fall back to income_capture_monthly on a live $0 reading
    expect(H.state.tablesQueried).not.toContain('income_capture_monthly');
  });

  it('(c) attribution never wired (count 0): falls back to income_capture_monthly (live row)', async () => {
    H.state.responses.ops_payment_events = { count: 0 };
    H.state.responses.income_capture_monthly = {
      data: [{ recurring_revenue: 4500, livemode: true }],
    };

    const result = await main();

    expect(result.revenue).toMatchObject({
      written: true,
      value_usd: 4500,
      livemode: true,
      source: 'income_capture_monthly',
    });
    const call = upsertCallWith('revenue_usd');
    expect(call[1]).toMatchObject({ revenue_usd: 4500, revenue_livemode: true });
    expect(H.state.tablesQueried).toContain('income_capture_monthly');
  });

  it('(c2) fallback surfaces test-mode livemode honestly (income row livemode:false)', async () => {
    H.state.responses.ops_payment_events = { count: 0 };
    H.state.responses.income_capture_monthly = {
      data: [{ recurring_revenue: 200, livemode: false }],
    };

    const result = await main();

    expect(result.revenue).toMatchObject({
      value_usd: 200,
      livemode: false,
      source: 'income_capture_monthly',
    });
    const call = upsertCallWith('revenue_usd');
    expect(call[1]).toMatchObject({ revenue_usd: 200, revenue_livemode: false });
  });
});
