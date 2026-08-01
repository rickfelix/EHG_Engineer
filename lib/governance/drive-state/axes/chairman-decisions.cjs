/**
 * AXIS 1 — CHAIRMAN DECISIONS. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-4.
 *
 * "Surfaced / packaged / retried / resolved."
 *
 * THIS AXIS DOES NOT CONSUME age_escalated, AND THAT IS THE WHOLE POINT.
 * The obvious implementation reuses effectivePriority().escalated, and an existing convention in
 * lib/chairman/decision-layman.mjs actively tells adapters to "reuse the view's authoritative
 * age_escalated flag (do NOT recompute the 72h rule)". Following that would ship an axis BLIND TO
 * EXACTLY THE DECISIONS THAT MATTER MOST.
 *
 * VERIFIED BY EXECUTION across a priority-by-age matrix: priority='critical' returns
 * escalated:false at 1h, 71h, 73h, 100h and 1000h. The cause is structural, at
 * lib/chairman/decision-queue.mjs — `rank = Math.max(1, baseRank - bump)` and
 * `escalated: rank < baseRank`. For critical, baseRank is 1, the floor absorbs the bump, and the
 * comparison is 1 < 1. FALSE BY CONSTRUCTION, at any age. The same expression is replicated in SQL,
 * so the view's age_escalated column carries the identical hole.
 *
 * A both-directions test written against a `normal`-priority seed would pass while every CRITICAL
 * decision reported CLEAR forever — which is why FR-4's first acceptance criterion is a
 * critical-priority stalled case and why the test drives the FULL matrix.
 *
 * So this axis computes age DIRECTLY against the exported AGE_ESCALATION_HOURS threshold, which
 * behaves identically for every priority class. It reuses the repo's number, not its verdict.
 *
 * THE POPULATION IS UNTRUSTED. chairman_pending_decisions is a UNION whose Source 5 reads the
 * feedback table, and the anon INSERT policy there constrains source_type ONLY — no severity, no
 * status, no rate limit — so an unauthenticated party can create unbounded blocking critical rows
 * with attacker-controlled text (proven live, routed separately as critical). The decisions skill
 * renders that text into an agent's context verbatim. Every citation therefore goes through
 * safeCitation, which bounds length and strips control characters.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');
const { safeCitation } = require('../render.cjs');

const AXIS = 'chairman_decisions';

/** Reused from lib/chairman/decision-queue.mjs (AGE_ESCALATION_HOURS = 72). The NUMBER is sound;
 *  the VERDICT built on it is not, for the reason in the header. */
const STALE_AFTER_HOURS = 72;

/** The four sub-states the SD names that do not exist as queryable state. Each is reported
 *  UNMEASURABLE rather than invented: 'surfaced' and 'packaged' have no column anywhere;
 *  'resolved' is derivable only as a set-difference nobody computes; and 'retried' is hardcoded
 *  inert.
 *
 *  THE GROUNDS FOR 'retried' WERE WRONG IN THE FIRST VERSION OF THIS FILE AND ARE CORRECTED HERE.
 *  It cited 20260721_chairman_decisions_channel_STAGED.sql as the deferred schema. That file is
 *  real and it is unapplied, but it has TWO executable lines and adds exactly ONE column — an
 *  SMS-vs-console audit attribute for SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B. It says nothing
 *  about resurfacing. A correct file:line that does not establish the inference drawn from it is
 *  the failure mode this SD is about, committed inside it; caught by teammate blast-radius on a
 *  re-derivation I asked for, and re-verified here.
 *
 *  THE CORRECT GROUNDS ARE STRONGER, because they do not depend on a migration at all:
 *    - chairman_decisions has 36 live columns; none match /resurf|surfac|retr|reopen|revisit/.
 *    - resurface_count and last_resurfaced_at appear in NO migration in database/migrations/ —
 *      staged or applied. This is not a deferred schema; the columns were never designed.
 *    - The concept lives in JS over a DIFFERENT table. sms_outbound_obligations has 17 live
 *      columns and no resurface sink either; `attempts` is provider send-attempts, explicitly not
 *      re-surfaces (decision-scheduler/index.js:18-19).
 *    - markResurfaced is an explicit documented no-op at
 *      lib/comms/adam-outbound/decision-scheduler/index.js:87-91.
 *  So 'retried' stays UNMEASURABLE even if every staged migration were applied tomorrow. */
const UNMEASURABLE_SUBSTATES = Object.freeze(['surfaced', 'packaged', 'retried', 'resolved']);

async function fetch(supabase, { now } = {}) {
  // The VIEW, not the table — querying chairman_pending_decisions' underlying table returns 0 rows.
  const { data, error } = await supabase
    .from('chairman_pending_decisions')
    .select('id, title, priority, created_at, blocking');
  if (error) throw new Error('chairman-decisions: query failed: ' + error.message);
  return { pending: data || [], now };
}

/**
 * Pure. Age is computed here from two timestamps, never read off a precomputed flag.
 */
function classify(state, clock) {
  if (!state || !Array.isArray(state.pending)) {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'no_decision_population',
      citation: 'chairman-decisions: pending query returned nothing to classify',
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }

  const staleMs = STALE_AFTER_HOURS * 3600 * 1000;
  const aged = [];
  let undatable = 0;
  for (const row of state.pending) {
    const created = row && row.created_at ? Date.parse(row.created_at) : NaN;
    if (!Number.isFinite(created)) { undatable += 1; continue; }
    const hours = Math.round((clock - created) / 3600000);
    // NOTE: no priority term. A critical decision aged past the threshold is stalled for the same
    // reason a low one is — the bug being avoided is precisely a priority-dependent blind spot.
    if (clock - created > staleMs) aged.push({ id: row.id, title: row.title, priority: row.priority, hours });
  }

  if (state.pending.length === 0) {
    return {
      axis: AXIS, state: STATE.CLEAR, citation: 'chairman-decisions: 0 pending decisions',
      owed: 0, in_motion: 0, stalled: 0, action_taken: ACTION.NONE
    };
  }
  if (undatable === state.pending.length) {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'no_parseable_created_at',
      citation: `chairman-decisions: all ${state.pending.length} pending rows lack a parseable created_at — age cannot be computed`,
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }

  const sub = `sub-states ${UNMEASURABLE_SUBSTATES.join('/')} are UNMEASURABLE (no columns exist)`;
  if (aged.length > 0) {
    const worst = aged.slice().sort((a, b) => b.hours - a.hours).slice(0, 3);
    return {
      axis: AXIS, state: STATE.STALLED,
      citation: safeCitation(`chairman-decisions: ${aged.length} of ${state.pending.length} pending past ${STALE_AFTER_HOURS}h — ` +
        worst.map((d) => `${d.priority}@${d.hours}h "${String(d.title || '').slice(0, 40)}"`).join(', ') + `; ${sub}`, 400),
      owed: aged.length, in_motion: state.pending.length - aged.length, stalled: aged.length,
      // A pending decision is by definition not yet acted on, and there is no artifact to cite.
      action_taken: ACTION.NONE
    };
  }
  return {
    axis: AXIS, state: STATE.CLEAR,
    citation: safeCitation(`chairman-decisions: ${state.pending.length} pending, none past ${STALE_AFTER_HOURS}h` +
      (undatable ? `, ${undatable} undatable` : '') + `; ${sub}`, 400),
    owed: 0, in_motion: state.pending.length, stalled: 0, action_taken: ACTION.NONE
  };
}

module.exports = { AXIS, fetch, classify, STALE_AFTER_HOURS, UNMEASURABLE_SUBSTATES };
