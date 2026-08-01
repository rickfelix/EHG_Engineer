/**
 * lib/chairman/decision-queue.mjs — pure helpers for the chairman decision queue.
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001.
 *
 * CONSTITUTIONAL RULE: nothing in this module (or its callers) auto-decides.
 * Recommendations/defaults are display-only; age escalation changes VISIBILITY
 * (sort order) only. Every decision requires an explicit human-supplied
 * decision argument and results in exactly ONE source write.
 *
 * Deliberately dependency-free (no supabase import): the CLI injects writers,
 * so the unit tier can test routing/sorting without any DB plumbing.
 */

// Both pure and dependency-free, so importing it preserves this module's no-DB contract.
import { ageClockFor, isHeld } from './decision-disposition.mjs';

export const PRIORITY_RANK = { critical: 1, high: 2, normal: 3, low: 4 };
const RANK_LABEL = { 1: 'critical', 2: 'high', 3: 'normal', 4: 'low', 5: 'low' };
export const AGE_ESCALATION_HOURS = 72;

/** Map a priority label to its sort rank (unknown -> 5, sorts last). */
export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? 5;
}

/**
 * Compute the effective priority of a pending row: pending > 72h sorts ONE
 * priority class higher. Mirrors the SQL in chairman_pending_decisions
 * (20260611_chairman_decision_queue.sql) so pre-migration rows render the same.
 * @param {{priority?: string, created_at?: string|Date}} row
 * @param {Date} [now]
 * @returns {{rank: number, label: string, escalated: boolean}}
 */
export function effectivePriority(row, now = new Date()) {
  const baseRank = priorityRank(row?.priority);
  const created = row?.created_at ? new Date(row.created_at) : null;
  const ageMs = created && !Number.isNaN(created.getTime()) ? now.getTime() - created.getTime() : 0;
  const bump = ageMs > AGE_ESCALATION_HOURS * 3600 * 1000 ? 1 : 0;
  const rank = Math.max(1, baseRank - bump);
  // ESCALATION IS A PROPERTY OF AGE, NOT OF RANK MOVEMENT.
  // This was `rank < baseRank`, which conflated the two. The rank floor is correct — critical
  // cannot outrank critical — but for critical baseRank is 1, so the floor absorbed the bump and
  // the comparison was 1 < 1: FALSE AT ANY AGE. Every critical row was structurally unmarkable,
  // and arm 4 of chairman_pending_decisions hardcodes priority='critical', so every row that arm
  // emits was blind by construction. Four of seven live rows were affected, one at 15 days.
  // `bump` already encodes exactly the question being asked: did this row cross the age threshold.
  // Sort order is unaffected — sortPending() reads `rank`, which is unchanged.
  return { rank, label: RANK_LABEL[rank] || 'low', escalated: bump > 0 };
}

/**
 * Sort pending rows: blocking DESC, effective priority rank ASC, created_at ASC.
 * Pure; does not mutate the input.
 */
export function sortPending(rows, now = new Date()) {
  return [...(rows || [])].sort((a, b) => {
    const ab = a?.blocking ? 1 : 0, bb = b?.blocking ? 1 : 0;
    if (ab !== bb) return bb - ab;
    const ar = effectivePriority(a, now).rank, br = effectivePriority(b, now).rank;
    if (ar !== br) return ar - br;
    return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
  });
}

/**
 * Render one pending row as the CLI line. SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001, FR-6/TR-8.
 *
 * EXTRACTED FROM scripts/chairman-decisions.mjs SO IT CAN BE ASSERTED AGAINST. That script is a
 * top-level-await CLI that builds its own client, with no injection seam, so the rendered surface
 * — the thing the chairman actually reads — had no test. This function is pure.
 *
 * THE FIX IT CARRIES: the queue aged every row from created_at, so a decision the chairman deferred
 * yesterday still presented as 56 days old and escalating on that basis. Measured live, ALL SEVEN
 * pending rows carry a deferral, every one within ~1.3 days — the entire "stale and escalating"
 * presentation was an artifact of the wrong clock. When a disposition exists, BOTH the displayed age
 * and the escalation marker clock from the deferral.
 *
 * WHY THE DISPOSITION OVERRIDES THE VIEW'S BOOLEAN, which is the load-bearing line here: the live
 * path reads `row.age_escalated ?? ep.escalated`, and false is not nullish, so the VIEW governs the
 * marker. The view cannot see deferrals at all. Deferring to it would leave the corrected clock
 * invisible — the record would exist, be read, and change nothing, which is the defect this SD is
 * about. So a deferral-corrected verdict wins; with no deferral, the view's value is untouched.
 *
 * @param {object} row a chairman_pending_decisions row
 * @param {{dispositions?: Map, now?: Date}} [opts] dispositions from indexDispositions()
 * @returns {string}
 */
export function renderPendingLine(row, { dispositions = null, now = new Date() } = {}) {
  const clock = ageClockFor(row, dispositions);
  const deferred = clock.source === 'deferral';
  // Age the row from whichever clock governs it. Passing a synthetic created_at keeps
  // effectivePriority's contract untouched rather than threading an override through it.
  const effRow = deferred ? { ...row, created_at: clock.since } : row;
  const ep = effectivePriority(effRow, now);

  const label = deferred ? ep.label : (row.effective_priority ?? ep.label);
  const escalated = deferred ? ep.escalated : (row.age_escalated ?? ep.escalated);

  const pri = label + (escalated ? '^ (age-escalated)' : '');
  const block = row.blocking ? ' BLOCKING' : '';
  const held = isHeld(row, dispositions, now) ? ' HELD' : '';
  const mark = deferred ? ` (deferred ${formatAge(clock.since, now)} ago${held})` : '';
  return `[${formatAge(clock.since, now)}] [${row.decision_type}:${row.id}] [${pri}${block}] ${row.title}` +
    (row.recommendation ? ' — ' + row.recommendation : '') + mark;
}

/** Render an age like '3d' / '7h' / '12m'. */
export function formatAge(createdAt, now = new Date()) {
  const ms = Math.max(0, now - new Date(createdAt || now));
  const h = ms / 3600000;
  if (h >= 48) return Math.floor(h / 24) + 'd';
  if (h >= 1) return Math.floor(h) + 'h';
  return Math.floor(ms / 60000) + 'm';
}

export const USAGE = `Usage:
  node scripts/chairman-decisions.mjs list [--json]
  node scripts/chairman-decisions.mjs decide <decision_type:id> <approve|reject|defer|custom...> --rationale "..."

decision_type routes the single source write:
  chairman_approval  -> fn_chairman_decide RPC on chairman_decisions
  flag_review        -> resolve the feedback row (status + resolution note)
  flag_enablement    -> record the chairman call as a feedback row (flag NOT toggled)
  okr_acceptance     -> acceptPendingOkrGeneration / reject the generation log row
  (escalation / gate_decision are read-only here — decide them in their own tooling)

NO decision is ever taken without an explicit decision argument.`;

/**
 * Parse CLI argv (after `node script`). Returns either a command object or
 * { error } — never throws. decide WITHOUT an explicit decision is an error
 * (TS-3 never-auto-decide).
 */
export function parseArgs(argv) {
  const args = [...(argv || [])];
  const cmd = args.shift();
  if (cmd === 'list') {
    return { command: 'list', json: args.includes('--json') };
  }
  if (cmd === 'decide') {
    let rationale = null;
    const ri = args.indexOf('--rationale');
    if (ri !== -1) { rationale = args[ri + 1] ?? null; args.splice(ri, 2); }
    const target = args.shift();
    const decision = args.shift();
    if (!target || !target.includes(':')) return { error: 'decide requires <decision_type:id>', usage: USAGE };
    if (!decision) return { error: 'decide requires an explicit decision (approve|reject|defer|custom). Nothing auto-decides.', usage: USAGE };
    const sep = target.indexOf(':');
    return {
      command: 'decide',
      decisionType: target.slice(0, sep),
      id: target.slice(sep + 1),
      decision,
      rationale,
    };
  }
  return { error: 'unknown command: ' + (cmd || '(none)'), usage: USAGE };
}

/**
 * Route a decision to EXACTLY ONE injected writer. Pure routing — the writers
 * do the IO. Returns { writer, result } or { error }.
 *
 * @param {{decisionType: string, id: string, decision: string, rationale?: string}} d
 * @param {{
 *   chairmanDecide: (id, action, rationale) => any,        // fn_chairman_decide RPC
 *   resolveFeedback: (id, status, note) => any,            // feedback row resolve
 *   recordFlagCall: (id, decision, rationale) => any,      // feedback row recording flag call
 *   okrAccept: (id) => any,                                // acceptPendingOkrGeneration
 *   okrReject: (id, rationale) => any,                     // okr_generation_log -> rejected
 *   recordDeferral: (d) => any,                            // feedback row recording deferral
 * }} writers
 */
export async function routeDecision(d, writers) {
  const { decisionType, id, decision, rationale } = d || {};
  if (!decisionType || !id) return { error: 'missing decision_type:id target' };
  if (!decision) return { error: 'missing explicit decision — nothing auto-decides' };

  // defer is uniform across sources: record the deferral durably (one write);
  // the item REMAINS pending — deferral is a visibility/audit act, not a decision.
  if (decision === 'defer') {
    return { writer: 'recordDeferral', result: await writers.recordDeferral(d) };
  }

  switch (decisionType) {
    case 'chairman_approval': {
      if (decision !== 'approve' && decision !== 'reject') {
        return { error: "chairman_approval supports approve|reject|defer (fn_chairman_decide RPC accepts 'approved'/'rejected')" };
      }
      const action = decision === 'approve' ? 'approved' : 'rejected';
      return { writer: 'chairmanDecide', result: await writers.chairmanDecide(id, action, rationale) };
    }
    case 'flag_review': {
      const status = decision === 'reject' ? 'wont_fix' : 'resolved';
      const note = `[chairman:${decision}] ${rationale || '(no rationale provided)'}`;
      return { writer: 'resolveFeedback', result: await writers.resolveFeedback(id, status, note) };
    }
    case 'flag_enablement':
      // Record the chairman call ONLY — toggling the flag is the flag tooling's job.
      return { writer: 'recordFlagCall', result: await writers.recordFlagCall(id, decision, rationale) };
    case 'okr_acceptance': {
      if (decision === 'approve') return { writer: 'okrAccept', result: await writers.okrAccept(id) };
      if (decision === 'reject') return { writer: 'okrReject', result: await writers.okrReject(id, rationale) };
      return { error: 'okr_acceptance supports approve|reject|defer' };
    }
    case 'escalation':
    case 'gate_decision':
      return { error: decisionType + ' is read-only in this CLI — decide it via its own tooling (coordinator inbox / venture gate flow)' };
    default:
      return { error: 'unknown decision_type: ' + decisionType };
  }
}
