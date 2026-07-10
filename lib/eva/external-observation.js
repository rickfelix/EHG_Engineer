/**
 * External-observation verification — SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2).
 *
 * launch_mode='live' gates must verify EXTERNAL observations only, never
 * self-authored artifacts (closes the S16 grounding-failure class). Split into a
 * pure verifier (independently unit-testable, zero I/O) and an I/O collector
 * (the sole boundary that talks to the network/DB), matching this repo's
 * pure-logic/IO-boundary convention (e.g. lib/governance/*-gauges.js).
 *
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-5): telemetryRowCount was a
 * documented forward dependency, hardcoded null forever — which meant
 * verifyExternalObservation().verified was structurally UNSATISFIABLE (checks.every()
 * requires all 3, and telemetry_rows_arrive can never pass typeof-number+>0 against
 * null), so launch_mode='live' has been permanently unreachable via this path since
 * SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 shipped. Now wired to the real
 * venture_telemetry table (SD-LEO-INFRA-VENTURE-TELEMETRY-PULL-001-C). Also adds a
 * NEW, distinct gaugeWriterAlive observation + check: telemetry_rows_arrive answers
 * "has real data EVER landed" (historical), gauge_writer_alive answers "is the
 * funnel gauge currently live within its declared cadence" (current) — see
 * lib/telemetry/funnel-gauge.mjs.
 */
import { computeGaugeState } from '../telemetry/funnel-gauge.mjs';

const FETCH_TIMEOUT_MS = 5000;

/**
 * Pure verifier. Any input that cannot be evaluated (null/undefined) fails
 * CLOSED with reason 'NO_DATA_SOURCE' — it never silently defaults to a pass.
 * @param {{endpointStatus?: number|null, billingProductId?: string|null, telemetryRowCount?: number|null, gaugeWriterAlive?: boolean|null}} observations
 * @returns {{verified: boolean, checks: Array<{name: string, verified: boolean, reason: string}>}}
 */
export function verifyExternalObservation({ endpointStatus, billingProductId, telemetryRowCount, gaugeWriterAlive } = {}) {
  const checks = [
    {
      name: 'endpoint_200',
      verified: endpointStatus === 200,
      reason: endpointStatus == null ? 'NO_DATA_SOURCE' : (endpointStatus === 200 ? '' : `endpoint returned ${endpointStatus}`),
    },
    {
      name: 'billing_product_exists',
      verified: typeof billingProductId === 'string' && billingProductId.length > 0,
      reason: billingProductId ? '' : 'NO_DATA_SOURCE',
    },
    {
      name: 'telemetry_rows_arrive',
      verified: typeof telemetryRowCount === 'number' && telemetryRowCount > 0,
      reason: telemetryRowCount == null ? 'NO_DATA_SOURCE' : (telemetryRowCount > 0 ? '' : 'zero telemetry rows'),
    },
    {
      name: 'gauge_writer_alive',
      verified: gaugeWriterAlive === true,
      reason: gaugeWriterAlive == null ? 'NO_DATA_SOURCE' : (gaugeWriterAlive ? '' : 'funnel gauge writer is not currently live (no_writer_yet or stale)'),
    },
  ];
  return { verified: checks.every((c) => c.verified), checks };
}

/**
 * I/O boundary: collects what THIS repo can ground today for a venture's
 * external observations.
 * @param {{supabase: object, ventureId: string}} params
 * @returns {Promise<{endpointStatus: number|null, billingProductId: string|null, telemetryRowCount: number|null, gaugeWriterAlive: boolean|null}>}
 */
export async function collectExternalObservations({ supabase, ventureId }) {
  let application = null;
  try {
    const { data } = await supabase
      .from('applications')
      .select('id, deployment_url, metadata, metrics_cadence_hours')
      .eq('venture_id', ventureId)
      .maybeSingle();
    application = data || null;
  } catch {
    application = null;
  }

  let endpointStatus = null;
  if (application?.deployment_url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(application.deployment_url, { signal: controller.signal });
      clearTimeout(timer);
      endpointStatus = res.status;
    } catch {
      endpointStatus = null;
    }
  }

  const billingProductId = application?.metadata?.billing_product_id || null;

  let telemetryRowCount = null;
  let gaugeWriterAlive = null;
  if (application?.id) {
    try {
      const { data: telemetryRow } = await supabase
        .from('venture_telemetry')
        .select('kpis, pulled_at, ingest_status')
        .eq('application_id', application.id)
        .maybeSingle();
      const kpisEverLanded = !!telemetryRow?.kpis && typeof telemetryRow.kpis === 'object' && Object.keys(telemetryRow.kpis).length > 0;
      telemetryRowCount = kpisEverLanded ? 1 : 0;
      const gaugeOpts = { telemetryRow: telemetryRow || null };
      if (typeof application.metrics_cadence_hours === 'number') gaugeOpts.cadenceHours = application.metrics_cadence_hours;
      gaugeWriterAlive = computeGaugeState(gaugeOpts).state === 'live';
    } catch {
      telemetryRowCount = null;
      gaugeWriterAlive = null;
    }
  }

  return { endpointStatus, billingProductId, telemetryRowCount, gaugeWriterAlive };
}
