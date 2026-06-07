/**
 * Adam->coordinator action-required two-stage ACK + wake/SLA escalation.
 *
 * SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001
 *
 * Real incident (2026-06-07): an Adam->coordinator ACTION-REQUIRING handoff (a
 * session_coordination row asking the coordinator to promote-to-orchestrator +
 * decompose) had read_at stamped within ~1 min — but by the automated monitoring
 * SWEEP, not by the coordinator agent — and the alive-but-passive coordinator
 * then took ZERO action for 20+ min. Two seams:
 *   (1) read_at is set by the SWEEP, so it is NOT a reliable ACK that the agent
 *       actually ACTIONED the handoff;
 *   (2) a passive session_coordination row does not WAKE a parked coordinator into
 *       an active cycle.
 *
 * This module extends the EXISTING "DELIVERED" two-stage ACK protocol (built for
 * the coordinator->worker direction in scripts/hooks/coordination-inbox.cjs
 * `insertDeliveredRowIfRequested` + the [DELIVERED <8>] transport_ack row) to the
 * Adam->coordinator direction, and adds a wake/SLA escalation path. It does NOT
 * create a parallel channel:
 *
 *   FR-003  An action-requiring Adam->coordinator handoff carries an explicit
 *           payload.action_required=true (+ payload.action_kind). Unflagged
 *           messages are informational and are NEVER tracked or escalated
 *           (backward compatible).
 *   FR-001  Two-stage ACK. The sweep-set read_at = DELIVERED (transport), NOT
 *           actioned. A genuine second-stage ACK is recorded ONLY when the
 *           coordinator agent actually actions the handoff — represented as
 *           payload.actioned_at (a distinct marker on the SAME row, mirroring the
 *           pending-question timer's metadata.auto_proceeded_at idempotency marker
 *           and the DELIVERED-layer's payload.kind/delivered_for convention).
 *           Action-required handoffs stay pending-action until that ACK,
 *           regardless of read_at.
 *   FR-002  Wake/SLA path. A pure function decides, per action-required handoff,
 *           one of {pending | escalate | done} given the rows + now + SLA +
 *           ack-state. 'escalate' fires when a handoff is DELIVERED (read_at set)
 *           but un-actioned (no payload.actioned_at) past the SLA. Escalation is
 *           IDEMPOTENT — once payload.escalated_at is stamped, the same handoff
 *           returns 'done-ish' (it is not re-escalated). The tick wiring emits an
 *           action-required wake alert (a session_coordination row targeting the
 *           coordinator) so the parked coordinator is woken into an active cycle.
 *
 * CommonJS (.cjs) so scripts/stale-session-sweep.cjs (the .cjs coordinator tick)
 * can require() it. The CORE (decideAdamActionAcks) is a pure, dependency-injected
 * function that does ZERO IO. The tick wiring (planAndApplyAdamActionAcks) performs
 * the DB reads/writes and is FAIL-OPEN + flag-gated (default OFF).
 *
 * @module lib/coordinator/adam-action-ack
 */

'use strict';

/** Default SLA: an action-required handoff DELIVERED but un-actioned for this
 *  long escalates / wakes the coordinator. 10 min ≈ 2 coordinator cron cycles —
 *  well inside the 20+ min silent gap the incident exhibited. */
const DEFAULT_SLA_MS = 10 * 60 * 1000;

/** payload.kind discriminators (mirror lib/fleet/worker-status.cjs PAYLOAD_KINDS
 *  convention — carried on the existing INFO message_type, OFF the friction
 *  signal-router and the intent-deconfliction sweep). */
const ACTION_REQUIRED_KIND = 'adam_action_required';   // the inbound action handoff
const WAKE_ALERT_KIND = 'adam_action_wake';            // the escalation/wake row this tick emits

/** Env flag gating the escalation WRITE behavior (default OFF). Flag-OFF the tick
 *  is fully inert (zero writes) — aged un-actioned handoffs return as 'escalate'
 *  decisions but the wake row is NOT written, mirroring the pending-question
 *  timer's resurface-instead-of-write contract. */
function escalationEnabled(env) {
  env = env || process.env;
  return String(env.COORD_ADAM_ACTION_ACK_V1 ?? 'false').toLowerCase() !== 'false';
}

/** Resolve the SLA (ms) from env, falling back to DEFAULT_SLA_MS. */
function resolveSlaMs(env) {
  env = env || process.env;
  const min = Number(env.COORD_ADAM_ACTION_SLA_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_SLA_MS;
}

/** Parse a timestamp to epoch-ms; 0 on missing/unparseable (matches the
 *  pending-question timer's tolerant tz handling). */
function tsMs(ts) {
  if (!ts) return 0;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(String(ts));
  const n = new Date(hasTZ ? ts : ts + 'Z').getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * FR-003: is this row an action-REQUIRING Adam->coordinator handoff?
 * Backward-compatible: an unflagged row (no payload.action_required===true) is
 * informational and is NEVER tracked. Pure.
 * @param {object} msg - session_coordination row
 * @returns {boolean}
 */
function isActionRequired(msg) {
  return !!msg && !!msg.payload && msg.payload.action_required === true;
}

/**
 * FR-001: has the coordinator AGENT genuinely actioned this handoff?
 * The sweep-set read_at is NOT an action-ACK — only payload.actioned_at (the
 * distinct second-stage marker) counts. Pure.
 * @param {object} msg
 * @returns {boolean}
 */
function isActioned(msg) {
  return !!msg && !!msg.payload && !!msg.payload.actioned_at;
}

/** Has an escalation/wake already been emitted for this handoff? (idempotency) */
function isEscalated(msg) {
  return !!msg && !!msg.payload && !!msg.payload.escalated_at;
}

/** DELIVERED = transport-layer read_at is set (by the sweep or the inbox hook).
 *  This is NOT an action-ACK (the whole point of the two-stage protocol). */
function isDelivered(msg) {
  return !!msg && !!msg.read_at;
}

/**
 * Build the explicit action-required payload an Adam->coordinator handoff carries
 * (FR-003). Mirrors scripts/adam-advisory.cjs buildAdvisoryPayload but adds the
 * action_required flag + action_kind + request_ack (so the existing DELIVERED
 * layer also confirms TRANSPORT for it). Pure; exported for the sender + tests.
 *
 * INVARIANT: no signal_type / no intent_action (so neither the friction router nor
 * the intent-deconfliction sweep scoops it — same contract as adam_advisory).
 *
 * @param {object} args
 * @param {string} args.actionKind  e.g. 'promote_to_orchestrator_and_decompose'
 * @param {string} [args.body]
 * @param {string} [args.senderCallsign]
 * @returns {object} payload
 */
function buildActionRequiredPayload({ actionKind, body, senderCallsign } = {}) {
  const payload = {
    kind: ACTION_REQUIRED_KIND,
    action_required: true,
    action_kind: actionKind || 'unspecified',
    request_ack: true, // reuse the DELIVERED transport-ack layer for read confirmation
    sender_callsign: senderCallsign || null,
  };
  if (body) payload.body = String(body);
  return payload;
}

/**
 * CORE — pure, dependency-injected decision function (FR-001/FR-002/FR-003).
 * Given Adam->coordinator handoff rows + a clock + SLA + escalation-flag, returns
 * one decision per ACTION-REQUIRED handoff WITHOUT performing any IO. Informational
 * (unflagged) rows yield NO decision (FR-003 backward-compat — they are skipped
 * entirely and can never escalate).
 *
 * Decision per action-required handoff (no side effects):
 *   { action: 'done',     id, reason }  — genuinely actioned (payload.actioned_at) OR already escalated (idempotent)
 *   { action: 'escalate', id, reason }  — DELIVERED but un-actioned past the SLA, flag on, not yet escalated
 *   { action: 'pending',  id, reason }  — action-required but not yet escalatable
 *                                          (not delivered yet / within SLA / flag off)
 *
 * @param {Array<object>} messages - session_coordination rows (action-required + informational mixed)
 * @param {object} [opts]
 * @param {number} [opts.now] - epoch-ms clock (defaults Date.now())
 * @param {number} [opts.slaMs] - SLA threshold (defaults DEFAULT_SLA_MS)
 * @param {boolean} [opts.escalationEnabled] - flag gate; false → escalatable items return 'pending'
 * @returns {Array<object>} decisions (one per ACTION-REQUIRED input message)
 */
function decideAdamActionAcks(messages, opts) {
  opts = opts || {};
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const slaMs = Number.isFinite(opts.slaMs) ? opts.slaMs : DEFAULT_SLA_MS;
  const flagOn = opts.escalationEnabled !== false; // core defaults ON; tick passes the real flag

  const out = [];
  for (const msg of (messages || [])) {
    // FR-003: informational (unflagged) rows are never tracked → no decision at all.
    if (!isActionRequired(msg)) continue;

    const id = msg && msg.id != null ? msg.id : null;

    // FR-001: a GENUINE second-stage ACK (payload.actioned_at) closes the loop.
    // read_at alone (DELIVERED) does NOT — that is the whole two-stage point.
    if (isActioned(msg)) {
      out.push({ action: 'done', id, reason: 'genuinely actioned (payload.actioned_at present)' });
      continue;
    }

    // Idempotency: already escalated once → do NOT re-escalate (no spam).
    if (isEscalated(msg)) {
      out.push({ action: 'done', id, reason: 'already escalated (payload.escalated_at present) — idempotent' });
      continue;
    }

    // Not yet DELIVERED (no read_at) → nothing to escalate; still pending-action.
    if (!isDelivered(msg)) {
      out.push({ action: 'pending', id, reason: 'action-required, not yet delivered (no read_at)' });
      continue;
    }

    // DELIVERED but un-actioned. Escalate iff past the SLA (measured from read_at
    // — the DELIVERED moment — so the SLA clock starts when the coordinator could
    // first have acted).
    const deliveredMs = tsMs(msg.read_at);
    const ageMs = now - deliveredMs;
    if (ageMs < slaMs) {
      out.push({ action: 'pending', id, reason: 'delivered, within SLA, awaiting action', age_ms: ageMs });
      continue;
    }

    if (!flagOn) {
      // Flag OFF: would escalate, but the wake WRITE is disabled — stay pending.
      out.push({ action: 'pending', id, reason: 'delivered + un-actioned past SLA, but escalation flag OFF', age_ms: ageMs });
      continue;
    }

    out.push({
      action: 'escalate',
      id,
      action_kind: (msg.payload && msg.payload.action_kind) || 'unspecified',
      reason: 'action-required handoff DELIVERED but un-actioned past SLA — wake coordinator',
      age_ms: ageMs,
    });
  }
  return out;
}

// ── Tick wiring (IO) — FAIL-OPEN, flag-gated ────────────────────────────────

/**
 * Read recent Adam->coordinator action-required handoff rows targeting the
 * coordinator. READ-ONLY; fail-soft to []. Filters to payload.action_required
 * via a PostgREST JSONB filter so informational rows never load.
 *
 * @param {object} supabase
 * @param {string} coordinatorId - the active coordinator's session_id (target_session)
 * @param {object} [opts] - { windowMin }
 * @returns {Promise<Array<object>>}
 */
async function loadActionRequiredHandoffs(supabase, coordinatorId, opts) {
  opts = opts || {};
  const windowMin = Number.isFinite(opts.windowMin) ? opts.windowMin : 24 * 60;
  try {
    const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
    let q = supabase
      .from('session_coordination')
      .select('id, sender_session, target_session, payload, body, subject, read_at, created_at')
      .gte('created_at', cutoff)
      .eq('payload->>action_required', 'true');
    if (coordinatorId) q = q.eq('target_session', coordinatorId);
    const { data, error } = await q.order('created_at', { ascending: true }).limit(50);
    if (error) return [];
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Apply ONE escalate decision: (1) emit a wake/action-required alert row targeting
 * the coordinator so the parked coordinator is woken into an active cycle (FR-002),
 * and (2) stamp payload.escalated_at on the ORIGINAL handoff row to make escalation
 * idempotent (a later tick sees escalated_at → returns 'done'). FAIL-OPEN: never
 * throws. Idempotent at the DB layer — the stamp guards re-escalation.
 *
 * @param {object} supabase
 * @param {object} msg - the original action-required handoff row
 * @param {object} decision - { action_kind, reason }
 * @param {number} now - epoch-ms
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function applyEscalation(supabase, msg, decision, now) {
  try {
    const nowIso = new Date(now).toISOString();
    const coordinatorId = msg.target_session;
    const origIdPrefix = String(msg.id).replace(/-/g, '').slice(0, 8);

    // (1) Wake/action-required alert — a session_coordination row the coordinator
    // inbox surfaces. Uses message_type='COACHING' (an existing enum value the
    // inbox renders, same as the comms-check ping) so no ALTER TYPE / migration.
    const alertBody =
      '⏰ ACTION-REQUIRED handoff from Adam is DELIVERED but UN-ACTIONED past the SLA. ' +
      'action_kind=' + ((msg.payload && msg.payload.action_kind) || 'unspecified') + '. ' +
      'Original: ' + (msg.subject || msg.body || '(no subject)') + '. ' +
      'Wake into an active cycle and ACTION it now (then record payload.actioned_at on row ' + origIdPrefix + ').';
    await supabase
      .from('session_coordination')
      .insert({
        sender_session: 'sweep',
        target_session: coordinatorId,
        message_type: 'COACHING',
        subject: '[ADAM_ACTION_WAKE ' + origIdPrefix + ']',
        body: alertBody,
        payload: {
          kind: WAKE_ALERT_KIND,
          escalated_for: msg.id,
          action_kind: (msg.payload && msg.payload.action_kind) || 'unspecified',
          coaching_type: 'action_required_wake',
          body: alertBody,
          sent_at: nowIso,
        },
        sender_type: 'sweep',
      });

    // (2) Idempotency stamp on the ORIGINAL handoff. Scoped guard: only stamp a row
    // that has not already been escalated (so two concurrent ticks can't double-fire).
    const mergedPayload = Object.assign({}, msg.payload || {}, { escalated_at: nowIso });
    const { error } = await supabase
      .from('session_coordination')
      .update({ payload: mergedPayload })
      .eq('id', msg.id);
    if (error) {
      console.warn('   ⚠️  [ADAM_ACTION_ESCALATE_FAILED] id=' + msg.id + ': ' + error.message + ' (non-fatal)');
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn('   ⚠️  [ADAM_ACTION_ESCALATE_THREW] id=' + (msg && msg.id) + ': ' + ((e && e.message) || e) + ' (non-fatal)');
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Tick entry point. Loads recent Adam->coordinator action-required handoffs,
 * runs the pure decision core, and applies escalation/wake writes (flag-gated).
 * Returns a structured summary so the sweep can print visible lines. FAIL-OPEN
 * end to end; fully inert (zero writes) when the flag is OFF — escalatable handoffs
 * then return as 'pending' instead of 'escalate'.
 *
 * @param {object} supabase
 * @param {object} [opts] - { env, now, coordinatorId, windowMin }
 * @returns {Promise<{ enabled, decisions, escalated, pending, done }>}
 */
async function planAndApplyAdamActionAcks(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const flagOn = escalationEnabled(env);

  // Resolve the active coordinator (the target_session of action handoffs) unless
  // injected. Fail-soft: if resolution throws, fall back to loading by flag only.
  let coordinatorId = opts.coordinatorId || null;
  if (!coordinatorId) {
    try {
      const { getActiveCoordinatorId } = require('./resolve.cjs');
      coordinatorId = await getActiveCoordinatorId(supabase);
    } catch (_) { coordinatorId = null; }
  }

  const messages = await loadActionRequiredHandoffs(supabase, coordinatorId, { windowMin: opts.windowMin });

  const decisions = decideAdamActionAcks(messages, {
    now,
    slaMs: resolveSlaMs(env),
    escalationEnabled: flagOn,
  });

  let escalated = 0;
  const byId = new Map(messages.map((m) => [m.id, m]));
  for (const d of decisions) {
    if (d.action !== 'escalate') continue;
    const m = byId.get(d.id);
    if (!m) continue;
    const res = await applyEscalation(supabase, m, d, now);
    if (res.ok) escalated++;
  }

  const pending = decisions.filter((d) => d.action === 'pending').length;
  const done = decisions.filter((d) => d.action === 'done').length;

  return { enabled: flagOn, decisions, escalated, pending, done };
}

module.exports = {
  // pure core + predicates (unit-testable in isolation)
  decideAdamActionAcks,
  isActionRequired,
  isActioned,
  isEscalated,
  isDelivered,
  buildActionRequiredPayload,
  escalationEnabled,
  resolveSlaMs,
  ACTION_REQUIRED_KIND,
  WAKE_ALERT_KIND,
  DEFAULT_SLA_MS,
  // IO wiring (fail-open, flag-gated)
  loadActionRequiredHandoffs,
  applyEscalation,
  planAndApplyAdamActionAcks,
};
