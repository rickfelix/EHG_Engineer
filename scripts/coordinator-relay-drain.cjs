#!/usr/bin/env node
/**
 * Coordinator relay-request drain tick (FR-1/FR-2).
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001.
 *
 * Drains queued relay_request rows deliberately -- the coordinator no longer
 * processes a relay inline in its active thread. For each undrained row, performs
 * the actual relay (a direct session_coordination insert to the resolved live
 * peer), then writes BOTH FR-2 receipt markers via relay-queue.cjs's drainOne().
 *
 * Usage: node scripts/coordinator-relay-drain.cjs [--dry-run]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { drainRelayQueue } = require('../lib/coordinator/relay-queue.cjs');
const { resolvePeerTarget } = require('../lib/coordinator/peer-target.cjs');

const DRY_RUN = process.argv.includes('--dry-run');

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

/**
 * Perform the actual relay. Two peer classes, two delivery contracts:
 *   session — resolve the target peer's live session, then insert a direct advisory row.
 *   relay   — eva/ceo NEVER have a live session (peer-target.cjs's PEER_KINDS registry,
 *             TS-2). There is nothing to insert TO. In production the relay-class path is
 *             the ONLY one ever enqueued (adam-advisory.cjs / solomon-advisory.cjs only call
 *             enqueueRelayRequest for relay-class peers; session-class --to targets go via a
 *             direct insert and never touch this queue). Treating "no live session" as a
 *             drain FAILURE here would mean the row perpetually un-claims and retries every
 *             tick, forever, and gets wrongly flagged by the FR-3 drop gauge as a real drop
 *             (VALIDATION-caught during PLAN_VERIFICATION, TS-7 was the integration scenario
 *             that would have caught this but was never implemented in EXEC). The correct
 *             contract for a permanently-dormant peer: the durable, FR-3-surfaced
 *             relay_request + relay_confirm pair in session_coordination IS the delivery —
 *             there is no live-session insert to perform, so this returns ok:true without
 *             attempting one, and drainOne proceeds to write both FR-2 receipt markers.
 * @param {object} supabase
 * @returns {(row:object) => Promise<{ok:boolean, error?:string}>}
 */
function makeSendRelay(supabase) {
  return async function sendRelay(row) {
    const peer = row.payload && row.payload.relay_to;
    if (!peer) return { ok: false, error: 'row has no payload.relay_to' };
    try {
      const resolved = await resolvePeerTarget(supabase, peer, {});
      if (resolved.kind === 'relay') {
        return { ok: true };
      }
      if (!resolved.target) {
        return { ok: false, error: `relay_to "${peer}" has no resolvable live session` };
      }
      const { error } = await supabase
        .from('session_coordination')
        .insert({
          sender_session: row.target_session,
          sender_type: 'coordinator',
          target_session: resolved.target,
          message_type: 'INFO',
          subject: `[RELAYED] ${String(row.payload.body || '').slice(0, 60)}`,
          body: row.payload.body || null,
          payload: { kind: 'adam_advisory', body: row.payload.body || null, correlation_id: row.payload.correlation_id, relayed_from: row.sender_session },
        });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  };
}

async function main() {
  if (DRY_RUN) {
    console.log('[coordinator-relay-drain] --dry-run: no writes performed.');
    return;
  }
  const supabase = getSupabase();
  const result = await drainRelayQueue(supabase, makeSendRelay(supabase));
  console.log(`drained=${result.drained} failed=${result.failed}${result.errors.length ? ' errors=' + result.errors.join('; ') : ''}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('coordinator-relay-drain failed:', (e && e.message) || e);
    process.exit(1);
  });
}

module.exports = { makeSendRelay };
