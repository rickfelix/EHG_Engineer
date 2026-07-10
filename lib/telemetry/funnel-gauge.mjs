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
 * The gauge's "paid" stage, per coordinator ruling on FR-3 descope
 * (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A): a per-venture paid-KPI
 * reader is structurally impossible today — ops_payment_events.venture_id is
 * unconditionally null at capture time (api/webhooks/stripe.js,
 * PAT-PORT-ISOL-001), and venture-payment attribution is Phase-2-deferred
 * scope with no sourcing SD (routed to Adam). Rather than silently omitting
 * the "paid" stage or showing a fabricated value, the funnel exposes this as
 * an explicit, visible GATED_ON_ATTRIBUTION state — never a fake number.
 * @returns {{state: 'gated_on_attribution', reason: string}}
 */
export function computePaidGaugeState() {
  return {
    state: 'gated_on_attribution',
    reason: 'per-venture paid KPI is gated on Stripe-payment-to-venture attribution, which does not exist yet (Phase-2-deferred, no sourcing SD) — never a fabricated number',
  };
}

export default { DEFAULT_CADENCE_HOURS, computeGaugeState, isGaugeWriterAlive, computePaidGaugeState };
