/**
 * orphan-reroute-sweep.js — SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D (Child C).
 *
 * An ORPHAN is an unread session_coordination row whose target resolves to a known
 * singleton role (solomon/adam/coordinator, via the same resolveTargetRole identity
 * resolution dispatch.cjs's send-time warn already uses) but whose payload.kind is NOT
 * in that role's recognized drain set (lib/fleet/drain-set-registry.js, Child A/-B) —
 * i.e. it validly sent but structurally nobody will ever drain it (the 61.9%
 * orphan-traffic / 9-of-20-dead-kinds finding this SD family exists to close).
 *
 * ACTION: re-type + re-target the row to the coordinator under a kind the coordinator
 * DOES drain (REROUTE_TO_KIND, a DIRECTIVE_KIND — deliver-not-consume, never auto-acked),
 * mirroring the succession module's drainCoordinatorOutbound/parkAtBroadcast idiom
 * (idempotent read_at IS NULL re-target, per-row fail-soft, never throws). Every reroute
 * stamps payload.reroute = {from_kind, to_kind, from_target, to_target, from_role, at,
 * by_sweep} — a durable audit trail, never a silent rewrite. Idempotent by construction:
 * once rerouted, a row's kind is coordinator-recognized, so it never matches the orphan
 * check again on a later tick.
 *
 * REPEAT-OFFENDER ALARM: when a (role, kind) pair has now been rerouted
 * REPEAT_OFFENDER_THRESHOLD+ times within the window, a single higher-visibility
 * coordinator_request row fires alongside the reroute — a repeatedly-orphaning sender is
 * a live bug (wrong kind, or a role's drain set genuinely needs the kind registered),
 * not something the sweep should quietly paper over forever.
 */
import dispatchModule from '../coordinator/dispatch.cjs';
import resolveModule from '../coordinator/resolve.cjs';
import { resolveRecognizedKinds as defaultResolveRecognizedKinds } from './drain-set-registry.js';
import workerStatusModule from './worker-status.cjs';

const { resolveTargetRole: defaultResolveTargetRole, insertCoordinationRow: defaultInsertCoordinationRow } = dispatchModule;
const { getActiveCoordinatorId: defaultGetActiveCoordinatorId } = resolveModule;
const { TERMINAL_REPLY_KINDS } = workerStatusModule;

export const REROUTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14d
export const REROUTE_TO_KIND = 'coordinator_reminder';
export const REPEAT_OFFENDER_THRESHOLD = 2;
const SWEEP_SENDER = 'orphan-reroute-sweep';

/** Pure: is `kind` an orphan given the target role's recognized kinds? */
export function isOrphanCandidate({ kind, recognizedKinds }) {
  if (!kind) return false;
  if (TERMINAL_REPLY_KINDS.includes(kind)) return false;
  return !recognizedKinds.includes(kind);
}

/**
 * Run one sweep tick. Never throws — every failure mode (candidate-read error, a single
 * row's update racing/erroring, an unresolvable coordinator target, an alarm-send failure)
 * degrades to a fail-soft skip so one bad row never blocks the rest of the tick.
 * @param {object} supabase
 * @param {{nowMs?:number, windowMs?:number, limit?:number, resolveTargetRole?:Function,
 *   resolveRecognizedKinds?:Function, getActiveCoordinatorId?:Function,
 *   insertRow?:Function}} [opts] - test seams injectable
 * @returns {Promise<{swept:number, rerouted:number, alarmed:number, error?:string}>}
 */
export async function sweepOrphanRows(supabase, {
  nowMs = Date.now(),
  windowMs = REROUTE_WINDOW_MS,
  limit = 200,
  resolveTargetRole = defaultResolveTargetRole,
  resolveRecognizedKinds = defaultResolveRecognizedKinds,
  getActiveCoordinatorId = defaultGetActiveCoordinatorId,
  insertRow = defaultInsertCoordinationRow,
} = {}) {
  if (!supabase) return { swept: 0, rerouted: 0, alarmed: 0 };
  const since = new Date(nowMs - windowMs).toISOString();

  const [candRes, priorRes] = await Promise.all([
    supabase.from('session_coordination').select('id, target_session, payload, created_at')
      .is('read_at', null).gte('created_at', since).limit(limit),
    supabase.from('session_coordination').select('payload')
      .eq('payload->>kind', REROUTE_TO_KIND).gte('created_at', since).limit(1000),
  ]);
  if (candRes.error) return { swept: 0, rerouted: 0, alarmed: 0, error: candRes.error.message };

  // Repeat-offender tally: count PRIOR reroutes per (from_role, from_kind), built once from
  // already-rerouted rows so a busy tick doesn't re-query per candidate.
  const offenderCounts = new Map();
  for (const r of (priorRes && priorRes.data) || []) {
    const reroute = r.payload && r.payload.reroute;
    if (!reroute || !reroute.from_role || !reroute.from_kind) continue;
    const key = `${reroute.from_role}:${reroute.from_kind}`;
    offenderCounts.set(key, (offenderCounts.get(key) || 0) + 1);
  }

  let coordinatorTarget = 'broadcast-coordinator'; // owed-state sentinel when no coordinator is live
  try {
    const live = await getActiveCoordinatorId(supabase);
    if (live) coordinatorTarget = live;
  } catch { /* fail-open to the sentinel */ }

  const rows = (candRes.data) || [];
  let rerouted = 0;
  let alarmed = 0;

  for (const row of rows) {
    const kind = row.payload && typeof row.payload === 'object' ? row.payload.kind : null;
    if (!kind || (row.payload && row.payload.reroute)) continue; // untyped, or already processed

    let role;
    try { role = await resolveTargetRole(supabase, row.target_session, null); } catch { role = null; }
    if (!role) continue; // unresolved identity (e.g. a worker session) — out of this sweep's scope

    let recognized;
    try { recognized = await resolveRecognizedKinds({ supabase, role }); } catch { recognized = []; }
    if (!isOrphanCandidate({ kind, recognizedKinds: recognized })) continue;

    const offenderKey = `${role}:${kind}`;
    const priorCount = offenderCounts.get(offenderKey) || 0;
    const nowIso = new Date(nowMs).toISOString();
    const mergedPayload = {
      ...row.payload,
      kind: REROUTE_TO_KIND,
      reroute: { from_kind: kind, to_kind: REROUTE_TO_KIND, from_target: row.target_session, to_target: coordinatorTarget, from_role: role, at: nowIso, by_sweep: true },
    };

    try {
      const { data: updated, error: updErr } = await supabase
        .from('session_coordination')
        .update({ target_session: coordinatorTarget, payload: mergedPayload })
        .eq('id', row.id)
        .is('read_at', null) // idempotency gate — never re-move a row already delivered/consumed
        .select('id');
      if (updErr || !updated || !updated.length) continue; // fail-soft: lost a race, or a DB error
    } catch {
      continue; // per-row fail-soft
    }

    rerouted += 1;
    offenderCounts.set(offenderKey, priorCount + 1);

    if (priorCount + 1 >= REPEAT_OFFENDER_THRESHOLD) {
      try {
        await insertRow(supabase, {
          sender_session: process.env.CLAUDE_SESSION_ID || SWEEP_SENDER,
          target_session: coordinatorTarget,
          message_type: 'INFO',
          subject: `Repeat-offender orphan: role '${role}' kind '${kind}' rerouted ${priorCount + 1}x in ${Math.round(windowMs / 86400000)}d`,
          payload: {
            kind: 'coordinator_request',
            body: `orphan-reroute-sweep has now rerouted ${priorCount + 1} row(s) addressed to role '${role}' carrying unrecognized kind '${kind}'. A sender keeps emitting a kind that role never drains — fix the sender, or register the kind in role_drain_sets if it should be recognized. Most recent offending row: ${row.id}.`,
          },
        }, { targetRoleHint: 'coordinator' });
        alarmed += 1;
      } catch { /* fail-soft: the reroute itself already succeeded and is not rolled back */ }
    }
  }

  return { swept: rows.length, rerouted, alarmed };
}

export default { sweepOrphanRows, isOrphanCandidate, REROUTE_WINDOW_MS, REROUTE_TO_KIND, REPEAT_OFFENDER_THRESHOLD };
