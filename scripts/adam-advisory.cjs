#!/usr/bin/env node
/**
 * Adam advisory comms lane (clean, non-friction)
 * SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B
 *
 * Gives the Adam role a dedicated lane to send advisories to the coordinator
 * WITHOUT polluting the worker-friction signal-router. An advisory is a
 * session_coordination row: message_type=INFO + payload.kind=adam_advisory and
 * deliberately NO payload.signal_type (so lib/coordinator/signal-router.cjs
 * loadRecentSignals — which filters payload->>signal_type IS NOT NULL — never
 * scoops it) and NO payload.intent_action (so the deconfliction sweep ignores it).
 *
 * Builds on (does NOT duplicate) SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001:
 * reuses scripts/worker-signal.cjs (redact, BODY_HARD_CAP, awaitCoordinatorReply),
 * lib/coordinator/resolve.cjs (getActiveCoordinatorId, isTwoWayV2Enabled), and the
 * existing scripts/coordinator-reply.cjs for the reply leg. No migration.
 *
 * Usage:
 *   node scripts/adam-advisory.cjs send "<advisory body>"
 *   node scripts/adam-advisory.cjs request "<question>" [--timeout 30000]   (awaits a coordinator reply; needs COORDINATOR_TWOWAY_V2=on)
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { redact, BODY_HARD_CAP, awaitCoordinatorReply } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');

/**
 * Pure: build the advisory payload. INVARIANT: carries payload.kind=adam_advisory
 * and NEVER signal_type / intent_action (so neither the friction router nor the
 * intent sweep scoops it). Exported for tests.
 */
function buildAdvisoryPayload({ body, senderCallsign, repo, correlationId }) {
  const payload = {
    kind: PAYLOAD_KINDS.ADAM_ADVISORY,
    sender_callsign: senderCallsign || null,
    repo: repo || null,
  };
  if (body) payload.body = redact(String(body)).slice(0, BODY_HARD_CAP);
  if (correlationId) {
    payload.correlation_id = correlationId;
    payload.expects_reply = true;
  }
  // INVARIANT: no signal_type, no intent_action.
  return payload;
}

async function snapshotSender(supabase, sessionId) {
  try {
    const { data } = await supabase.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    return data?.metadata?.fleet_identity?.callsign || data?.metadata?.callsign || null;
  } catch { return null; }
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request') {
    console.error('Usage: node scripts/adam-advisory.cjs send "<body>"  |  request "<question>" [--timeout <ms>]');
    process.exit(2);
  }
  const tIdx = argv.indexOf('--timeout');
  const timeoutMs = tIdx >= 0 ? Number(argv[tIdx + 1]) || 30000 : 30000;
  const body = argv.slice(1).filter((a, i) => !(a === '--timeout' || argv[i] === '--timeout')).join(' ').trim();
  if (!body) { console.error('ERROR: advisory body required.'); process.exit(2); }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const coordinatorId = await getActiveCoordinatorId(supabase);
  const target = coordinatorId || 'broadcast-coordinator';
  const senderCallsign = await snapshotSender(supabase, sessionId);

  if (mode === 'request' && !isTwoWayV2Enabled()) {
    console.error('ERROR: request/await is gated by COORDINATOR_TWOWAY_V2=on (currently OFF). Use `send` for fire-and-forget.');
    process.exit(3);
  }

  const correlationId = mode === 'request' ? crypto.randomUUID() : null;
  const payload = buildAdvisoryPayload({ body, senderCallsign, repo: process.cwd(), correlationId });
  const subject = `[ADAM_ADVISORY] ${payload.body.slice(0, 80)}`;
  const expiresAt = new Date(Date.now() + (mode === 'request' ? timeoutMs + 5 * 60_000 : 24 * 60 * 60_000)).toISOString();

  const { data: inserted, error } = await supabase
    .from('session_coordination')
    .insert({ sender_session: sessionId, sender_type: 'adam', target_session: target, message_type: 'INFO', subject, body: payload.body, payload, expires_at: expiresAt })
    .select('id')
    .single();
  if (error) { console.error('ERROR: failed to insert advisory:', error.message); process.exit(1); }

  console.log('✓ Adam advisory sent');
  console.log('  advisory_id:', inserted.id);
  console.log('  target:', target);
  console.log('  callsign:', senderCallsign || '(none)');

  if (mode === 'request') {
    console.log('  correlation_id:', correlationId, '— awaiting coordinator reply…');
    const result = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs });
    if (result.timedOut) { console.log('⌛ No reply within timeout (reply may arrive later as a coordinator_reply row).'); process.exit(0); }
    try { await supabase.from('session_coordination').update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq('id', result.reply.id); } catch {}
    console.log('✓ Reply:', (result.reply.payload && result.reply.payload.body) || result.reply.body || '(empty)');
  }
}

module.exports = { buildAdvisoryPayload };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
