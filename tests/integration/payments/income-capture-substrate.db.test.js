/**
 * SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — FR-5 end-to-end proof (DB integration).
 * A TEST-mode charge (livemode=false) flows rail -> ops_payment_events -> aggregator -> income_capture_monthly
 * -> replacementNet(). Shared-prod sandbox: a unique sentinel month + unique stripe_event_id, cleaned up in
 * afterAll; self-skips when there is no real DB OR the migration is not yet applied (table missing).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { HAS_REAL_DB, describeDb } from '../../helpers/db-available.js';
import { aggregateIncomeCapture } from '../../../lib/income/income-capture-aggregator.js';
import { replacementNetFromCapture } from '../../../lib/income/replacement-net-source.js';

const require = createRequire(import.meta.url);

// Sentinel month chosen far outside any real charge data so the livemode=false aggregate is isolated.
const SENTINEL_MONTH = '2099-01-01';
const SENTINEL_EVENT_TS = '2099-01-15T12:00:00Z';
const MARKER = `evt_test_replnet_${HAS_REAL_DB ? Date.now() : 'skip'}`;

describeDb('income_capture_monthly end-to-end (FR-5)', () => {
  let sb;
  let tableReady = false;

  beforeAll(async () => {
    const { createSupabaseServiceClient } = require('../../../lib/supabase-client.cjs');
    sb = createSupabaseServiceClient();
    const { error } = await sb.from('income_capture_monthly').select('id').limit(1);
    tableReady = !(error && error.code === 'PGRST205'); // table not yet migrated -> tests self-skip
  });

  afterAll(async () => {
    if (!sb) return;
    await sb.from('income_capture_monthly').delete().eq('period_month', SENTINEL_MONTH).eq('livemode', false);
    await sb.from('ops_payment_events').delete().eq('stripe_event_id', MARKER);
  });

  it('aggregates a TEST-mode charge into a structured row; replacementNet computes; real figure untouched', async (ctx) => {
    if (!tableReady) return ctx.skip();

    // 1. rail capture: a TEST-mode (livemode=false) succeeded charge
    const { error: insErr } = await sb.from('ops_payment_events').insert({
      stripe_event_id: MARKER,
      event_type: 'payment_intent.succeeded',
      amount_cents: 4200,
      currency: 'usd',
      status: 'succeeded',
      livemode: false,
      event_ts: SENTINEL_EVENT_TS,
      raw_payload: { test: true, sd: 'SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001' },
    });
    expect(insErr).toBeNull();

    // 2. aggregate (TEST mode only)
    const rows = await aggregateIncomeCapture({ supabase: sb, livemode: false });
    expect(rows).not.toBeNull();

    // 3. structured row exists for the sentinel month with recurring_revenue from the charge
    const { data: row } = await sb
      .from('income_capture_monthly')
      .select('*')
      .eq('period_month', SENTINEL_MONTH)
      .eq('livemode', false)
      .maybeSingle();
    expect(row).not.toBeNull();
    expect(Number(row.recurring_revenue)).toBe(42); // 4200 cents -> dollars
    expect(row.revenue_event_count).toBeGreaterThanOrEqual(1);
    // deductions remain unattested (fleet never wrote them)
    expect(row.ppo).toBeNull();
    expect(row.retirement_solo_401k).toBeNull();
    expect(row.se_tax).toBeNull();
    expect(row.deduction_attestation_ref).toBeNull();

    // 4. replacementNet from the substrate -> real net (no fabricated deduction), unattested surfaced
    const r = await replacementNetFromCapture({ supabase: sb, periodMonth: SENTINEL_MONTH, livemode: false });
    expect(r).not.toBeNull();
    expect(r.net).toBe(42); // 42 - 0 deductions
    expect(r.unattested).toBe(true);
  });
});
