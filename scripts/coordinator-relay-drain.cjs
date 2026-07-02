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
 * Perform the actual relay: resolve the target peer's live session, then insert a
 * direct advisory row. Session-class peers only reach this point (a relay-class
 * peer's own advisory-script insert already IS the enqueue -- this tick only drains
 * to a resolvable session). Fail loud on an unresolvable peer so the row stays
 * undrained (and eventually surfaces via the FR-3 drop gauge) rather than silently
 * discarding a queued relay.
 * @param {object} supabase
 * @returns {(row:object) => Promise<{ok:boolean, error?:string}>}
 */
function makeSendRelay(supabase) {
  return async function sendRelay(row) {
    const peer = row.payload && row.payload.relay_to;
    if (!peer) return { ok: false, error: 'row has no payload.relay_to' };
    try {
      const resolved = await resolvePeerTarget(supabase, peer, {});
      if (resolved.kind === 'relay' || !resolved.target) {
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
