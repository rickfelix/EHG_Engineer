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
// QF-20260808-447: adopt the canonical dual-read instead of hand-rolling a 36th variant.
const { readCanonicalBody } = require('../lib/coordination/lane-contract.cjs');

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
/**
 * @param {object} supabase
 * @param {object} [deps] - injectable resolver, defaulting to the real module. Same "testable seam"
 *   convention peer-target.cjs itself documents (inject a fixture resolver rather than mocking
 *   nested CJS requires). Added by SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C: without it the
 *   session-class branch below — the one that actually performs the relay insert — was unreachable
 *   from any test, which is why a payload-construction regression here went undetected.
 */
function makeSendRelay(supabase, { resolvePeerTarget: resolvePeer = resolvePeerTarget } = {}) {
  return async function sendRelay(row) {
    const peer = row.payload && row.payload.relay_to;
    if (!peer) return { ok: false, error: 'row has no payload.relay_to' };
    try {
      const resolved = await resolvePeer(supabase, peer, {});
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
          // QF-20260808-447: was payload.body only — a row whose prose lives in the TOP-LEVEL
      // body column relayed with an empty subject preview.
      subject: `[RELAYED] ${readCanonicalBody(row).slice(0, 60)}`,
          body: row.payload.body || null,
          // SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C / FR-4: kind stays adam_advisory (that IS the
          // lane every reader drains), but the correction sub-discriminators must SURVIVE the relay.
          //
          // EXPLICIT PICK, NEVER A SPREAD. This payload is rebuilt field-by-field on purpose: the
          // literal IS the allowlist. drainRelayQueue accepts any row with kind='relay_request' and
          // performs no sender-role check at drain time (role gating happens only at the CLI enqueue
          // call site), so `row.payload` is not trusted input here. Spreading it would forward
          // whatever the enqueuer put there — including `signal_type`/`intent_action`, which
          // buildAdvisoryPayload documents as a hard invariant precisely because the friction-signal
          // router and deconfliction sweep scoop those fields. The relayed row is stamped
          // sender_type='coordinator', so a forged field would impersonate coordinator intent, not
          // merely carry bad body text. Add a field below only when it is meant to cross this
          // boundary. (Caught in security review of PR #6553 before merge.)
          payload: {
            kind: 'adam_advisory',
            body: row.payload.body || null,
            correlation_id: row.payload.correlation_id,
            relayed_from: row.sender_session,
            ...(row.payload.message_kind != null ? { message_kind: row.payload.message_kind } : {}),
            ...(row.payload.part_index != null ? { part_index: row.payload.part_index } : {}),
            ...(row.payload.part_total != null ? { part_total: row.payload.part_total } : {}),
          },
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
  main().then(async () => {
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick,
    // including --dry-run (no queue writes performed, but the tick still ran to completion).
    try {
      const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
      await stampLastFired(getSupabase(), 'standard_loop:relay-drain');
    } catch (err) {
      console.error(`[coordinator-relay-drain] stampLastFired failed (non-fatal): ${err.message}`);
    }
  }).catch((e) => {
    console.error('coordinator-relay-drain failed:', (e && e.message) || e);
    process.exit(1);
  });
}

module.exports = { makeSendRelay };
