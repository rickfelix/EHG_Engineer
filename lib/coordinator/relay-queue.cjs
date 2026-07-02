/**
 * Coordinator relay-request queue.
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1.
 *
 * Incident #1 root cause: a relay-request ("relay X to peer Y") was processed
 * best-effort inside the coordinator's active conversational thread — no tracked
 * queue, no delivery confirmation — so it silently dropped when the coordinator was
 * busy (Solomon ran ~2h below baseline before the chairman noticed). This module
 * gives the coordinator a TRACKED queue it drains deliberately.
 *
 * Storage: a session_coordination row, message_type='INFO' (existing enum — no
 * ALTER TYPE), payload.kind=PAYLOAD_KINDS.RELAY_REQUEST, payload.correlation_id.
 * No new table, no migration (independently re-verified via raw SQL).
 *
 * Split mirrors two existing prior-art files:
 *   selectUndrained()      — PURE, zero IO, mirrors lib/coordinator/receipts.cjs's
 *                            findUndelivered() selector shape.
 *   enqueueRelayRequest()/
 *   drainRelayQueue()      — IO wiring, mirrors lib/coordinator/pending-question-timer.cjs's
 *                            pure-core + IO-tick split. Fail-open: a drain error never
 *                            throws out of the tick.
 *
 * @module lib/coordinator/relay-queue
 */

'use strict';

const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');

function toMs(ts) {
  const ms = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * PURE: select relay_request rows that have not yet been drained (no receipt
 * contract markers set). Mirrors receipts.cjs's read_at/payload.actioned_at
 * DELIVERED/ACTIONED contract — a drained row has BOTH acknowledged_at and
 * payload.actioned_at set by drainRelayQueue().
 *
 * @param {Array<object>} rows - session_coordination rows (any payload.kind; filtered here)
 * @param {object} [opts] - { now=Date.now() }
 * @returns {Array<object>} undrained relay_request rows, oldest first, each annotated with ageMs
 */
function selectUndrained(rows, opts = {}) {
  const { now = Date.now() } = opts;
  return (rows || [])
    .filter((r) => r && r.payload && r.payload.kind === PAYLOAD_KINDS.RELAY_REQUEST)
    .filter((r) => !r.acknowledged_at && !(r.payload && r.payload.actioned_at))
    .map((r) => ({ ...r, ageMs: now - toMs(r.created_at) }))
    .sort((a, b) => b.ageMs - a.ageMs);
}

/**
 * PURE: build the payload for a new relay_request row.
 * @param {{ relayTo: string, body: string, correlationId: string }} opts
 * @returns {object}
 */
function buildRelayRequestPayload({ relayTo, body, correlationId }) {
  return {
    kind: PAYLOAD_KINDS.RELAY_REQUEST,
    relay_to: relayTo,
    body: body || null,
    correlation_id: correlationId,
  };
}

/**
 * PURE: build the payload for the confirm-back row (FR-2's reply-direction half).
 * A NEW correlated row, not a mutation of the request row — this is what makes the
 * confirm itself independently delivery-tracked via the existing findUndelivered()
 * machinery in receipts.cjs.
 * @param {{ correlationId: string, requestRowId: string, relayedTo: string }} opts
 * @returns {object}
 */
function buildRelayConfirmPayload({ correlationId, requestRowId, relayedTo }) {
  return {
    kind: PAYLOAD_KINDS.RELAY_CONFIRM,
    correlation_id: correlationId,
    confirm_relay_of: requestRowId,
    relayed_to: relayedTo,
  };
}

/**
 * IO: enqueue a new relay_request row. Fail-loud on the insert itself (the caller
 * needs to know if the request was NOT queued), but never throws for a downstream
 * side-effect failure since there are none at enqueue time.
 * @param {object} supabase
 * @param {{ senderSession: string, relayTo: string, body: string, correlationId: string }} opts
 * @returns {Promise<{ data: object|null, error: string|null }>}
 */
async function enqueueRelayRequest(supabase, { senderSession, relayTo, body, correlationId }) {
  const payload = buildRelayRequestPayload({ relayTo, body, correlationId });
  const subject = `[RELAY_REQUEST -> ${relayTo}] ${String(body || '').slice(0, 60)}`;
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .insert({
        sender_session: senderSession,
        sender_type: 'coordinator',
        target_session: senderSession, // the coordinator is both the queue-owner and the initial target; drain reassigns delivery
        message_type: 'INFO',
        subject,
        body: payload.body,
        payload,
      })
      .select('id, created_at')
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: String((e && e.message) || e) };
  }
}

/**
 * IO: load candidate relay_request rows (payload.kind filter pushed to the DB).
 * FAIL-SOFT: returns [] on any error, never throws.
 * @param {object} supabase
 * @returns {Promise<Array<object>>}
 */
async function loadQueuedRelayRequests(supabase) {
  try {
    const { data } = await supabase
      .from('session_coordination')
      .select('id, sender_session, target_session, payload, acknowledged_at, created_at')
      .eq('payload->>kind', PAYLOAD_KINDS.RELAY_REQUEST)
      .order('created_at', { ascending: true })
      .limit(50);
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * IO: drain ONE relay_request row — perform the actual relay (a caller-supplied
 * sender function so this module never hardcodes which peer-send mechanism to use),
 * then write BOTH FR-2 receipt markers: the same-row ACTIONED marker
 * (acknowledged_at + payload.actioned_at) AND a NEW correlated relay_confirm row.
 *
 * Claims the row BEFORE calling sendRelay via a conditional UPDATE ... WHERE
 * acknowledged_at IS NULL ... RETURNING id (the `.select('id')` on the update).
 * Two ticks racing on the same undrained row both pass selectUndrained()'s filter,
 * but only ONE can win this atomic claim — the loser sees zero affected rows and
 * backs off WITHOUT ever calling sendRelay (closes the concurrent-tick double-send
 * gap: previously sendRelay ran BEFORE the idempotency guard, so a race window
 * existed between two ticks both sending the same relay). A sendRelay failure
 * un-claims the row (resets acknowledged_at to null) so a future tick retries it —
 * a transient send failure must never permanently strand the request, which is
 * exactly incident #1's failure mode this SD exists to close.
 *
 * @param {object} supabase
 * @param {object} row - a row from selectUndrained()/loadQueuedRelayRequests()
 * @param {(row:object) => Promise<{ok:boolean, error?:string}>} sendRelay - performs the actual delivery
 * @param {number} [now]
 * @returns {Promise<{ ok: boolean, confirmed: boolean, error?: string }>}
 */
async function drainOne(supabase, row, sendRelay, now = Date.now()) {
  try {
    const nowIso = new Date(now).toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from('session_coordination')
      .update({ acknowledged_at: nowIso })
      .eq('id', row.id)
      .is('acknowledged_at', null) // idempotency guard — only the still-undrained row
      .select('id');
    if (claimErr) return { ok: false, confirmed: false, error: `claim failed: ${claimErr.message}` };
    if (!claimed || claimed.length === 0) {
      return { ok: true, confirmed: false, error: 'already claimed by another tick' };
    }

    const sendResult = await sendRelay(row);
    if (!sendResult || !sendResult.ok) {
      // Un-claim so a future tick retries — never permanently strand on a transient send failure.
      await supabase.from('session_coordination').update({ acknowledged_at: null }).eq('id', row.id);
      return { ok: false, confirmed: false, error: (sendResult && sendResult.error) || 'sendRelay failed' };
    }

    const mergedPayload = Object.assign({}, row.payload, { actioned_at: nowIso });
    const { error: updErr } = await supabase
      .from('session_coordination')
      .update({ payload: mergedPayload })
      .eq('id', row.id);
    if (updErr) return { ok: false, confirmed: false, error: `receipt update failed: ${updErr.message}` };

    const confirmPayload = buildRelayConfirmPayload({
      correlationId: row.payload.correlation_id,
      requestRowId: row.id,
      relayedTo: row.payload.relay_to,
    });
    const { error: confirmErr } = await supabase
      .from('session_coordination')
      .insert({
        sender_session: row.target_session,
        sender_type: 'coordinator',
        target_session: row.sender_session,
        message_type: 'INFO',
        subject: `[RELAY_CONFIRM] relayed to ${row.payload.relay_to}`,
        payload: confirmPayload,
      });
    if (confirmErr) return { ok: true, confirmed: false, error: `confirm insert failed: ${confirmErr.message}` };

    return { ok: true, confirmed: true };
  } catch (e) {
    return { ok: false, confirmed: false, error: String((e && e.message) || e) };
  }
}

/**
 * Tick entry point. Loads queued relay_request rows, drains each via the pure
 * selector + drainOne, and returns a structured summary. FAIL-OPEN end to end —
 * never throws out of the tick.
 * @param {object} supabase
 * @param {(row:object) => Promise<{ok:boolean, error?:string}>} sendRelay
 * @param {object} [opts] - { now }
 * @returns {Promise<{ drained: number, failed: number, errors: Array<string> }>}
 */
async function drainRelayQueue(supabase, sendRelay, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const candidates = await loadQueuedRelayRequests(supabase);
    const undrained = selectUndrained(candidates, { now });
    let drained = 0;
    let failed = 0;
    const errors = [];
    for (const row of undrained) {
      const result = await drainOne(supabase, row, sendRelay, now);
      if (result.ok) drained++;
      else { failed++; if (result.error) errors.push(result.error); }
    }
    return { drained, failed, errors };
  } catch (e) {
    return { drained: 0, failed: 0, errors: [String((e && e.message) || e)] };
  }
}

module.exports = {
  selectUndrained,
  buildRelayRequestPayload,
  buildRelayConfirmPayload,
  enqueueRelayRequest,
  loadQueuedRelayRequests,
  drainOne,
  drainRelayQueue,
};
