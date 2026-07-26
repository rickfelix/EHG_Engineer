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
 * Empty until a service principal is provisioned (chairman decision, signal e33a6f45).
 * While it is empty this module refuses to build ANY request — that is the intended
 * behaviour, not a gap: it makes "FR-5 has no honest author yet" a runtime fact rather
 * than a line of prose someone can skim past.
 */
export const REGISTERED_SERVICE_PRINCIPALS = Object.freeze([]);

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
 *   throughout stage-zero. `registeredPrincipals` defaults to the frozen empty registry,
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
  if (!registeredPrincipals.includes(requestedBy)) {
    throw new UnregisteredPrincipalError(requestedBy, registeredPrincipals);
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
