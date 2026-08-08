/**
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 (FR-5, AC-9)
 *
 * Builds the stage_zero_requests row that carries a named nursery candidate into
 * Stage-0. Zero rows with strategy=nursery_reeval have ever been enqueued, so this
 * shape has never been exercised — every default below is a live trap:
 *
 *   - stage-zero-queue-processor.js:206 defaults metadata.path to 'blueprint_browse'.
 *     A request that omits path does NOT fail; it silently runs a different path and
 *     produces a completed row that proves nothing.
 *   - stage-zero-queue-processor.js:232 defaults metadata.strategy to 'trend_scanner'.
 *     Same failure mode, one layer down: strategy-only requests never reach the nursery.
 *   - The must_reference_blueprint_venture_or_path CHECK is satisfied by metadata->>'path'
 *     alone, so a path-less nursery request is rejected by the database rather than
 *     mis-dispatched — but a path-with-wrong-strategy request passes the CHECK.
 *
 * Both keys are therefore written explicitly and asserted, never defaulted.
 */

export const NURSERY_REEVAL_PATH = 'discovery_mode';
export const NURSERY_REEVAL_STRATEGY = 'nursery_reeval';

/**
 * Registered non-human principals permitted to author a Stage-0 witness row.
 *
 * ALLOWLIST, NOT A DENYLIST — deliberate. stage_zero_requests.requested_by is
 * `uuid NOT NULL REFERENCES auth.users(id)`, and the only auth.users row that has ever
 * appeared in that column is the chairman's own account. A denylist of known humans
 * fails OPEN: the next human account added is silently acceptable. An allowlist fails
 * CLOSED, which is the correct direction for an attribution guard.
 *
 * PROVISIONED 2026-08-05T00:14:34Z. svc-stage-zero-invoker@execholdings.ai, id 13851be2,
 * user_metadata.service_principal=true / human=false, created via
 * scripts/one-off/provision-stage-zero-service-principal.mjs and CONFIRMED PRESENT in auth.users
 * by read-back (4 rows, this one flagged as the only service account). Before it existed
 * auth.users held three rows and NONE was a service account, so every one of the four
 * stage_zero_requests rows ever written carries the chairman's own id.
 *
 * ⚠ THE ENTRY THIS REPLACED WAS A GHOST, and the correction matters more than the swap.
 * This list previously held '27e0e91e-35f7-4617-bbb9-932408db80f1' under a comment reading
 * "PROVISIONED 2026-07-26. svc-stage-zero-invoker@ehg.dev". Measured 2026-08-04: NO SUCH ROW
 * EXISTED in auth.users. The comment asserted an act that had not happened (or had been undone),
 * and nothing could detect that, because a SOURCE-CONTROLLED list of DATABASE ids drifts
 * independently of the database and membership-in-a-list is a different question from
 * existence-of-a-principal. An EMPTY registry fails CLOSED and announces itself; that DANGLING
 * one failed GREEN — every guard above the FK reported healthy while the insert would have died
 * on requested_by REFERENCES auth.users(id). It sat unnoticed from 07-26 to 08-04.
 *
 * THAT is why invokeNurseryReeval now verifies EXISTENCE at runtime immediately before the
 * insert (see defaultPrincipalExists) rather than trusting this list. This comment is evidence,
 * not proof — the runtime check is the proof, precisely because the last version of this comment
 * was confidently wrong.
 *
 * A NOTE ON THE PRIOR FRAMING, corrected rather than silently dropped: this comment used to
 * say the empty registry was pending a "chairman decision". FR-5 does not say that — it says
 * "a service identity OR a service-role write path must be established as part of this FR",
 * i.e. it is the implementer's to establish, and it offers two routes. Coordinator ruling
 * a59441f4 (2026-07-26T18:07Z) authorised the FIRST route explicitly and ruled out the second:
 * the service-role bypass would satisfy the write while leaving requested_by pointing at a
 * human, fixing the mechanism and keeping the defect AC-9 exists to prevent.
 *
 * The registry stays SOURCE-CONTROLLED rather than runtime-mutable: an allowlist that can be
 * appended at runtime is not an allowlist. Registering an id is a reviewable diff, deliberately.
 */
export const REGISTERED_SERVICE_PRINCIPALS = Object.freeze([
  '13851be2-caf9-4aed-a1a4-c506daa94e0e', // svc-stage-zero-invoker@execholdings.ai
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UnregisteredPrincipalError extends Error {
  constructor(requestedBy, registered = REGISTERED_SERVICE_PRINCIPALS) {
    super(
      `requested_by ${requestedBy || '(missing)'} is not a registered service principal. ` +
      'AC-9 forbids attributing a Stage-0 witness row to a human account, and the registry ' +
      `currently holds ${registered.length} entr${registered.length === 1 ? 'y' : 'ies'}. ` +
      'Provision a service principal in auth.users and register its id before enqueuing.'
    );
    this.name = 'UnregisteredPrincipalError';
    this.requestedBy = requestedBy ?? null;
  }
}

/**
 * Build the insert payload for a nursery re-evaluation request.
 *
 * @param {Object} params
 * @param {string} params.requestedBy - service-principal auth.users id (must be registered)
 * @param {string} params.nurseryId - venture_nursery row this request is raised for
 * @param {number} [params.candidateCount=1] - FR-5 targets ONE named row, so default 1
 * @param {Object} [params.constraints={}]
 * @param {Object} [deps] - injection seam, matching the (params, deps) convention used
 *   throughout stage-zero. `registeredPrincipals` defaults to the frozen registry (SEC-7: no
 *   longer EMPTY — it holds the provisioned service principal as of 2026-07-26),
 *   so PRODUCTION callers get fail-closed behaviour without opting in. Only tests pass a
 *   list; a production call site that supplies its own registry is defeating AC-9 and
 *   should be treated as a review failure.
 * @returns {Object} row shaped for supabase.from('stage_zero_requests').insert(...)
 */
export function buildNurseryReevalRequest({
  requestedBy,
  nurseryId,
  candidateCount = 1,
  constraints = {},
} = {}, { registeredPrincipals = REGISTERED_SERVICE_PRINCIPALS } = {}) {
  // Array.isArray FIRST (security review SEC-3): String.prototype.includes does SUBSTRING
  // matching, so a caller passing a string registry would let any substring of it through —
  // an allowlist that silently degrades into a fuzzy match is worse than no allowlist.
  if (!Array.isArray(registeredPrincipals) || !registeredPrincipals.includes(requestedBy)) {
    throw new UnregisteredPrincipalError(requestedBy, registeredPrincipals || []);
  }
  if (!nurseryId || !UUID_RE.test(nurseryId)) {
    // FR-5 names its target by UUID because five nursery rows tie at score 90 and one of
    // them is the live first-revenue venture — "the 90-scorer" is not a referent.
    throw new Error(`nurseryId must be a UUID naming the target row; got ${JSON.stringify(nurseryId)}`);
  }

  return {
    requested_by: requestedBy,
    prompt: `Nursery re-evaluation for candidate ${nurseryId}`,
    metadata: {
      path: NURSERY_REEVAL_PATH,
      strategy: NURSERY_REEVAL_STRATEGY,
      candidate_count: candidateCount,
      constraints,
      nursery_id: nurseryId,
    },
  };
}
