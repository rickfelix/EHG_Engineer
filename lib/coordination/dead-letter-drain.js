/**
 * Dead-letter coordination drain — QF-20260721-737 (Solomon ledger 18a680c7 + Adam 5644b8d1,
 * coordinator-verified 2026-07-21). Pure classification for orphaned session_coordination inbound.
 *
 * A "dead-letter" row is an UNACKNOWLEDGED session_coordination row whose target_session is a
 * released/stale/deleted (non-live) session — it will never be actioned and just ages. This module
 * decides, per row, whether to RETARGET it to a live role-successor (so an orphaned advisory/consult
 * to a dead ROLE session still gets actioned) or STAMP it drained (pure noise, or a message to a dead
 * WORKER that has no role-succession and is therefore moot).
 *
 * NEVER bulk-ack blindly: role-targeted high-value kinds are retargeted, not buried. Grounded on the
 * verified 2026-07-21 set (adam_advisory := ADAM->dead-coordinator; coordinator_reply/directive :=
 * COORD->dead-worker).
 */

// High-value kinds that must reach a live successor (or be drained as moot if their recipient was a
// dead worker with no role-succession) — never silently aged. Per the QF's verified high-value list.
export const HIGH_VALUE_KINDS = Object.freeze([
  'directive', 'chairman_directive', 'solomon_consult', 'adam_advisory',
  'coordinator_reply', 'coordinator_directive', 'coordinator_request',
]);

/**
 * How stale a heartbeat may be before its session stops counting as live.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1c.
 *
 * Deliberately generous against the ~30s heartbeat cadence. The two errors are NOT symmetric:
 * calling a DEAD session live merely defers its rows to the next sweep tick, whereas calling a
 * LIVE session dead retargets a working seat's mail away from it. The threshold is set where the
 * cheap error absorbs the ambiguity.
 */
export const LIVENESS_STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Is this session live? Decided ONLY by heartbeat recency.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1c.
 *
 * WHY NOT status/is_alive, which is what this replaces: both are ASSERTIONS a session writes about
 * itself and may never revise, and both were measured wrong in BOTH directions against the live
 * fleet. The dominant dead-letter target held 91.6% of the entire backlog while reporting
 * status='active' and is_alive=true with a 45-hour-stale heartbeat — so a drain keyed on status
 * classified nine-tenths of its own problem as "live backlog" and skipped it. Four of the dead
 * targets stopped within eight minutes of each other in one mass reap that updated none of their
 * statuses; nothing in the row ever gets around to admitting the session died.
 *
 * A heartbeat cannot be left stale-but-true: staleness IS the signal, so the proof decays on its
 * own rather than depending on a dying process to file its own death notice.
 *
 * Fails CLOSED — absent, unparseable or missing timestamps yield NOT live. Absence of proof of
 * life is not proof of life; defaulting the other way would reinstate the defect for every target
 * that never wrote a heartbeat.
 *
 * @param {{heartbeat_at?:string, last_tool_at?:string}|null|undefined} session
 * @param {{nowMs?:number, staleAfterMs?:number}} [opts]
 * @returns {boolean}
 */
export function isSessionLive(session, { nowMs = Date.now(), staleAfterMs = LIVENESS_STALE_AFTER_MS } = {}) {
  if (!session) return false;
  // The NEWER of the two: a session busy in a tool call is alive even if its heartbeat lags.
  let newest = -Infinity;
  for (const field of ['heartbeat_at', 'last_tool_at']) {
    const raw = session[field];
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest === -Infinity) return false;
  return (nowMs - newest) <= staleAfterMs;
}

// kind -> the ROLE the message is addressed to (empirically verified on the 2026-07-21 set).
const KIND_TARGET_ROLE = Object.freeze({
  adam_advisory: 'coordinator', // [ADAM -> COORD] advisories
  solomon_consult: 'solomon',
});

/**
 * Resolve the ROLE the row is addressed to (coordinator|solomon|adam) if it is a role-to-role message
 * with a live successor; otherwise null (worker/unknown -> no succession -> drain).
 * @param {{payload?:object, message_type?:string, subject?:string}} row
 */
export function resolveTargetRole(row = {}) {
  const kind = (row.payload && row.payload.kind) || row.message_type || '';
  if (KIND_TARGET_ROLE[kind]) return KIND_TARGET_ROLE[kind];
  // Fall back to the role that appears AFTER an explicit arrow in the subject ("... -> COORD").
  // Only the recipient (post-arrow) counts — a leading "[COORD->worker]" sender prefix must NOT match.
  const subj = (row.subject || '').toUpperCase();
  const arrow = subj.match(/(?:->|→)\s*(COORD(?:INATOR)?|SOLOMON|ADAM)\b/);
  if (arrow) return arrow[1].startsWith('COORD') ? 'coordinator' : arrow[1].toLowerCase();
  return null;
}

/**
 * Classify ONE dead-letter row.
 * @param {{payload?:object, message_type?:string, subject?:string, target_session?:string}} row
 * @param {{ successors: Record<string,string|undefined> }} ctx  successors: role -> live session id
 * @returns {{ action:'retarget'|'stamp', successor:string|null, role:string|null, reason:string }}
 */
export function classifyDeadLetterRow(row = {}, { successors = {} } = {}) {
  const kind = (row.payload && row.payload.kind) || row.message_type || '(none)';
  const role = resolveTargetRole(row);
  const successor = role ? successors[role] : undefined;
  const isHighValue = HIGH_VALUE_KINDS.includes(kind);
  // Retarget only a role-to-role high-value message whose live successor exists and differs from the dead target.
  if (isHighValue && role && successor && successor !== row.target_session) {
    return { action: 'retarget', successor, role, reason: `high-value ${kind} orphaned to dead ${role}; retargeted to live ${role}` };
  }
  // Everything else drains: pure noise, or a high-value message to a dead WORKER (no role-succession -> moot).
  const why = isHighValue
    ? `${kind} targeted a dead worker (no role-succession) -> moot; drained`
    : `noise kind ${kind} to a non-live session -> drained`;
  return { action: 'stamp', successor: null, role, reason: why };
}

/** Summarize a set of classified rows into per-action / per-kind counts (for the audit summary). */
export function summarizeDrain(classified = []) {
  const out = { retarget: 0, stamp: 0, byKind: {} };
  for (const c of classified) {
    if (!c) continue;
    out[c.action] = (out[c.action] || 0) + 1;
    const k = c.kind || '(none)';
    out.byKind[k] = out.byKind[k] || { retarget: 0, stamp: 0 };
    out.byKind[k][c.action] += 1;
  }
  return out;
}
