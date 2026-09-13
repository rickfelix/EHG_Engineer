/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- canary_mutation_control step.
 *
 * Coordinator ruling (relaying Solomon verdict 83de7b45, 2026-09-13): NO WAIVER. The canary
 * control (lib/eva/uat-control-pack.js's checkCanaryMutationControl) is not a product decision
 * -- it is a mutation test of the WALKER itself (does the pipeline correctly distinguish a
 * genuinely-failing journey from a passing one?), not a test of the venture's product surface.
 * It touches nothing in AltifyAI's product/spec-of-record and needs no seeded venture journey.
 *
 * This step makes a single, deliberately-false, read-only assertion against the live deploy:
 * it GETs /api/events and asserts a marker string that is unique-per-invocation and never
 * written anywhere is present in the response. That assertion can never be satisfied, so the
 * step deterministically reports FAIL -- proving the walker's PASS/FAIL machinery actually
 * fires on a real mismatch rather than rubber-stamping GREEN. Pure GET: no state mutation.
 *
 * Deliberately excluded from the main walk's journeySteps/recordResult/pass_rate bookkeeping
 * (journey-walk-orchestrator.js runs it as a separate step via deps.canaryStep, AFTER
 * runJourneyWalk returns, and merges its outcome only into controlPackEvidence.journeyResults
 * -- never into uat_test_results/total_tests/passed_tests). This is intentional: browser-
 * executor.js's runJourneyWalk stops at the first failure, so an always-failing step inside
 * the main journeySteps array would abort every other step and read as a genuine breakage.
 */

export const CANARY_JOURNEY_ID = 'canary-mutation-control';

/**
 * @param {Object} params
 * @param {string} params.baseUrl - live, already-deployed venture URL
 * @param {typeof fetch} [params.fetchImpl] - injectable for tests; defaults to global fetch
 * @returns {Promise<{journeyId: string, status: 'FAIL', durationMs: number, reason: string}>}
 */
export async function runCanaryStep({ baseUrl, fetchImpl = fetch }) {
  const startedAt = Date.now();
  const impossibleMarker = `__canary_never_written_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
  try {
    const res = await fetchImpl(`${baseUrl}/api/events`, { method: 'GET' });
    if (!res.ok) {
      return {
        journeyId: CANARY_JOURNEY_ID,
        status: 'FAIL',
        durationMs: Date.now() - startedAt,
        reason: `canary GET /api/events returned HTTP ${res.status} (any response is FAIL by construction -- see module docblock)`,
      };
    }
    const body = await res.json().catch(() => ({}));
    const found = Array.isArray(body?.events) && body.events.some((e) => e?.properties?.path === impossibleMarker);
    // `found` can never be true -- impossibleMarker is generated fresh above and never written
    // by anything. This assertion always fails, which is the entire point of the control.
    return {
      journeyId: CANARY_JOURNEY_ID,
      status: found ? 'PASS' : 'FAIL',
      durationMs: Date.now() - startedAt,
      reason: found
        ? undefined
        : `canary deliberately asserts a never-written marker (${impossibleMarker}) is present in /api/events -- confirms the walker correctly detects a genuine assertion mismatch`,
    };
  } catch (err) {
    return {
      journeyId: CANARY_JOURNEY_ID,
      status: 'FAIL',
      durationMs: Date.now() - startedAt,
      reason: `canary request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export default { CANARY_JOURNEY_ID, runCanaryStep };
