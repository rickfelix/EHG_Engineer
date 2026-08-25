/**
 * UAT robustness control pack — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-2, FR-4).
 *
 * Solomon addition C ("green-while-testing-nothing" control pack): pure, DB/network-free
 * assertion functions that a UAT run's evidence must pass before its quality gate can read
 * GREEN. Kept pure (no Supabase/fs/network calls) so they are genuinely unit-testable without
 * a live venture — the run-level wiring (lib/uat/result-recorder.js's completeSession) is what
 * calls these against a run's actual recorded evidence.
 *
 * TESTING sub-agent scrutiny (evidence row 00ebf55d) found the naive versions of two of these
 * checks are unfalsifiable or wrong-instrument by construction — see the doc-block on each
 * function below for the specific correction applied.
 */
import { randomBytes } from 'node:crypto';
import { computeDedupHash } from './corrective-finding-recorder.js';

/**
 * (i) Per-journey minimum-assertion manifest.
 *
 * A run FAILS if any journey's executed assertion count is below its manifest minimum.
 * TESTING finding TS-7: a manifest entry naming a journey_id/label that matches NO executed
 * journey must also FAIL (not silently pass as "no minimum applied") — otherwise a renamed or
 * regenerated journey (a documented, real occurrence — see venture-step-executors.js's
 * step_id regeneration note) silently disables its own minimum.
 *
 * @param {Array<{journeyId: string, minimumAssertions: number}>} manifest
 * @param {Array<{journeyId: string, executedAssertions: number}>} executedJourneys
 * @returns {{passed: boolean, failures: Array<{journeyId: string, reason: string}>}}
 */
export function checkMinimumAssertionManifest(manifest, executedJourneys) {
  const failures = [];
  const executedById = new Map(executedJourneys.map((j) => [j.journeyId, j]));

  for (const entry of manifest) {
    const executed = executedById.get(entry.journeyId);
    if (!executed) {
      failures.push({
        journeyId: entry.journeyId,
        reason: `manifest entry references journeyId "${entry.journeyId}" which no executed journey matched — treated as a failure, not a satisfied-by-absence pass`,
      });
      continue;
    }
    if (executed.executedAssertions < entry.minimumAssertions) {
      failures.push({
        journeyId: entry.journeyId,
        reason: `executed ${executed.executedAssertions} assertions, below manifest minimum of ${entry.minimumAssertions}`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Generates a high-entropy nonce for the live-deployment binding round-trip. SECURITY sub-agent
 * finding S4 (EXEC-TO-PLAN evidence): the caller must obtain `expectedNonce` from THIS function,
 * not invent its own string, so a live writer cannot trivially satisfy assertLiveDeploymentBinding
 * by hand-typing matching literals on both sides of a call it never actually round-tripped.
 * @returns {string} a 32-hex-char random nonce
 */
export function generateProbeNonce() {
  return randomBytes(16).toString('hex');
}

/**
 * (ii) Live-deployment binding liveness proof, modeled on the two-step "action succeeded AND
 * downstream state reflects it" pattern in lib/telemetry/canary-gauge-liveness.mjs
 * (assertGaugeLivenessProof) — that function is scoped to a different domain (/v1/metrics
 * funnel gauges) and is not literally callable here; this mirrors its shape rather than
 * importing it.
 *
 * TESTING finding: a null/placeholder deployment sha or a nonce that was not echoed back from
 * the live origin must fail closed, not read as evidence of a live-app exercise.
 *
 * SECURITY sub-agent finding S4 (EXEC-TO-PLAN evidence, HONEST LIMIT): this function validates
 * INTERNAL CONSISTENCY of caller-supplied evidence (do outcome/echoedNonce/deploymentSha
 * cohere) — it does NOT itself perform or independently verify a live network round-trip. A
 * caller that never actually wrote to the venture's uatProbePath endpoint, but constructs a
 * self-consistent {outcome:'ok', echoedNonce: n} using the SAME nonce it passes as
 * expectedNonce, still satisfies this check. Closing that gap requires the actual live-write
 * caller (blocked today on LEO_ALTIFYAI_UAT_READ_TOKEN / VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_*
 * provisioning) to be the ONLY code path that calls generateProbeNonce() and performs the
 * write — this function cannot enforce that from the caller's side alone. Do not cite this
 * function's PASS as proof of a live round-trip in any durable record; cite it only alongside
 * the actual write-and-read call site once that exists.
 *
 * @param {{nonceWriteResult: {outcome: string, echoedNonce: string|null}, expectedNonce: string, deploymentSha: string|null}} opts
 * @returns {{passed: boolean, reason: string}}
 */
export function assertLiveDeploymentBinding({ nonceWriteResult, expectedNonce, deploymentSha }) {
  if (nonceWriteResult?.outcome !== 'ok') {
    return { passed: false, reason: `nonce write did not succeed (outcome='${nonceWriteResult?.outcome ?? 'missing'}') — no real write reached the venture's uatProbePath endpoint` };
  }
  if (!nonceWriteResult.echoedNonce || nonceWriteResult.echoedNonce !== expectedNonce) {
    return { passed: false, reason: `write reported success but the echoed nonce ("${nonceWriteResult.echoedNonce ?? 'none'}") does not match the expected nonce ("${expectedNonce}") — refusing an inconsistent transport as evidence` };
  }
  if (!deploymentSha || typeof deploymentSha !== 'string' || deploymentSha.length < 7) {
    return { passed: false, reason: `deployment sha is missing or implausible ("${deploymentSha ?? 'null'}") — refusing to bind evidence to an unverified deployment` };
  }
  return { passed: true, reason: `caller-supplied evidence is internally consistent (echoed nonce matches, sha=${deploymentSha}) — this does not itself prove the write reached a live origin; see this function's doc-block` };
}

/**
 * (iii) Run-unique evidence hash, EXCLUDING volatile fields.
 *
 * TESTING finding (TS-2): lib/evidence/manifest-generator.js's manifest_hash includes pack_id
 * (embeds Date.now()+random bytes) and generated_at (a fresh timestamp) — two runs against the
 * SAME artifacts differ by construction, making run-uniqueness unfalsifiable. This computes a
 * SUBSTANTIVE hash over only content that should genuinely differ between distinct runs
 * (artifact hashes, test_run counts, deployment sha), so a positive control (identical
 * substantive inputs) can also be asserted to yield an IDENTICAL hash.
 *
 * @param {{integrity: {artifact_hashes: string[]}, test_run: object}} manifest
 * @param {string|null} deploymentSha
 * @returns {string} sha256 hex digest of the substantive content only
 */
export function computeSubstantiveEvidenceHash(manifest, deploymentSha) {
  const substantive = {
    artifact_hashes: [...(manifest?.integrity?.artifact_hashes || [])].sort(),
    test_run: manifest?.test_run || null,
    deployment_sha: deploymentSha || null,
  };
  return computeDedupHash(null, [JSON.stringify(substantive)], null);
}

/**
 * (iv) Deliberately-broken canary journey check.
 *
 * A run MUST fail specifically on the canary journey while other real journeys pass —
 * distinguishing a genuine mutation-control catch from an UNEXPLAINED_RED where everything
 * fails for an unrelated reason (e.g. the app being entirely unreachable), which proves
 * nothing about the control firing correctly.
 *
 * @param {string} canaryJourneyId
 * @param {Array<{journeyId: string, status: 'PASS'|'FAIL'}>} journeyResults
 * @returns {{passed: boolean, reason: string}}
 */
export function checkCanaryMutationControl(canaryJourneyId, journeyResults) {
  const canary = journeyResults.find((j) => j.journeyId === canaryJourneyId);
  if (!canary) {
    return { passed: false, reason: `canary journey "${canaryJourneyId}" was not found in this run's results — the seeded control was never executed` };
  }
  if (canary.status !== 'FAIL') {
    return { passed: false, reason: `canary journey "${canaryJourneyId}" reported ${canary.status}, not FAIL — the mutation control did not fire` };
  }
  const others = journeyResults.filter((j) => j.journeyId !== canaryJourneyId);
  const otherFailures = others.filter((j) => j.status === 'FAIL');
  if (others.length > 0 && otherFailures.length === others.length) {
    return { passed: false, reason: `all ${others.length} non-canary journeys also failed — this is UNEXPLAINED_RED (everything failing for an unrelated reason), not proof the canary control specifically fired` };
  }
  return { passed: true, reason: `canary journey failed as expected while ${others.length - otherFailures.length}/${others.length} other journeys passed` };
}

/**
 * Fence two-sidedness (v), scoped per LEAD-validation gap M3/H3: the "cannot reach real users"
 * half is declared-and-asserted within the venture's own CI, not a factory-side guarantee (no
 * cross-venture mechanism for asserting non-reachability of a venture's real end-user surfaces
 * exists anywhere in this codebase today — see synthetic-actor-guard.js's undereferenced
 * exclusion_predicate_ref).
 *
 * @param {{canExerciseApp: boolean, exclusionPredicateDeclared: boolean, exclusionPredicateAssertedInVentureCi: boolean}} evidence
 * @returns {{passed: boolean, reason: string}}
 */
export function assertFenceTwoSidedness({ canExerciseApp, exclusionPredicateDeclared, exclusionPredicateAssertedInVentureCi }) {
  if (!canExerciseApp) {
    return { passed: false, reason: 'fence did not demonstrate it CAN exercise the live app' };
  }
  if (!exclusionPredicateDeclared || !exclusionPredicateAssertedInVentureCi) {
    return { passed: false, reason: 'the "cannot reach real users" half is not declared and asserted within the venture\'s own CI — this SD does not provide a factory-side guarantee of non-reachability' };
  }
  return { passed: true, reason: 'fence demonstrated both live-app reachability and a venture-CI-asserted non-reachability declaration' };
}

/**
 * (FR-4) Classify a failing journey as venture-defect or factory-defect. A failure in the UAT
 * MECHANISM ITSELF (e.g. the fencing/control-pack checks above erroring, or the walk never
 * reaching the venture at all) is factory-defect; a failure in the venture's OWN behavior
 * (a journey step executed and observed a real, wrong app response) is venture-defect.
 *
 * @param {{mechanismError: boolean, journeyExecuted: boolean}} failure
 * @returns {'venture_defect'|'factory_defect'}
 */
export function classifyUatFailure({ mechanismError, journeyExecuted }) {
  if (mechanismError || !journeyExecuted) return 'factory_defect';
  return 'venture_defect';
}

export default {
  checkMinimumAssertionManifest,
  generateProbeNonce,
  assertLiveDeploymentBinding,
  computeSubstantiveEvidenceHash,
  checkCanaryMutationControl,
  assertFenceTwoSidedness,
  classifyUatFailure,
};
