/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): the single, pure, tested bridge between the S19
 * leo_bridge build outcome and EVERY gate that decides whether a venture may advance past
 * Stage 19. No DB access, no side effects — so the truth table is unit-testable in isolation
 * and all consumers (the FR-1 entry hard-gate, the two S19 entry-gate bridge paths, the
 * _advanceStage choke-point, the post-stage hook log) share ONE decision and cannot diverge.
 *
 * Background (RCA 7610876f / a14ff998): the prior code re-derived "is this idempotent?" inline
 * as `!bridge.created && errors.length === 0` at multiple sites. That overloaded sentinel made a
 * silent zero-SDs failure indistinguishable from a legitimate no-op, so the S19 exit gate advanced
 * an unbuilt venture (DataDistill reached S20 with a 26-SD all-draft tree). This module replaces
 * that re-derivation with an explicit outcome enum + one hold/advance decision.
 */

/** The five canonical outcomes of running the S19 leo_bridge for a venture. */
export const S19_BRIDGE_OUTCOME = Object.freeze({
  CREATED: 'created',                 // SDs newly created (or seeded_repo proceed) — a tree now exists
  NOOP_EXISTS: 'noop_exists',         // idempotent: the orchestrator/tree already exists
  NOOP_EMPTY: 'noop_empty',           // nothing to build: 0 sd_bridge_payloads
  ZERO_SDS_FAILURE: 'zero_sds_failure', // payloads present but convertSprintToSDs produced 0 SDs (the schism)
  VISION_MISSING: 'vision_missing',   // no chairman-approved L2 vision (assertVentureVisionReady)
});

const VISION_ERR_RE = /VENTURE_L2_VISION|draft_seed|no L2 vision/i;
const EXISTS_ERR_RE = /already exists/i;

/**
 * Classify a `_runS19Bridge` result into exactly one canonical outcome.
 *
 * The discriminant that the old inline code lacked is `payloadCount`: a `created:false` with
 * empty errors means NOOP_EMPTY when there were zero payloads (nothing to build → advance) but
 * ZERO_SDS_FAILURE when payloads were present (the build silently produced nothing → must hold).
 * Idempotent "the orchestrator already exists" re-runs are recognised by an `orchestratorKey`
 * being present even though `created` is false (matching the existing FR-2 test contract).
 *
 * @param {{created?: boolean, errors?: any[], orchestratorKey?: string|null}} bridgeResult
 * @param {number} payloadCount  number of sd_bridge_payloads the bridge saw (0 = nothing to build)
 * @returns {string} one of S19_BRIDGE_OUTCOME
 */
export function classifyBridgeOutcome(bridgeResult, payloadCount) {
  if (bridgeResult && bridgeResult.created === true) return S19_BRIDGE_OUTCOME.CREATED;

  const errs = (bridgeResult && bridgeResult.errors) || [];
  const errStr = JSON.stringify(errs);

  // A genuine vision-missing failure carries the assertVentureVisionReady message (it is caught
  // inside convertSprintToSDs and returned, not thrown — so derive it from the error text, never
  // via try/catch which would mask the {created:false} return and re-open the silent-advance bug).
  if (VISION_ERR_RE.test(errStr)) return S19_BRIDGE_OUTCOME.VISION_MISSING;

  // Idempotent no-op: either the explicit "already exists" message, or an existing orchestrator
  // key surfaced with no failure errors (the canonical idempotency contract from FR-2).
  if (EXISTS_ERR_RE.test(errStr)) return S19_BRIDGE_OUTCOME.NOOP_EXISTS;
  if (bridgeResult && bridgeResult.orchestratorKey && errs.length === 0) {
    return S19_BRIDGE_OUTCOME.NOOP_EXISTS;
  }

  // created:false, no idempotency/vision signal. payloadCount is the load-bearing discriminant:
  if (!payloadCount || payloadCount <= 0) return S19_BRIDGE_OUTCOME.NOOP_EMPTY; // nothing to build
  return S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE;                                   // built nothing from N payloads
}

/**
 * THE single hold/advance decision for a leo_bridge venture at Stage 19.
 *
 * `buildComplete` is the result of `_isLeoBridgeBuildComplete(ventureId)`:
 *   true  = tree complete (>=1 SD completed, all terminal) OR chairman_override → ADVANCE
 *   null  = NOT a leo_bridge venture → the invariant does not apply → ADVANCE (fall through)
 *   false = leo_bridge but incomplete (0 SDs, any non-terminal, or all-cancelled)
 *
 * When buildComplete===false the outcome enum disambiguates the ONLY case that should still
 * advance: NOOP_EMPTY (0 payloads → genuinely nothing to build). Every other incomplete state —
 * CREATED-but-draft, NOOP_EXISTS-but-in-progress, ZERO_SDS_FAILURE, VISION_MISSING — HOLDS at S19.
 *
 * @param {string} outcome  a S19_BRIDGE_OUTCOME value
 * @param {boolean|null} buildComplete
 * @returns {boolean} true = HOLD at S19 (do not advance); false = ADVANCE
 */
export function shouldHoldAtS19(outcome, buildComplete) {
  if (buildComplete === true) return false;   // complete tree OR chairman_override → advance
  if (buildComplete === null) return false;   // not a leo_bridge venture → never hold here
  // buildComplete === false (or any non-true/non-null): leo_bridge, incomplete.
  if (outcome === S19_BRIDGE_OUTCOME.NOOP_EMPTY) return false; // nothing to build → advance
  return true;                                 // every other incomplete state → HOLD
}
