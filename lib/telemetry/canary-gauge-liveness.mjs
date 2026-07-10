/**
 * Synthetic-visit canary liveness proof — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-4.
 *
 * Pure assertion: given the result of a real (or injected, for tests) /v1/metrics
 * pull (scripts/venture-telemetry-pull.mjs pullVenture()) and the resulting funnel
 * gauge state (lib/telemetry/funnel-gauge.mjs computeGaugeState()), decides whether
 * the synthetic visit + signup genuinely registered end-to-end. A successful HTTP
 * pull alone is NOT sufficient proof — the gauge must also read 'live', closing the
 * loop between "the endpoint responded" and "the platform's gauge trusts it".
 *
 * @module lib/telemetry/canary-gauge-liveness
 */

/**
 * @param {object} opts
 * @param {{outcome: string}} opts.pullResult - the pullVenture() result for the canary run
 * @param {{state: string}} opts.gaugeState - computeGaugeState() output AFTER persisting pullResult
 * @returns {{passed: boolean, reason: string}}
 */
export function assertGaugeLivenessProof({ pullResult, gaugeState }) {
  if (pullResult?.outcome !== 'ok') {
    return {
      passed: false,
      reason: `synthetic pull did not succeed (outcome='${pullResult?.outcome ?? 'missing'}') — no real data reached the venture's /v1/metrics endpoint`,
    };
  }
  if (gaugeState?.state !== 'live') {
    return {
      passed: false,
      reason: `pull succeeded but the funnel gauge state is '${gaugeState?.state ?? 'missing'}', not 'live' — the canary visit did not register end-to-end`,
    };
  }
  return { passed: true, reason: 'synthetic visit registered end-to-end: pull succeeded and the funnel gauge reads live' };
}

export default { assertGaugeLivenessProof };
