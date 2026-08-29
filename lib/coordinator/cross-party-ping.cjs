'use strict';

// QF-20260719-138: emit the mechanical cross-party ping row directly from the quiet-tick
// scripts instead of instructing the agent to hand-insert a byte-identical row every tick.
// The coordinator hand-running the same insert each tick tripped the RCA tiered-enforcement
// 3x-same-target guard — a mechanical, byte-identical insert is a script's job, not an agent's.
// payload.kind='cross_party_ping' is an EXCLUDED_KIND (excluded from the Adam advisory drain),
// so a coordinator->adam ping passes the dispatch Adam-inbox-kind guard. Fail-soft: any
// resolve/insert error is logged and swallowed so a quiet tick never throws on a ping.

const { getActiveCoordinatorId } = require('./resolve.cjs');
const { getActiveAdamId } = require('./adam-identity.cjs');
const { insertCoordinationRow } = require('./dispatch.cjs');

/**
 * Emit a coordinator<->adam cross-party ping row for a real salient-state delta.
 * @param {object} sb - Supabase client
 * @param {{ from: 'coordinator'|'adam', fields: string[] }} opts - sender role + the changed fields
 * @param {{ getActiveCoordinatorId?: Function, getActiveAdamId?: Function, insertCoordinationRow?: Function }} [deps]
 *   - injectable overrides (tests only; defaults to the real resolvers/inserter)
 * @returns {Promise<boolean>} true if a ping row was inserted, false if skipped/failed (fail-soft)
 */
async function emitCrossPartyPing(sb, { from, fields }, deps = {}) {
  const resolveCoordinatorId = deps.getActiveCoordinatorId || getActiveCoordinatorId;
  const resolveAdamId = deps.getActiveAdamId || getActiveAdamId;
  const doInsert = deps.insertCoordinationRow || insertCoordinationRow;
  try {
    const [coordinatorId, adamId] = await Promise.all([
      resolveCoordinatorId(sb),
      resolveAdamId(sb, {}),
    ]);
    const sender = from === 'adam' ? adamId : coordinatorId;
    const target = from === 'adam' ? coordinatorId : adamId;
    if (!sender || !target) return false; // can't resolve both live parties — skip (fail-soft)
    const to = from === 'adam' ? 'coordinator' : 'adam';
    const now = new Date().toISOString();
    const payload = {
      kind: 'cross_party_ping',
      reason: fields,
      body: `${from} salient-state delta (${fields.join(',')}) — mechanical cross-party ping; awareness only, no action required.`,
      sent_at: now,
    };

    // QF-20260829-311: dedupe at WRITE on (kind, salient-key), mirroring adam-advisory-store.cjs's
    // find-then-JSONB-merge-update idiom. Only an UNACKNOWLEDGED prior ping for the SAME salient
    // key (the sorted changed-field set) is a candidate for in-place update -- an already-read row
    // means a genuinely new occurrence of the delta, which still earns its own fresh row (never
    // silently swallowed). A DIFFERENT salient key always gets its own row (fixture: two distinct
    // deltas both surface).
    const salientKey = [...fields].sort().join(',');
    const { data: candidates } = await sb
      .from('session_coordination')
      .select('id, payload')
      .eq('sender_session', sender)
      .eq('target_session', target)
      .eq('payload->>kind', 'cross_party_ping')
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    const match = (candidates || []).find((row) => {
      const reason = Array.isArray(row.payload?.reason) ? row.payload.reason : [];
      return [...reason].sort().join(',') === salientKey;
    });

    if (match) {
      const { error } = await sb.from('session_coordination').update({ payload }).eq('id', match.id);
      if (error) throw error;
      return true;
    }

    await doInsert(sb, {
      sender_session: sender,
      target_session: target,
      message_type: 'INFO',
      subject: `cross-party ping ${from}->${to} — salient delta: ${fields.join(',')}`,
      payload,
      created_at: now,
    });
    return true;
  } catch (e) {
    console.error(`QUIET_TICK_PING_ERROR=${from} ${e && e.message ? e.message : e}`);
    return false;
  }
}

module.exports = { emitCrossPartyPing };
