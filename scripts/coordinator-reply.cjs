#!/usr/bin/env node
// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-5 — coordinator reply verb.
// Completes the two-way round-trip: a worker sends a request via
//   node scripts/worker-signal.cjs request "<question>"
// (payload.correlation_id + expects_reply); the coordinator replies here with the
// worker's session_id + correlation_id. The reply is a session_coordination row
// with message_type='INFO' (existing enum value — no ALTER TYPE, P0-2) and
// payload.kind='coordinator_reply' + reply_to=<correlation_id>. The worker inbox
// hook SKIPS coordinator_reply rows (FR-6) so the worker's awaitCoordinatorReply()
// poll consumes it. Correlation rides entirely in payload JSONB — no migration.
//
// DEFAULT-OFF behind COORDINATOR_TWOWAY_V2=on, mirroring the worker request path,
// so production behavior is byte-unchanged until the round-trip is enabled.
//
// Usage:
//   node scripts/coordinator-reply.cjs --to <worker_session_id> --correlation <id> "<reply body>"

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { redact, BODY_HARD_CAP } = require('./worker-signal.cjs');

// Default reply lifetime — comfortably exceeds the worker await window (30s) plus margin.
const REPLY_DEFAULT_TTL_MS = 60 * 60_000;

// Pure + exported (TS): the exact reply payload written to session_coordination.payload.
function buildReplyPayload({ correlationId, body, coordinatorSession }) {
  const payload = {
    kind: 'coordinator_reply',
    reply_to: correlationId,
    sender: coordinatorSession || null
  };
  if (body) payload.body = redact(String(body)).slice(0, BODY_HARD_CAP);
  // INVARIANT: no signal_type (would be scooped by signal-router) / no intent_action.
  return payload;
}

// Insert the reply row. Read-only w.r.t. resolution; targets the SPECIFIC worker
// (never 'broadcast-coordinator', per P1-3). Returns { data, error }.
async function sendCoordinatorReply(supabase, { coordinatorSession, workerSession, correlationId, body, ttlMs = REPLY_DEFAULT_TTL_MS }) {
  const payload = buildReplyPayload({ correlationId, body, coordinatorSession });
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const subject = `[COORDINATOR_REPLY ${String(correlationId).slice(0, 8)}]`;
  return supabase
    .from('session_coordination')
    .insert({
      sender_session: coordinatorSession,
      sender_type: 'coordinator',
      target_session: workerSession,
      message_type: 'INFO',
      subject,
      body: payload.body || null,
      payload,
      expires_at: expiresAt
    })
    .select('id, created_at')
    .single();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--to' || a === '--correlation' || a === '--ttl') {
      flags[a.slice(2)] = args[++i];
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  if (!isTwoWayV2Enabled()) {
    console.error('ERROR: coordinator reply is gated by COORDINATOR_TWOWAY_V2=on (currently OFF — no-op).');
    process.exit(3);
  }

  const { flags, positional } = parseArgs(process.argv);
  const workerSession = typeof flags.to === 'string' ? flags.to : null;
  const correlationId = typeof flags.correlation === 'string' ? flags.correlation : null;
  const body = positional.join(' ').trim();

  if (!workerSession || !correlationId || !body) {
    console.error('Usage: node scripts/coordinator-reply.cjs --to <worker_session_id> --correlation <id> "<reply body>"');
    process.exit(2);
  }

  const coordinatorSession = process.env.CLAUDE_SESSION_ID;
  if (!coordinatorSession) {
    console.error('ERROR: CLAUDE_SESSION_ID env var required (set by SessionStart hook).');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const ttlMs = Number(flags.ttl) > 0 ? Number(flags.ttl) : REPLY_DEFAULT_TTL_MS;
  const { data, error } = await sendCoordinatorReply(supabase, {
    coordinatorSession, workerSession, correlationId, body, ttlMs
  });
  if (error) {
    console.error('ERROR: failed to insert reply:', error.message);
    process.exit(1);
  }

  console.log('✓ Coordinator reply sent');
  console.log('  reply_id:', data.id);
  console.log('  to_worker:', workerSession);
  console.log('  reply_to:', correlationId);
}

module.exports = { buildReplyPayload, sendCoordinatorReply, parseArgs, REPLY_DEFAULT_TTL_MS };

if (require.main === module) {
  main().catch(err => {
    console.error('UNHANDLED:', err.message || err);
    process.exit(1);
  });
}
