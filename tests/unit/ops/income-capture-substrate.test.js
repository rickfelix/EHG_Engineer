/**
 * SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — structured replacement-net substrate.
 * Pure unit tests (mocked supabase): the aggregator converts cents->dollars and NEVER writes the
 * chairman-gated deduction columns; netFromSubstrateRow computes the net + surfaces `unattested`;
 * applyDeductionAttestation is the only deduction writer and refuses unapproved attestations.
 */
import { describe, it, expect } from 'vitest';
import { aggregateIncomeCapture, firstOfMonth } from '../../../lib/income/income-capture-aggregator.js';
import { netFromSubstrateRow, applyDeductionAttestation } from '../../../lib/income/replacement-net-source.js';

// ---- mocks -------------------------------------------------------------------------------------
function aggSb(charges, upserts) {
  return {
    from(table) {
      if (table === 'ops_payment_events') {
        // FR-6 batch 8: aggregateIncomeCapture now paginates via fetchAllPaginated (.order + .range)
        const b = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, range(from, to) { return Promise.resolve({ data: (charges || []).slice(from, to + 1), error: null }); }, then(res) { return res({ data: charges, error: null }); } };
        return b;
      }
      // income_capture_monthly
      return {
        upsert(row, opts) {
          upserts.push({ row, opts });
          return { select() { return this; }, single: () => Promise.resolve({ data: row, error: null }) };
        },
      };
    },
  };
}
// rail row shorthand
const ev = (o) => ({ amount_cents: null, event_ts: '2026-06-10T12:00:00Z', status: 'succeeded', payment_intent_id: null, stripe_charge_id: null, livemode: false, ...o });

function attSb(decision, updates) {
  return {
    from(table) {
      if (table === 'chairman_decisions') {
        return { select() { return this; }, eq() { return this; }, maybeSingle: () => Promise.resolve({ data: decision, error: null }) };
      }
      return {
        update(upd) {
          updates.push(upd);
          return { eq() { return this; }, select() { return this; }, single: () => Promise.resolve({ data: { ...upd }, error: null }) };
        },
      };
    },
  };
}

// ---- aggregator --------------------------------------------------------------------------------
describe('aggregateIncomeCapture (FR-2)', () => {
  it('converts cents->dollars, counts distinct payments, and groups by first-of-month', async () => {
    const upserts = [];
    const charges = [
      ev({ amount_cents: 5000, event_ts: '2026-06-10T12:00:00Z', payment_intent_id: 'pi_a' }),
      ev({ amount_cents: 2500, event_ts: '2026-06-20T08:00:00Z', payment_intent_id: 'pi_b' }),
    ];
    const rows = await aggregateIncomeCapture({ supabase: aggSb(charges, upserts), livemode: false });
    expect(rows).toHaveLength(1);
    expect(upserts[0].row.period_month).toBe('2026-06-01');
    expect(upserts[0].row.recurring_revenue).toBe(75); // (5000+2500)/100
    expect(upserts[0].row.revenue_event_count).toBe(2);
    expect(upserts[0].opts).toEqual({ onConflict: 'period_month,livemode' });
  });

  it('counts a payment ONCE when both payment_intent.succeeded AND charge.succeeded are captured (no double-count)', async () => {
    const upserts = [];
    const charges = [
      ev({ amount_cents: 5000, status: 'succeeded', payment_intent_id: 'pi_x', stripe_charge_id: null }),      // payment_intent.succeeded
      ev({ amount_cents: 5000, status: 'succeeded', payment_intent_id: 'pi_x', stripe_charge_id: 'ch_x' }),     // charge.succeeded (same payment)
    ];
    await aggregateIncomeCapture({ supabase: aggSb(charges, upserts), livemode: false });
    expect(upserts[0].row.recurring_revenue).toBe(50); // counted once, not 100
    expect(upserts[0].row.revenue_event_count).toBe(1);
  });

  it("includes checkout-session revenue (status='paid') and nets refunds", async () => {
    const upserts = [];
    const charges = [
      ev({ amount_cents: 10000, status: 'paid', payment_intent_id: 'pi_co' }),                 // checkout.session paid
      ev({ amount_cents: -3000, status: 'partially_refunded', payment_intent_id: 'pi_co', stripe_charge_id: 'ch_co' }), // refund nets
    ];
    await aggregateIncomeCapture({ supabase: aggSb(charges, upserts), livemode: false });
    expect(upserts[0].row.recurring_revenue).toBe(70); // 100 paid - 30 refund
    expect(upserts[0].row.revenue_event_count).toBe(1); // refund does not increment the payment count
  });

  it('NEVER writes the chairman-gated deduction columns', async () => {
    const upserts = [];
    const charges = [ev({ amount_cents: 9900, event_ts: '2026-05-01T00:00:00Z', payment_intent_id: 'pi_z', livemode: true })];
    await aggregateIncomeCapture({ supabase: aggSb(charges, upserts), livemode: true });
    const row = upserts[0].row;
    expect(row).not.toHaveProperty('ppo');
    expect(row).not.toHaveProperty('retirement_solo_401k');
    expect(row).not.toHaveProperty('se_tax');
    expect(row).not.toHaveProperty('deduction_attestation_ref');
    expect(row).not.toHaveProperty('business_expenses'); // left to its column default; not fleet-written here
  });

  it('firstOfMonth normalizes to YYYY-MM-01 (UTC)', () => {
    expect(firstOfMonth('2026-06-30T23:59:59Z')).toBe('2026-06-01');
    expect(firstOfMonth('2026-01-01T00:00:00Z')).toBe('2026-01-01');
  });

  it('returns null and does not throw on a read error', async () => {
    const sb = { from: () => ({ select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: null, error: { message: 'boom' } }); }, then(res) { return res({ data: null, error: { message: 'boom' } }); } }) };
    expect(await aggregateIncomeCapture({ supabase: sb, livemode: true })).toBeNull();
  });
});

// ---- net computation + unattested surfacing ----------------------------------------------------
describe('netFromSubstrateRow (FR-4)', () => {
  it('attested row -> correct net (revenue - 4 deductions), unattested=false', () => {
    const r = netFromSubstrateRow({
      recurring_revenue: 5000, business_expenses: 500, ppo: 1200, retirement_solo_401k: 2000, se_tax: 700,
      deduction_attestation_ref: '11111111-1111-1111-1111-111111111111',
    });
    expect(r.net).toBe(600); // 5000-500-1200-2000-700
    expect(r.unattested).toBe(false);
    expect(r.inputs.retirement).toBe(2000); // retirement_solo_401k -> retirement mapping
  });

  it('unattested row (NULL deductions + NULL ref) -> deductions coalesce to 0, unattested=true', () => {
    const r = netFromSubstrateRow({
      recurring_revenue: 5000, business_expenses: 0, ppo: null, retirement_solo_401k: null, se_tax: null,
      deduction_attestation_ref: null,
    });
    expect(r.net).toBe(5000); // no fabricated deduction
    expect(r.unattested).toBe(true);
    expect(r.attestation_ref).toBeNull();
  });

  it('a row with a ref but a NULL deduction is still flagged unattested (no attested-0 confusion)', () => {
    const r = netFromSubstrateRow({
      recurring_revenue: 1000, business_expenses: 0, ppo: 100, retirement_solo_401k: null, se_tax: 50,
      deduction_attestation_ref: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.unattested).toBe(true);
  });
});

// ---- chairman-gated deduction writer -----------------------------------------------------------
describe('applyDeductionAttestation (FR-3)', () => {
  it('writes deductions from an APPROVED replacement_net_deduction_params attestation', async () => {
    const updates = [];
    const decision = {
      id: 'dec-1', decision_type: 'replacement_net_deduction_params', status: 'approved',
      brief_data: { ppo: 1200, solo_401k: 2000, se_tax: 700 },
    };
    const out = await applyDeductionAttestation({ supabase: attSb(decision, updates), periodMonth: '2026-06-01', attestationId: 'dec-1' });
    expect(out).not.toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].ppo).toBe(1200);
    expect(updates[0].retirement_solo_401k).toBe(2000); // solo_401k -> retirement_solo_401k
    expect(updates[0].se_tax).toBe(700);
    expect(updates[0].deduction_attestation_ref).toBe('dec-1');
  });

  it('REFUSES a non-approved attestation (no write)', async () => {
    const updates = [];
    const decision = { id: 'dec-2', decision_type: 'replacement_net_deduction_params', status: 'pending', brief_data: { ppo: 1 } };
    const out = await applyDeductionAttestation({ supabase: attSb(decision, updates), periodMonth: '2026-06-01', attestationId: 'dec-2' });
    expect(out).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('REFUSES a wrong decision_type (no write)', async () => {
    const updates = [];
    const decision = { id: 'dec-3', decision_type: 'something_else', status: 'approved', brief_data: { ppo: 1 } };
    const out = await applyDeductionAttestation({ supabase: attSb(decision, updates), periodMonth: '2026-06-01', attestationId: 'dec-3' });
    expect(out).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('REFUSES an APPROVED attestation with PARTIAL brief_data (no silent fabricated-zero)', async () => {
    const updates = [];
    // ppo present but solo_401k + se_tax missing — must NOT write 0s + a ref (which would read unattested=false)
    const decision = { id: 'dec-4', decision_type: 'replacement_net_deduction_params', status: 'approved', brief_data: { ppo: 1200 } };
    const out = await applyDeductionAttestation({ supabase: attSb(decision, updates), periodMonth: '2026-06-01', attestationId: 'dec-4' });
    expect(out).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
