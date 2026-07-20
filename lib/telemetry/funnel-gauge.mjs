/**
 * Funnel gauge STALE / no-writer-yet semantics — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-2.
 *
 * Layers a declared-writer + expected-cadence contract on TOP of the existing
 * venture_telemetry table/writer (scripts/venture-telemetry-pull.mjs) — no new
 * table, additive only. Three states, never a fabricated number:
 *   - 'no_writer_yet': no venture_telemetry row, or the row has never carried a
 *     validated kpis payload (a writer that always errors/skips never counts as
 *     "having written" — kpis persists from the last GOOD pull, per
 *     persistResult's metadata-only update on failure).
 *   - 'live': the most recent pull was 'ok' and landed within the cadence window.
 *   - 'stale': a writer existed before (kpis non-empty) but the current state is
 *     not a fresh 'ok' pull — either the latest attempt failed/skipped, or the
 *     cadence window has elapsed since the last successful pull.
 *
 * @module lib/telemetry/funnel-gauge
 */

import { computeAttributedRevenue } from '../payments/attribution-resolver.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — a venture's resolved payment events
// are SUMMED into a paid-revenue KPI; a read silently capped at the PostgREST 1000-row max would
// undercount revenue once a venture accumulates >1000 webhook-event rows. Paginate to completion.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/** Default expected pull cadence: the daily cron (scripts/venture-telemetry-pull.mjs
 *  docstring: "daily PULL") plus a generous buffer for scheduling jitter. */
export const DEFAULT_CADENCE_HOURS = 30;

function hasEverWritten(telemetryRow) {
  const kpis = telemetryRow?.kpis;
  return !!kpis && typeof kpis === 'object' && Object.keys(kpis).length > 0;
}

/**
 * Pure gauge-state computation. No I/O — caller supplies the venture_telemetry
 * row (or null) and the declared cadence.
 * @param {object} opts
 * @param {object|null} opts.telemetryRow - a venture_telemetry row, or null if none exists
 * @param {Date} [opts.now]
 * @param {number} [opts.cadenceHours] - declared expected-pull cadence for this venture
 * @returns {{state: 'no_writer_yet'|'live'|'stale', reason: string}}
 */
export function computeGaugeState({ telemetryRow, now = new Date(), cadenceHours = DEFAULT_CADENCE_HOURS }) {
  if (!hasEverWritten(telemetryRow)) {
    return { state: 'no_writer_yet', reason: telemetryRow ? 'no validated KPI payload has ever landed for this venture' : 'no venture_telemetry row exists for this venture' };
  }

  const pulledAt = telemetryRow.pulled_at ? new Date(telemetryRow.pulled_at) : null;
  const ageHours = pulledAt ? (now.getTime() - pulledAt.getTime()) / (1000 * 60 * 60) : Infinity;

  if (telemetryRow.ingest_status === 'ok' && ageHours <= cadenceHours) {
    return { state: 'live', reason: `last successful pull ${ageHours.toFixed(1)}h ago, within the ${cadenceHours}h cadence window` };
  }

  if (telemetryRow.ingest_status !== 'ok') {
    return { state: 'stale', reason: `writer has prior data but the latest pull attempt was '${telemetryRow.ingest_status}', not 'ok'` };
  }
  return { state: 'stale', reason: `last successful pull was ${ageHours.toFixed(1)}h ago, exceeding the ${cadenceHours}h cadence window` };
}

/**
 * True only when the gauge is genuinely 'live' — the single boolean a caller
 * (e.g. a launch_mode=live precondition) needs, without inspecting state internals.
 * @param {object} opts - same shape as computeGaugeState
 * @returns {boolean}
 */
export function isGaugeWriterAlive(opts) {
  return computeGaugeState(opts).state === 'live';
}

/**
 * The gauge's "paid" stage. SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 (Phase-2)
 * gives this a real implementation, replacing the coordinator-ruled hardcoded
 * gated_on_attribution stub from SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A
 * FR-3 (PR #5783). Verified zero existing callers at the time of this change,
 * so the signature change breaks nothing live.
 *
 * Fail-closed readiness check: if the attribution resolver
 * (lib/payments/attribution-resolver.js) has NEVER run anywhere in the fleet
 * (no row has attribution_status set), the gate stays gated_on_attribution
 * unchanged — honest, since the mechanism existing in code is not the same as
 * it having actually run. Once resolver coverage exists, returns live,
 * per-venture-scoped attributed revenue, with unattributed_count always
 * visible (never hidden) per the "honest gauge" convention.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.ventureId
 * @returns {Promise<{state: 'gated_on_attribution', reason: string}|{state: 'live', paid_amount_cents: number, currency: string|null, unattributed_count_fleet_wide: number}>}
 */
export async function computePaidGaugeState({ supabase, ventureId }) {
  const { data: readiness, error: readinessError } = await supabase
    .from('ops_payment_events')
    .select('id')
    .not('attribution_status', 'is', null)
    .limit(1);
  if (readinessError) throw new Error(`computePaidGaugeState: readiness check failed: ${readinessError.message}`);

  if (!readiness || readiness.length === 0) {
    return {
      state: 'gated_on_attribution',
      reason: 'per-venture paid KPI is gated on Stripe-payment-to-venture attribution — the resolver has never run anywhere in the fleet yet',
    };
  }

  // adversarial-review finding: a single real payment fires multiple distinct
  // webhook events (checkout.session.completed, payment_intent.succeeded,
  // charge.succeeded), each captured as its own row -- summing amount_cents
  // across ALL resolved rows would double/triple-count one payment (exactly
  // the risk the Phase-1 migration's IDEMP-02 note warned Phase-2 about).
  // computeAttributedRevenue dedups by payment identity before summing.
  // livemode=true only: TEST-mode events (the only kind the fail-closed
  // stripe-client.js guard permits in automated contexts) are fake money and
  // must never count toward a paid-revenue KPI.
  let resolvedRows;
  try {
    resolvedRows = await fetchAllPaginated(() => supabase
      .from('ops_payment_events')
      .select('amount_cents, currency, event_type, payment_intent_id, stripe_charge_id, id')
      .eq('venture_id', ventureId)
      .eq('attribution_status', 'resolved')
      .eq('livemode', true)
      .order('id', { ascending: true })); // stable page order (FR-6)
  } catch (resolvedError) {
    throw new Error(`computePaidGaugeState: resolved-rows query failed: ${resolvedError.message}`);
  }

  const { totalCents: paidAmountCents, currency } = computeAttributedRevenue(resolvedRows);

  // Unattributed events have venture_id=NULL by definition (never guessed) --
  // they cannot be scoped to "this venture," only to the fleet as a whole.
  // Surfaced fleet-wide so the UNATTRIBUTED line is never silently hidden,
  // rather than falsely reporting a per-venture count that would always be 0.
  const { count: unattributedCountFleetWide, error: unattributedError } = await supabase
    .from('ops_payment_events')
    .select('id', { count: 'exact', head: true })
    .eq('attribution_status', 'unattributed');
  if (unattributedError) throw new Error(`computePaidGaugeState: unattributed-count query failed: ${unattributedError.message}`);

  return {
    state: 'live',
    paid_amount_cents: paidAmountCents,
    currency,
    unattributed_count_fleet_wide: unattributedCountFleetWide || 0,
  };
}

export default { DEFAULT_CADENCE_HOURS, computeGaugeState, isGaugeWriterAlive, computePaidGaugeState };
