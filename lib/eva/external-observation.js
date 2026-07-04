/**
 * External-observation verification — SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2).
 *
 * launch_mode='live' gates must verify EXTERNAL observations only, never
 * self-authored artifacts (closes the S16 grounding-failure class). Split into a
 * pure verifier (independently unit-testable, zero I/O) and an I/O collector
 * (the sole boundary that talks to the network/DB), matching this repo's
 * pure-logic/IO-boundary convention (e.g. lib/governance/*-gauges.js).
 */

const FETCH_TIMEOUT_MS = 5000;

/**
 * Pure verifier. Any input that cannot be evaluated (null/undefined) fails
 * CLOSED with reason 'NO_DATA_SOURCE' — it never silently defaults to a pass.
 * @param {{endpointStatus?: number|null, billingProductId?: string|null, telemetryRowCount?: number|null}} observations
 * @returns {{verified: boolean, checks: Array<{name: string, verified: boolean, reason: string}>}}
 */
export function verifyExternalObservation({ endpointStatus, billingProductId, telemetryRowCount } = {}) {
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
  ];
  return { verified: checks.every((c) => c.verified), checks };
}

/**
 * I/O boundary: collects what THIS repo can ground today for a venture's
 * external observations. telemetryRowCount has no existing data source
 * (no telemetry/analytics table for ventures) — returned as null, a documented
 * forward dependency (see PRD risk), NOT stubbed to a passing value.
 * @param {{supabase: object, ventureId: string}} params
 * @returns {Promise<{endpointStatus: number|null, billingProductId: string|null, telemetryRowCount: number|null}>}
 */
export async function collectExternalObservations({ supabase, ventureId }) {
  let application = null;
  try {
    const { data } = await supabase
      .from('applications')
      .select('deployment_url, metadata')
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

  return { endpointStatus, billingProductId, telemetryRowCount: null };
}
