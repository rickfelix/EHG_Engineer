// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-2)
import { describe, it, expect, vi } from 'vitest';
import { computeGaugeState, isGaugeWriterAlive, computePaidGaugeState, DEFAULT_CADENCE_HOURS } from '../../../lib/telemetry/funnel-gauge.mjs';

const NOW = new Date('2026-07-10T12:00:00.000Z');

describe('computeGaugeState (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-2)', () => {
  it('no_writer_yet when no venture_telemetry row exists', () => {
    const result = computeGaugeState({ telemetryRow: null, now: NOW });
    expect(result.state).toBe('no_writer_yet');
    expect(result.reason).toMatch(/no venture_telemetry row/);
  });

  it('no_writer_yet when a row exists but kpis has never carried any validated field (e.g. always skipped/errored)', () => {
    const result = computeGaugeState({
      telemetryRow: { kpis: {}, pulled_at: NOW.toISOString(), ingest_status: 'skipped' },
      now: NOW,
    });
    expect(result.state).toBe('no_writer_yet');
    expect(result.reason).toMatch(/no validated KPI payload/);
  });

  it('no_writer_yet when kpis is null', () => {
    const result = computeGaugeState({ telemetryRow: { kpis: null, pulled_at: NOW.toISOString(), ingest_status: 'error' }, now: NOW });
    expect(result.state).toBe('no_writer_yet');
  });

  it('live when the latest pull is ok and within the cadence window', () => {
    const pulledAt = new Date(NOW.getTime() - 5 * 3600 * 1000); // 5h ago
    const result = computeGaugeState({
      telemetryRow: { kpis: { signups: 10 }, pulled_at: pulledAt.toISOString(), ingest_status: 'ok' },
      now: NOW,
      cadenceHours: DEFAULT_CADENCE_HOURS,
    });
    expect(result.state).toBe('live');
    expect(result.reason).toMatch(/within the 30h cadence window/);
  });

  it('stale when the last successful pull exceeds the cadence window, even though ingest_status is ok', () => {
    const pulledAt = new Date(NOW.getTime() - 40 * 3600 * 1000); // 40h ago, exceeds default 30h
    const result = computeGaugeState({
      telemetryRow: { kpis: { signups: 10 }, pulled_at: pulledAt.toISOString(), ingest_status: 'ok' },
      now: NOW,
    });
    expect(result.state).toBe('stale');
    expect(result.reason).toMatch(/exceeding the 30h cadence window/);
  });

  it('stale when historical kpis exist but the LATEST attempt is not ok (writer regressed)', () => {
    const pulledAt = new Date(NOW.getTime() - 1 * 3600 * 1000); // recent, but errored
    const result = computeGaugeState({
      telemetryRow: { kpis: { signups: 10 }, pulled_at: pulledAt.toISOString(), ingest_status: 'error' },
      now: NOW,
    });
    expect(result.state).toBe('stale');
    expect(result.reason).toMatch(/latest pull attempt was 'error'/);
  });

  it('honors a per-venture cadenceHours override tighter than the default', () => {
    const pulledAt = new Date(NOW.getTime() - 2 * 3600 * 1000); // 2h ago
    const result = computeGaugeState({
      telemetryRow: { kpis: { signups: 10 }, pulled_at: pulledAt.toISOString(), ingest_status: 'ok' },
      now: NOW,
      cadenceHours: 1, // 2h ago exceeds a 1h declared cadence
    });
    expect(result.state).toBe('stale');
  });

  it('never fabricates a number — the return shape never carries a metric value, only a state + reason', () => {
    const result = computeGaugeState({ telemetryRow: null, now: NOW });
    expect(Object.keys(result).sort()).toEqual(['reason', 'state']);
  });
});

describe('isGaugeWriterAlive (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-2/FR-5)', () => {
  it('true only for state live', () => {
    const pulledAt = new Date(NOW.getTime() - 1 * 3600 * 1000);
    expect(isGaugeWriterAlive({ telemetryRow: { kpis: { signups: 1 }, pulled_at: pulledAt.toISOString(), ingest_status: 'ok' }, now: NOW })).toBe(true);
  });

  it('false for no_writer_yet', () => {
    expect(isGaugeWriterAlive({ telemetryRow: null, now: NOW })).toBe(false);
  });

  it('false for stale', () => {
    const pulledAt = new Date(NOW.getTime() - 40 * 3600 * 1000);
    expect(isGaugeWriterAlive({ telemetryRow: { kpis: { signups: 1 }, pulled_at: pulledAt.toISOString(), ingest_status: 'ok' }, now: NOW })).toBe(false);
  });
});

// Coordinator ruling on FR-3 descope (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A),
// given a real implementation by SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 FR-4.
// Never fabricates a paid value -- gated_on_attribution unless resolver coverage exists.
describe('computePaidGaugeState (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 FR-4)', () => {
  function buildSupabaseStub({ readinessRows, resolvedRows, unattributedCount }) {
    return {
      from: vi.fn(() => ({
        select: vi.fn((cols, opts) => {
          if (opts?.head) {
            // unattributed count query
            return { eq: vi.fn(() => Promise.resolve({ count: unattributedCount, error: null })) };
          }
          return {
            not: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: readinessRows, error: null })) })),
            // resolved-rows query: .eq(venture_id).eq(attribution_status).eq(livemode)
            // FR-6 batch 8: now paginated via fetchAllPaginated — chain through .order() and resolve on .range().
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => { const b = { order: vi.fn(() => b), range: vi.fn(() => Promise.resolve({ data: resolvedRows, error: null })) }; return b; }) })) })),
          };
        }),
      })),
    };
  }

  it('TS-5: reports gated_on_attribution — unchanged pre-resolver behavior — when the resolver has never run anywhere', async () => {
    const supabase = buildSupabaseStub({ readinessRows: [], resolvedRows: [], unattributedCount: 0 });
    const result = await computePaidGaugeState({ supabase, ventureId: 'v-1' });
    expect(result.state).toBe('gated_on_attribution');
    expect(result.reason).toMatch(/never run/);
  });

  it('TS-5: reports live with a DEDUPED paid_amount_cents once resolver coverage exists — never double-counts a payment\'s multiple webhook-event rows (adversarial-review finding)', async () => {
    const supabase = buildSupabaseStub({
      readinessRows: [{ id: 'row-1' }],
      resolvedRows: [
        // ONE real payment (pi_1) captured as 3 separate ops_payment_events rows,
        // per Stripe's own multi-event webhook behavior + the Phase-1 IDEMP-02 note.
        { id: 'e1', amount_cents: 1000, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e2', amount_cents: 1000, currency: 'usd', event_type: 'payment_intent.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: null },
        { id: 'e3', amount_cents: 1000, currency: 'usd', event_type: 'charge.succeeded', payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1' },
        // A SECOND, genuinely distinct payment (pi_2).
        { id: 'e4', amount_cents: 500, currency: 'usd', event_type: 'checkout.session.completed', payment_intent_id: 'pi_2', stripe_charge_id: null },
      ],
      unattributedCount: 2,
    });
    const result = await computePaidGaugeState({ supabase, ventureId: 'v-1' });
    expect(result).toEqual({ state: 'live', paid_amount_cents: 1500, currency: 'usd', unattributed_count_fleet_wide: 2 });
  });

  it('never hides the UNATTRIBUTED line — unattributed_count_fleet_wide is present even when zero', async () => {
    const supabase = buildSupabaseStub({ readinessRows: [{ id: 'row-1' }], resolvedRows: [], unattributedCount: 0 });
    const result = await computePaidGaugeState({ supabase, ventureId: 'v-1' });
    expect(result.unattributed_count_fleet_wide).toBe(0);
  });
});
