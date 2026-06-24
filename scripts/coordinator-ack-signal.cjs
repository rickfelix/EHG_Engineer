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
 * Usage:
 *   node scripts/coordinator-ack-signal.cjs --signal <id>
 *   node scripts/coordinator-ack-signal.cjs --signal <id> --reply "<reply body>"
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { isFullUuid } = require('../lib/coordinator/dispatch.cjs');
const { sendCoordinatorReply } = require('./coordinator-reply.cjs');

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

  const coordinatorSession = process.env.CLAUDE_SESSION_ID;
  if (!coordinatorSession) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const { data: sig, error: fErr } = await supabase
    .from('session_coordination')
    .select('id, sender_session, payload, acknowledged_at')
    .eq('id', signalId)
    .maybeSingle();
  if (fErr) { console.error('ERROR: signal lookup failed:', fErr.message); process.exit(1); }
  if (!sig) { console.error('ERROR: signal not found:', signalId); process.exit(1); }

  // Stamp acknowledged_at — the only thing that retires the signal from the inbox (idempotent).
  const nowIso = new Date().toISOString();
  if (!sig.acknowledged_at) {
    const { error: sErr } = await supabase
      .from('session_coordination')
      .update({ acknowledged_at: nowIso })
      .eq('id', signalId);
    if (sErr) { console.error('ERROR: failed to stamp acknowledged_at:', sErr.message); process.exit(1); }
  }
  console.log('✓ Signal acknowledged (retired from inbox)');
  console.log('  signal_id:', signalId);
  console.log('  acknowledged_at:', sig.acknowledged_at || nowIso);

  if (wantsReply) {
    if (!isTwoWayV2Enabled()) {
      console.error('NOTE: --reply skipped — COORDINATOR_TWOWAY_V2 is OFF (signal was still acked).');
      process.exit(0);
    }
    if (!replyBody) { console.error('ERROR: --reply requires a body.'); process.exit(2); }
    const workerSession = sig.sender_session;
    const correlationId = sig.payload && sig.payload.correlation_id;
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

module.exports = { parseArgs };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
