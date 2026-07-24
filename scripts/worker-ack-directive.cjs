#!/usr/bin/env node
/**
 * Worker-side ACK of a coordinator_directive once genuinely actioned — QF-20260724-556.
 *
 * A coordinator_directive addressed to a WORKER (target_session=<worker session id>) has
 * NO worker-side ack path today: DIRECTIVE_KINDS deliberately blocks any auto-ack in
 * surfaceCoordinatorMessages (scripts/worker-checkin.cjs L487-502), so an actioned
 * directive resurfaces on EVERY /checkin forever. This is the sanctioned worker-side ack:
 * once a worker has genuinely acted on a coordinator_directive, it stamps acknowledged_at
 * (closes the read-ack split) plus payload.actioned_at/actioned_by (mirrors
 * lib/coordinator/adam-action-ack.cjs's two-stage-ack marker convention) on the SAME row.
 * Unlike chairman_directive_ack (a broadcast), a coordinator_directive is a single
 * per-worker delivery, so no new reply row is needed — closing the original row suffices.
 *
 * Usage:
 *   node scripts/worker-ack-directive.cjs --id <message_id> [--note "<text>"]
 */
'use strict';

const { getServiceClient, DIRECTIVE_KINDS } = require('../lib/fleet/worker-status.cjs');

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

async function ackDirective(supabase, id, { note = null, sessionId = null } = {}) {
  const { data: row, error: readError } = await supabase
    .from('session_coordination')
    .select('id, payload, target_session, acknowledged_at')
    .eq('id', id)
    .single();
  if (readError || !row) {
    throw Object.assign(new Error(`row not found for id=${id}${readError ? `: ${readError.message}` : ''}`), { code: 'NOT_FOUND' });
  }

  const kind = row.payload && row.payload.kind;
  if (!kind || !DIRECTIVE_KINDS.includes(kind)) {
    throw Object.assign(
      new Error(`refusing to ack — payload.kind='${kind}' is not a DIRECTIVE_KIND (this path is reserved for genuine directives, never advisory rows)`),
      { code: 'NOT_A_DIRECTIVE' }
    );
  }
  if (sessionId && row.target_session && row.target_session !== sessionId) {
    throw Object.assign(
      new Error(`refusing to ack — row target_session=${row.target_session} does not match this session (${sessionId})`),
      { code: 'WRONG_SESSION' }
    );
  }
  if (row.acknowledged_at) {
    return { alreadyAcked: true, acknowledgedAt: row.acknowledged_at, kind };
  }

  const actionedAt = new Date().toISOString();
  const mergedPayload = Object.assign({}, row.payload || {}, { actioned_at: actionedAt, actioned_by: sessionId });
  if (note) mergedPayload.actioned_note = String(note);

  const { error: updateError } = await supabase
    .from('session_coordination')
    .update({ acknowledged_at: actionedAt, payload: mergedPayload })
    .eq('id', id);
  if (updateError) throw Object.assign(new Error(updateError.message), { code: 'UPDATE_FAILED' });

  return { alreadyAcked: false, acknowledgedAt: actionedAt, kind };
}

async function main() {
  const argv = process.argv.slice(2);
  const id = argVal(argv, '--id');
  const note = argVal(argv, '--note');
  if (!id) {
    console.error('Usage: node scripts/worker-ack-directive.cjs --id <message_id> [--note "<text>"]');
    process.exit(2);
  }

  const supabase = getServiceClient();
  try {
    const result = await ackDirective(supabase, id, { note, sessionId: process.env.CLAUDE_SESSION_ID || null });
    if (result.alreadyAcked) {
      console.log(`worker-ack-directive: id=${id} already acknowledged at ${result.acknowledgedAt} (idempotent no-op).`);
    } else {
      console.log(`✓ coordinator_directive acknowledged: id=${id} kind=${result.kind} actioned_at=${result.acknowledgedAt}`);
    }
  } catch (e) {
    console.error(`worker-ack-directive: ${(e && e.message) || e}`);
    process.exit(1);
  }
}

module.exports = { ackDirective };

if (require.main === module) {
  main();
}
