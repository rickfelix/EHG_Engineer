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

const { getServiceClient, DIRECTIVE_KINDS, ADVISORY_KINDS } = require('../lib/fleet/worker-status.cjs');

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

/**
 * Shared ack core — SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 / FR-2.
 *
 * Both lanes stamp the SAME row the SAME way; only the ALLOWED KINDS differ. Extracted so the
 * advisory verb cannot drift from the directive one, and so the lane allow-list stays the single
 * thing that distinguishes them — never a second copy of the read/update logic.
 *
 * @param {Object} supabase
 * @param {string} id
 * @param {{allowedKinds: string[], laneLabel: string, refusalCode: string, note?: string, sessionId?: string}} opts
 */
async function ackRow(supabase, id, { allowedKinds, laneLabel, refusalCode, note = null, sessionId = null }) {
  const { data: row, error: readError } = await supabase
    .from('session_coordination')
    .select('id, payload, target_session, acknowledged_at')
    .eq('id', id)
    .single();
  if (readError || !row) {
    throw Object.assign(new Error(`row not found for id=${id}${readError ? `: ${readError.message}` : ''}`), { code: 'NOT_FOUND' });
  }

  const kind = row.payload && row.payload.kind;
  if (!kind || !allowedKinds.includes(kind)) {
    throw Object.assign(
      new Error(`refusing to ack — payload.kind='${kind}' is not a ${laneLabel} (this path is reserved for genuine ${laneLabel === 'DIRECTIVE_KIND' ? 'directives, never advisory rows' : 'advisory rows, never directives'})`),
      { code: refusalCode }
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

/**
 * DIRECTIVE lane. Behaviour is byte-for-byte what it always was: only DIRECTIVE_KINDS are
 * acked here, and an advisory row is still refused. That refusal is correct and deliberate —
 * see ADVISORY_KINDS in lib/fleet/worker-status.cjs for the lane that now has its own verb.
 */
async function ackDirective(supabase, id, opts = {}) {
  return ackRow(supabase, id, {
    ...opts,
    allowedKinds: DIRECTIVE_KINDS,
    laneLabel: 'DIRECTIVE_KIND',
    refusalCode: 'NOT_A_DIRECTIVE',
  });
}

/**
 * ADVISORY lane (coordinator_reply / completion_nudge) — SD-LEO-INFRA-WORKER-REACHABLE-ACK-001.
 * Deliberately a SEPARATE entry point rather than a widened DIRECTIVE_KINDS: a coordinator ruling
 * had no worker-reachable ack at all, so it lingered until some later /checkin drained it.
 */
async function ackAdvisory(supabase, id, opts = {}) {
  return ackRow(supabase, id, {
    ...opts,
    allowedKinds: ADVISORY_KINDS,
    laneLabel: 'ADVISORY_KIND',
    refusalCode: 'NOT_AN_ADVISORY',
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const id = argVal(argv, '--id');
  const note = argVal(argv, '--note');
  if (!id) {
    console.error('Usage: node scripts/worker-ack-directive.cjs --id <message_id> [--note "<text>"]');
    // SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 / FR-1: process.exitCode, NOT process.exit().
    // MEASURED: process.exit() here fires before startup's async handles settle and the process
    // ABORTS — "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c:76" — so
    // the shell saw 127, which is command-not-found. A deliberate refusal was therefore
    // indistinguishable from a missing binary, and every caller branching on the code mis-read it.
    // Setting exitCode lets the loop drain and the intended code actually reach the caller. Same
    // fix, same reason, as scripts/execute-subagent.js.
    process.exitCode = 2;
    return;
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
    // FR-1: exitCode, not exit() — see the note above. A refusal must read as a refusal.
    process.exitCode = 1;
  }
}

module.exports = { ackDirective, ackAdvisory, ackRow };

if (require.main === module) {
  main();
}
