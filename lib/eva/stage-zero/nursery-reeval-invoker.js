/**
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 (FR-6) — the scheduled invoker.
 *
 * FR-6 is BREAK 3's measured root cause: nothing repeats the promotion path without a human.
 * venture-monitor.js:267 registers a job literally named `nursery_reevaluation`, but
 * _nurseryReEvaluation queries eva_ventures and never touches venture_nursery, and its only
 * entry point is archived and referenced by nothing. The single wired traversal is a manual UI
 * dialog. So the nursery has had a scheduler-shaped hole with a scheduler-shaped name in it.
 *
 * THIS MODULE DECIDES NOTHING ITSELF, WHICH IS THE POINT. Eligibility comes from FR-1's
 * applyPendingNurseryPredicate and the row shape comes from FR-5's buildNurseryReevalRequest.
 * A scheduler that re-derived "which rows are due" would become the FOURTH disagreeing predicate
 * — the exact defect FR-1 existed to remove. It composes; it does not reimplement.
 *
 * ATTRIBUTION IS NOT A PARAMETER. The principal is read from the registry rather than accepted
 * from the caller, so there is no argument a scheduler could pass that attributes a witness row
 * to a human.
 *
 * CORRECTION (security review SEC-3, HIGH-VALUE CATCH). An earlier version of this comment
 * claimed buildNurseryReevalRequest enforces AC-10 "independently — a second lock on the same
 * door". THAT WAS FALSE and is retracted rather than quietly deleted. Both this module and the
 * builder validate against whatever `registeredPrincipals` is INJECTED, so they are one lock
 * with one key: a single dep injection defeats AC-9 and AC-10 together. The seam exists for
 * tests and no production caller uses it (scripts/nursery-reeval-invoker.mjs passes {supabase}
 * alone), so enforcement here is genuinely CODE-REVIEW-ONLY. Saying so plainly is the point —
 * a safety claim that overstates its own guarantee is worse than no claim, because the next
 * reader stops looking. The durable fix is a BEFORE INSERT trigger requiring a registered
 * principal for headless strategies; that is DB work and is not in this module's gift.
 */

import {
  NURSERY_PENDING_COLUMNS,
  applyPendingNurseryPredicate,
} from './venture-nursery.js';
import {
  buildNurseryReevalRequest,
  REGISTERED_SERVICE_PRINCIPALS,
  NURSERY_REEVAL_STRATEGY,
} from './nursery-reeval-request.js';

/**
 * Statuses that mean "this request is still going to be acted on".
 *
 * PROBED AGAINST THE LIVE ENUM, NOT ASSUMED — and the first version of this line was WRONG.
 * It read ['pending','processing'] and Postgres rejected the query outright: invalid input
 * value for enum stage_zero_status: "processing". The unit tests did not catch it because they
 * mock the .in() call, so they validated my assumption rather than the database; only running
 * the real CLI against the real schema surfaced it. Probing each candidate individually,
 * stage_zero_status admits: pending, claimed, in_progress, completed, dismissed, failed —
 * 'processing' and 'running' are not members. The three below are the not-yet-terminal ones.
 */
export const OPEN_REQUEST_STATUSES = Object.freeze(['pending', 'claimed', 'in_progress']);

/**
 * Is there already an open nursery_reeval request for this candidate?
 *
 * WHY THIS EXISTS AND WHY IT IS NOT OPTIONAL. The processor polls every 30s and the invoker is
 * scheduled; without this the invoker enqueues a fresh duplicate on EVERY tick for as long as the
 * candidate stays unpromoted, because enqueueing does not itself change next_evaluation_at. That
 * is an unbounded queue of identical work whose first symptom is a bill, not an error. The
 * dedupe key is (strategy, nursery_id) rather than nursery_id alone so an unrelated path holding
 * a request for the same candidate does not suppress ours.
 */
export function hasOpenRequestFor(rows, nurseryId) {
  return (rows || []).some((r) => {
    const m = r && r.metadata ? r.metadata : {};
    return m.strategy === NURSERY_REEVAL_STRATEGY && m.nursery_id === nurseryId;
  });
}

/**
 * Select the next due nursery candidate and enqueue one correctly-shaped Stage-0 request.
 *
 * Returns a verdict object rather than throwing on the ordinary "nothing to do" paths, because a
 * scheduler that exits non-zero on an empty queue trains its operator to ignore it.
 *
 * @param {object}  [opts]
 * @param {Date|string} [opts.now] injectable clock, threaded to the FR-1 predicate
 * @param {boolean} [opts.dryRun=false] resolve + build + validate, but do NOT insert
 * @param {object}  deps
 * @param {object}  deps.supabase
 * @param {string[]} [deps.registeredPrincipals] test seam ONLY; production reads the registry
 * @returns {Promise<{enqueued:boolean, reason:string, nurseryId?:string, request?:object}>}
 */
export async function invokeNurseryReeval(opts = {}, deps = {}) {
  const {
    supabase,
    registeredPrincipals = REGISTERED_SERVICE_PRINCIPALS,
    logger = console,
  } = deps;
  const { now, dryRun = false } = opts;

  if (!supabase) throw new Error('supabase client is required');

  // Fail BEFORE reading the nursery. A registry with no principal means this scheduler has no
  // honest author, and discovering that after selecting a candidate would log a candidate we
  // were never able to act on — which reads like a selection bug rather than a config gap.
  const principal = registeredPrincipals[0];
  if (!principal) {
    return { enqueued: false, reason: 'no_registered_service_principal' };
  }

  const { data: due, error: dueErr } = await applyPendingNurseryPredicate(
    supabase.from('venture_nursery').select(NURSERY_PENDING_COLUMNS),
    { now },
  ).limit(1);
  if (dueErr) throw new Error(`nursery selection failed: ${dueErr.message}`);
  if (!due || due.length === 0) {
    return { enqueued: false, reason: 'no_due_candidates' };
  }

  const candidate = due[0];

  // SCOPED SERVER-SIDE (security review SEC-6). This previously fetched EVERY open request and
  // filtered in JS, which meant the PostgREST 1000-row cap could silently truncate the result —
  // and a truncated dedupe read returns "no duplicate" for a duplicate that exists, reviving the
  // unbounded queue this check is the only guard against. Filtering on the two metadata keys
  // that define the dedupe identity makes the result set at most a handful of rows, so the cap
  // is unreachable rather than merely unlikely. .limit(1) because existence is the whole question.
  const { data: open, error: openErr } = await supabase
    .from('stage_zero_requests')
    .select('id, metadata, status')
    .in('status', OPEN_REQUEST_STATUSES)
    .eq('metadata->>strategy', NURSERY_REEVAL_STRATEGY)
    .eq('metadata->>nursery_id', candidate.id)
    .limit(1);
  // A failed dedupe read must NOT fall through to enqueueing. "I could not tell whether a
  // duplicate exists" is not "no duplicate exists", and the failure mode of guessing is the
  // unbounded queue this check exists to prevent.
  if (openErr) throw new Error(`open-request read failed: ${openErr.message}`);
  // Re-checked in JS as well as in the query. Belt-and-braces is cheap here and keeps the dedupe
  // SEMANTIC in one testable place, so a future change to the server-side filter cannot silently
  // widen what counts as a duplicate without this predicate disagreeing.
  if (hasOpenRequestFor(open, candidate.id)) {
    return { enqueued: false, reason: 'already_queued', nurseryId: candidate.id };
  }

  // RESIDUAL, STATED RATHER THAN PAPERED OVER (SEC-6): this is read-then-insert, so two invokers
  // racing can both read zero and both insert. The workflow `concurrency` group serialises
  // Actions runs but NOT a concurrent manual CLI run, and no unique index backs it. Closing it
  // properly needs a partial unique index on (metadata->>'nursery_id') WHERE status IN
  // (open statuses) — a migration, and migrations here are chairman-gated, so it is recorded
  // rather than smuggled in. Blast radius of the residual is a duplicate request, not a
  // duplicate promotion: the queue processor claims rows before draining them.

  // Throws UnregisteredPrincipalError if the registry ever drifts — AC-10's own guard, kept in
  // the path rather than trusted to have been checked above.
  const request = buildNurseryReevalRequest(
    { requestedBy: principal, nurseryId: candidate.id },
    { registeredPrincipals },
  );

  if (dryRun) {
    return { enqueued: false, reason: 'dry_run', nurseryId: candidate.id, request };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('stage_zero_requests')
    .insert(request)
    .select('id')
    .single();
  if (insErr) throw new Error(`enqueue failed: ${insErr.message}`);

  logger.log?.(`[nursery-reeval-invoker] enqueued ${inserted.id} for nursery ${candidate.id}`);
  return { enqueued: true, reason: 'enqueued', nurseryId: candidate.id, requestId: inserted.id, request };
}
