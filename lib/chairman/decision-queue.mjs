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
  return { rank, label: RANK_LABEL[rank] || 'low', escalated: rank < baseRank };
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
