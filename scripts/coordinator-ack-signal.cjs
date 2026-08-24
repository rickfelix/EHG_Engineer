#!/usr/bin/env node
/**
 * coordinator-ack-signal.cjs — coordinator-side ACK for WORKER /signal friction signals.
 * SD-LEO-INFRA-SIGNAL-INBOX-DRAIN-ON-DISPLAY-001 (RCA 2026-06-24).
 *
 * Back-ports the proven Adam-advisory receipt model (coordinator-ack-adam.cjs +
 * QF-20260621-174) to the worker-signal lane. Root cause fixed: printInbox() in
 * fleet-dashboard.cjs used to mark a worker signal read_at ON RENDER and re-query on
 * read_at IS NULL, so a single filtered/skimmed/parked-cron render permanently retired
 * the signal — high-severity consults were silently lost. After the fix, printInbox
 * stamps read_at (DELIVERED) on render but the SELECT gates on acknowledged_at IS NULL
 * (ACTIONED), so a signal RE-SURFACES until the coordinator explicitly acks it here.
 *
 * `--signal <id>` stamps the top-level `acknowledged_at` column (the SAME ACTIONED marker
 * the FR-4 signal-router `ackAndRouteLoneSignal` already writes) — the ONLY thing that
 * retires the signal. Optional `--reply "<body>"` ALSO sends a coordinator_reply to the
 * worker's sender_session + correlation_id (reusing coordinator-reply.cjs), gated behind
 * COORDINATOR_TWOWAY_V2=on; the ack-stamp works regardless.
 *
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1): `--disposition <value>` names WHAT the ack means,
 * not just THAT it happened — one of actioned (default) / promoted / duplicate-of /
 * rejected-with-reason / deferred-with-trigger, mirroring coordinator-ack-adam.cjs's
 * ack-then-disposition contract. THIS SCRIPT IS THE SOLE CANONICAL WRITER of a signal-lane
 * disposition + acknowledged_at together — a disposition written any other way (a hand-stamped
 * payload.disposition, or a second script) is detectable via the missing writer_identity this
 * script always stamps into the receipt's metadata.
 *
 * Usage:
 *   node scripts/coordinator-ack-signal.cjs --signal <id>
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --reply "<reply body>"
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --disposition promoted
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --disposition duplicate-of --duplicate-of <other-id>
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --disposition rejected-with-reason --reason "<why>"
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --disposition deferred-with-trigger --trigger "<condition>"
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { isFullUuid } = require('../lib/coordinator/dispatch.cjs');
const { sendCoordinatorReply } = require('./coordinator-reply.cjs');
// FR-2: durable receipt ledger — the answered-rate cannot be recovered from session_coordination,
// whose cleanup deletes ACKED rows at created+24h while unacked rows persist.
const { recordReceipt, LANES, STATES, resolveSignalDisposition } = require('../lib/coordination/receipt-ledger.cjs');

// SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1): writer identity stamped into every receipt this script
// writes, so a hand-stamped payload.disposition (which carries no such key) is detectable.
const WRITER_IDENTITY = 'coordinator-ack-signal.cjs';

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--signal' || a === '--reply') {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1): the canonical, testable core — no process.exit, no
 * console I/O, no argv parsing. Extracted so unit tests can exercise the disposition/linkage/
 * writer-identity/idempotency logic directly against a fake client, without shelling out.
 *
 * @returns {Promise<{ok: true, alreadyAcked: boolean, acknowledgedAt: string, disposition: string, signal: object, receipt: object}|{ok: false, code: 'VALIDATION'|'NOT_FOUND'|'DB_ERROR', error: string}>}
 */
async function ackSignal({ supabase, signalId, disposition = 'actioned', reason, trigger, duplicateOf, coordinatorSession, nowIso: nowIsoOverride } = {}) {
  if (!signalId) return { ok: false, code: 'VALIDATION', error: 'signalId is required' };

  const resolvedDisposition = resolveSignalDisposition(disposition, { reason, trigger, duplicateOf });
  if (!resolvedDisposition.ok) {
    // Rejected BEFORE any DB write — mandatory-linkage failure never touches the row.
    return { ok: false, code: 'VALIDATION', error: resolvedDisposition.error };
  }

  const { data: sig, error: fErr } = await supabase
    .from('session_coordination')
    .select('id, sender_session, payload, acknowledged_at, created_at')
    .eq('id', signalId)
    .maybeSingle();
  if (fErr) return { ok: false, code: 'DB_ERROR', error: `signal lookup failed: ${fErr.message}` };
  if (!sig) return { ok: false, code: 'NOT_FOUND', error: `signal not found: ${signalId}` };

  // Stamp acknowledged_at — the only thing that retires the signal from the inbox (idempotent).
  const nowIso = nowIsoOverride || new Date().toISOString();
  let receipt = { ok: false, skipped: 'already_acked' };
  if (!sig.acknowledged_at) {
    const { error: sErr } = await supabase
      .from('session_coordination')
      .update({ acknowledged_at: nowIso })
      .eq('id', signalId);
    if (sErr) return { ok: false, code: 'DB_ERROR', error: `failed to stamp acknowledged_at: ${sErr.message}` };

    // SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-2): record the disposal in the DURABLE ledger.
    // This row is deleted by cleanup_expired_coordination() at created+24h — and it is deleted
    // BECAUSE it is now acked, while unacked rows persist. So the answered-rate cannot be recovered
    // from session_coordination afterwards at any later time; it has to be captured HERE, at the
    // moment of the transition, or it is gone. source_created_at is passed so time-to-answer
    // survives the deletion too.
    //
    // Deliberately NON-FATAL and after the stamp: the ack has already happened and must stand even
    // if the ledger write fails. A measurement outage must never become an operational one.
    receipt = await recordReceipt(supabase, {
      coordinationId: signalId,
      lane: LANES.SIGNAL,
      state: STATES.DISPOSED,
      disposition: resolvedDisposition.ledgerDisposition,
      actorSession: coordinatorSession || null,
      actorRole: 'coordinator',
      isRetention: false,
      sourceCreatedAt: sig.created_at,
      nowMs: Date.parse(nowIso),
      metadata: {
        signal_type: (sig.payload && sig.payload.signal_type) || null,
        via: WRITER_IDENTITY,
        writer_identity: WRITER_IDENTITY,
        signal_lane_disposition: disposition,
        ...resolvedDisposition.metadata,
      },
    });
  }

  return {
    ok: true,
    alreadyAcked: Boolean(sig.acknowledged_at),
    acknowledgedAt: sig.acknowledged_at || nowIso,
    disposition,
    signal: sig,
    receipt,
  };
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  const signalId = typeof flags.signal === 'string' ? flags.signal : null;
  if (!signalId) {
    console.error('Usage: node scripts/coordinator-ack-signal.cjs --signal <id> [--reply "<reply body>"]');
    process.exit(2);
  }
  const wantsReply = flags.reply !== undefined;
  const replyBody = typeof flags.reply === 'string'
    ? [flags.reply, ...positional].join(' ').trim()
    : positional.join(' ').trim();

  // SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-1): default to 'actioned' so every pre-existing caller
  // that only ever passed --signal <id> keeps working unchanged.
  const dispositionValue = typeof flags.disposition === 'string' ? flags.disposition : 'actioned';

  const coordinatorSession = process.env.CLAUDE_SESSION_ID;
  if (!coordinatorSession) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const result = await ackSignal({
    supabase,
    signalId,
    disposition: dispositionValue,
    reason: typeof flags.reason === 'string' ? flags.reason : undefined,
    trigger: typeof flags.trigger === 'string' ? flags.trigger : undefined,
    duplicateOf: typeof flags['duplicate-of'] === 'string' ? flags['duplicate-of'] : undefined,
    coordinatorSession,
  });
  if (!result.ok) {
    console.error('ERROR:', result.error);
    process.exit(result.code === 'VALIDATION' ? 2 : 1);
  }
  if (!result.receipt.ok && !result.alreadyAcked) {
    console.error('NOTE: receipt ledger write skipped (' + (result.receipt.error || result.receipt.skipped) + ') — ack still stands.');
  }
  console.log('✓ Signal acknowledged (retired from inbox)');
  console.log('  signal_id:', signalId);
  console.log('  acknowledged_at:', result.acknowledgedAt);
  console.log('  disposition:', result.disposition);

  if (wantsReply) {
    if (!isTwoWayV2Enabled()) {
      console.error('NOTE: --reply skipped — COORDINATOR_TWOWAY_V2 is OFF (signal was still acked).');
      process.exit(0);
    }
    if (!replyBody) { console.error('ERROR: --reply requires a body.'); process.exit(2); }
    const workerSession = result.signal.sender_session;
    const correlationId = result.signal.payload && result.signal.payload.correlation_id;
    if (!isFullUuid(workerSession)) { console.error('ERROR: signal sender_session is not a full UUID:', JSON.stringify(workerSession)); process.exit(1); }
    if (!correlationId) { console.error('ERROR: signal carries no payload.correlation_id (not replyable).'); process.exit(1); }
    const { data, error } = await sendCoordinatorReply(supabase, { coordinatorSession, workerSession, correlationId, body: replyBody });
    if (error) { console.error('ERROR: failed to send reply:', error.message); process.exit(1); }
    console.log('✓ Coordinator reply sent to worker');
    console.log('  reply_id:', data.id);
    console.log('  to_worker:', workerSession);
    console.log('  reply_to:', correlationId);
  }
}

module.exports = { parseArgs, ackSignal, WRITER_IDENTITY };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
