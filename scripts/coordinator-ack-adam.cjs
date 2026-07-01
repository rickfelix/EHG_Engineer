#!/usr/bin/env node
/**
 * coordinator-ack-adam.cjs — coordinator-side two-stage ACK for Adam advisories.
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 (FR-2).
 *
 * `--advisory <id>` stamps payload.actioned_at on the original advisory — the ONLY thing
 * that retires it (mirrors the read_at=DELIVERED / actioned_at=ACTIONED model in
 * lib/coordinator/adam-action-ack.cjs). Optional `--reply "<body>"` ALSO writes a
 * coordinator_reply row targeting the advisory's Adam sender_session + correlation_id,
 * reusing scripts/coordinator-reply.cjs sendCoordinatorReply — no hand-rolled insert, no
 * invented payload.kind. The --reply leg is gated behind COORDINATOR_TWOWAY_V2=on; the
 * ack-stamp works regardless.
 *
 * `--disposition <accepted|rejected|partial>` records the coordinator's/chairman's decision on the
 * advisory into solomon_advice_outcome_ledger (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001,
 * FR-3), keyed on the advisory's payload.correlation_id (or the explicit --correlation-id override).
 * Idempotent (ON CONFLICT correlation_id DO UPDATE — re-running never duplicates a row). Fail-open:
 * a ledger write failure is logged but never blocks the advisory ack/retire above.
 *
 * Usage:
 *   node scripts/coordinator-ack-adam.cjs --advisory <id>
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --reply "<reply body>"
 *   node scripts/coordinator-ack-adam.cjs --advisory <id> --disposition accepted [--correlation-id <id>]
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { isFullUuid } = require('../lib/coordinator/dispatch.cjs');
const { fetchAdvisory, stampActioned } = require('../lib/coordinator/adam-advisory-store.cjs');
const { sendCoordinatorReply } = require('./coordinator-reply.cjs');
const { resolveAdamReplyTarget, retargetStaleAdamInbound, verifyReplyDelivered } = require('../lib/coordinator/adam-identity.cjs');

const VALID_DISPOSITIONS = Object.freeze(['accepted', 'rejected', 'partial']);

/**
 * Fail-open: record a coordinator/chairman decision into solomon_advice_outcome_ledger, keyed on
 * correlation_id (idempotent upsert). Never throws — returns { recorded, reason }. Exported for tests.
 */
async function recordLedgerDecision(supabase, { correlationId, disposition, decidedBy }) {
  if (!correlationId) return { recorded: false, reason: 'no correlation_id' };
  if (!VALID_DISPOSITIONS.includes(disposition)) return { recorded: false, reason: `invalid disposition: ${disposition}` };
  try {
    const { error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .upsert(
        {
          correlation_id: correlationId,
          decision: disposition,
          decision_by: decidedBy || null,
          decision_at: new Date().toISOString(),
        },
        { onConflict: 'correlation_id' }
      );
    if (error) return { recorded: false, reason: error.message };
    return { recorded: true };
  } catch (e) {
    return { recorded: false, reason: (e && e.message) || String(e) };
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--advisory' || a === '--reply') {
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
  const advisoryId = typeof flags.advisory === 'string' ? flags.advisory : null;
  if (!advisoryId) {
    console.error('Usage: node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<reply body>"]');
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

  const { row: adv, error: fErr } = await fetchAdvisory(supabase, advisoryId);
  if (fErr) { console.error('ERROR: advisory lookup failed:', fErr.message); process.exit(1); }
  if (!adv) { console.error('ERROR: advisory not found:', advisoryId); process.exit(1); }

  // Stage 2: stamp actioned_at — the only thing that retires the advisory (idempotent).
  const nowIso = new Date().toISOString();
  const { error: sErr } = await stampActioned(supabase, adv, nowIso);
  if (sErr) { console.error('ERROR: failed to stamp actioned_at:', sErr.message); process.exit(1); }
  console.log('✓ Advisory actioned (retired)');
  console.log('  advisory_id:', advisoryId);
  console.log('  actioned_at:', nowIso);

  const disposition = typeof flags.disposition === 'string' ? flags.disposition : null;
  if (disposition) {
    const correlationId = typeof flags['correlation-id'] === 'string'
      ? flags['correlation-id']
      : (adv.payload && adv.payload.correlation_id);
    const result = await recordLedgerDecision(supabase, { correlationId, disposition, decidedBy: coordinatorSession });
    if (result.recorded) {
      console.log('✓ Ledger decision recorded');
      console.log('  correlation_id:', correlationId);
      console.log('  decision:', disposition);
    } else {
      console.warn(`⚠ Ledger decision NOT recorded (advisory still actioned): ${result.reason}`);
    }
  }

  if (wantsReply) {
    if (!isTwoWayV2Enabled()) {
      console.error('NOTE: --reply skipped — COORDINATOR_TWOWAY_V2 is OFF (advisory was still actioned).');
      process.exit(0);
    }
    if (!replyBody) { console.error('ERROR: --reply requires a body.'); process.exit(2); }
    const originator = adv.sender_session;
    const correlationId = adv.payload && adv.payload.correlation_id;
    if (!isFullUuid(originator)) { console.error('ERROR: advisory sender_session is not a full UUID:', JSON.stringify(originator)); process.exit(1); }
    if (!correlationId) { console.error('ERROR: advisory carries no payload.correlation_id (not replyable).'); process.exit(1); }
    // FR-1: target the CURRENT live Adam, never a stale originating session.
    const { target: adamSession, retargeted } = await resolveAdamReplyTarget(supabase, originator);
    if (retargeted) {
      console.log(`  ↻ re-targeted from stale originator ${originator} → live Adam ${adamSession}`);
      // FR-2: recover any prior unread inbound stuck at the stale originator.
      const rec = await retargetStaleAdamInbound(supabase, { staleOriginator: originator, liveAdam: adamSession });
      if (rec.error) console.error('  WARN: stuck-inbound recovery error:', rec.error);
      else if (rec.retargeted > 0) console.log(`  ↻ recovered ${rec.retargeted} prior unread message(s) to the live Adam`);
    }
    const { data, error } = await sendCoordinatorReply(supabase, { coordinatorSession, workerSession: adamSession, correlationId, body: replyBody });
    if (error) { console.error('ERROR: failed to send reply:', error.message); process.exit(1); }
    // FR-3: verify delivery (send != delivered) — fail loud if the row cannot be confirmed.
    const delivered = await verifyReplyDelivered(supabase, data && data.id);
    if (!delivered) { console.error('ERROR: reply send reported success but the row could not be confirmed (delivery NOT verified) — failing loud.'); process.exit(1); }
    console.log('✓ Coordinator reply sent to Adam (delivery verified)');
    console.log('  reply_id:', data.id);
    console.log('  to_adam:', adamSession);
    console.log('  reply_to:', correlationId);
  }
}

module.exports = { parseArgs, recordLedgerDecision, VALID_DISPOSITIONS };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
