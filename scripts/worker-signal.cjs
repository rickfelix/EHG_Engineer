#!/usr/bin/env node
// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-2
// Worker-side signal CLI. Sends a structured signal to the active coordinator via
// session_coordination (message_type=INFO + payload-discrimination). Falls back to
// target_session="broadcast-coordinator" when no live coordinator is found; next
// /coordinator start drains and re-targets the buffer.
//
// Usage:
//   node scripts/worker-signal.cjs <type> "<body>" [--severity high|medium|low|critical] [--reason "<label>"]
//
// Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other
// "other" requires --reason "<short label>" (stored as payload.subtype).
//
// Security (per security-agent CONDITIONAL_PASS, evidence id c8611924-1f5d-46f3-841c-4b8b270ab08b):
//   M1: redact 6 secret patterns BEFORE write
//   M2: slice body to 4096 chars AFTER redaction

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getActiveCoordinatorId, isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');

const SIGNAL_TYPES = ['stuck', 'need-sweep', 'prd-ambiguous', 'gate-bug', 'spec-conflict', 'harness-bug', 'feedback', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const BODY_HARD_CAP = 4096;

// SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-1 — typed INTENT broadcast.
// Default-OFF feature flag. When OFF, the `intent` subcommand refuses to write so
// the existing signal path is byte-unchanged in production.
const DECONFLICTION_ENABLED = process.env.CROSS_SESSION_DECONFLICTION === 'true';

// THE discriminator the FR-2 sweep reader keys on (payload->>intent_action). An
// INTENT row carries message_type='INFO' (an existing enum value — no ALTER TYPE)
// and is distinguished from FR-3a worker signals purely by the PRESENCE of
// payload.intent_action and the ABSENCE of payload.signal_type. signal_type MUST
// stay absent or signal-router.loadRecentSignals would scoop it into aggregation.
const INTENT_ACTIONS = ['cancel-tree', 'retarget-pilot', 'claim-shared-infra'];

// Single source of truth for the INTENT payload key names. worker-signal.cjs WRITES
// these and stale-session-sweep.cjs READS these; both reference this contract so the
// writer and reader cannot drift (pinned end-to-end by TS-WC-1).
const INTENT_PAYLOAD_KEYS = Object.freeze({
  action: 'intent_action',
  sdKey: 'target_sd_key',
  tree: 'target_tree',
  files: 'target_files',
  callsign: 'sender_callsign',
  repo: 'repo'
});

/**
 * Build the INTENT payload written to session_coordination.payload. Pure + exported
 * so TS-WC-1 can pin the exact keys the writer emits against the keys the sweep reads.
 * Applies redact() to free-text fields (body + each target file path).
 * NEVER includes payload.signal_type (FR-1 contract).
 */
function buildIntentPayload({ action, targetSdKey, targetTree, targetFiles, senderCallsign, repo, body }) {
  const K = INTENT_PAYLOAD_KEYS;
  const files = Array.isArray(targetFiles)
    ? targetFiles.map(f => redact(String(f)).slice(0, 500)).filter(Boolean)
    : [];
  const payload = {
    [K.action]: action,
    [K.sdKey]: targetSdKey || null,
    [K.tree]: targetTree || null,
    [K.files]: files,
    [K.callsign]: senderCallsign || null,
    [K.repo]: repo || null
  };
  if (body) payload.body = redact(String(body)).slice(0, BODY_HARD_CAP);
  // INVARIANT: payload.signal_type must be ABSENT on INTENT rows.
  return payload;
}

const REDACTION_PATTERNS = [
  // AWS access key id
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS_KEY' },
  // GitHub fine-grained / classic / oauth tokens
  { re: /gh[pousr]_[A-Za-z0-9]{36,}/g, label: 'GH_TOKEN' },
  // Anthropic / OpenAI keys
  { re: /sk-[A-Za-z0-9_-]{20,}/g, label: 'PROVIDER_KEY' },
  // JWTs (3 base64-url segments). Catches Supabase service-role plus generic.
  { re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: 'JWT' },
  // password=... in connection strings or query strings
  { re: /password\s*[=:]\s*[^&\s"']+/gi, label: 'PASSWORD' },
  // Postgres connection string with embedded creds
  { re: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@/g, label: 'PG_CONN_STRING' }
];

function redact(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const { re, label } of REDACTION_PATTERNS) {
    out = out.replace(re, `[REDACTED:${label}]`);
  }
  return out;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--severity' || a === '--reason') {
      flags[a.slice(2)] = args[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function printHelp() {
  console.log(`Usage:
  node scripts/worker-signal.cjs <type> "<body>" [--severity <level>] [--reason "<label>"]

Types: ${SIGNAL_TYPES.join(' | ')}
Severities: ${SEVERITIES.join(' | ')} (default: medium)

When to send a signal (FR-6 decision rule):
  1. Recurrence threshold (same tool fail 3+, same gate 2+, same RCA 2x, phase >2x median)
  2. About to bypass (3rd-of-3 quota, --no-verify, manual retry, mock instead of fix)
  3. Protocol/spec friction (PRD AC contradicts, sub-agent evidence ungeneratable)
  4. Recognized harness bug observed
  5. Trend hint (current friction matches memory entries just read)

Don't send when: first-time issue, already-open SD/backlog, purely local, rate-limited.

Severity heuristic:
  low      — single-cycle inconvenience
  medium   — recurring within session (default)
  high     — blocking your SD or requires bypass
  critical — DB inconsistency / gate fail-open / security implication (bypasses ≥3 threshold)
`);
}

// SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-1 — INTENT broadcast handler.
// Usage: node scripts/worker-signal.cjs intent <action> --sd <key> --tree <branch> --files <a,b,c>
// Writes ONE session_coordination row (message_type='INFO' + payload.intent_action).
async function intentMain(flags, positional) {
  if (!DECONFLICTION_ENABLED) {
    console.error('ERROR: intent broadcast is gated by CROSS_SESSION_DECONFLICTION=true (currently OFF — no-op).');
    process.exit(3);
  }

  const action = positional[1];
  if (!action || !INTENT_ACTIONS.includes(action)) {
    console.error('ERROR: intent requires <action> ∈ ' + INTENT_ACTIONS.join(' | '));
    console.error('Usage: node scripts/worker-signal.cjs intent <action> --sd <key> --tree <branch> --files <a,b,c>');
    process.exit(2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
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

  // Snapshot sender callsign + claimed sd_key (sd_key is the default --sd target).
  let senderCallsign = null;
  let claimedSdKey = null;
  try {
    const { data: senderRow } = await supabase
      .from('claude_sessions')
      .select('metadata, sd_key')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (senderRow) {
      senderCallsign = senderRow.metadata?.fleet_identity?.callsign || null;
      claimedSdKey = senderRow.sd_key || null;
    }
  } catch { /* best-effort */ }

  const targetSdKey = (typeof flags.sd === 'string' ? flags.sd : null) || claimedSdKey;
  const targetTree = (typeof flags.tree === 'string' ? flags.tree : null);
  const targetFiles = (typeof flags.files === 'string' && flags.files.length)
    ? flags.files.split(',').map(f => f.trim()).filter(Boolean)
    : [];
  const rawBody = typeof flags.note === 'string' ? flags.note : '';

  const payload = buildIntentPayload({
    action,
    targetSdKey,
    targetTree,
    targetFiles,
    senderCallsign,
    repo: process.cwd(),
    body: rawBody
  });

  // Align INTENT expiry to the claim TTL window used by the signal path (+24h).
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const subjBody = payload.body || '';
  const subject = `[INTENT:${action.toUpperCase()}] ${(targetSdKey || targetTree || '')} ${subjBody.slice(0, 60)}`.trim();

  const { data: inserted, error } = await supabase
    .from('session_coordination')
    .insert({
      sender_session: sessionId,
      sender_type: 'worker',
      // INFO is an existing coordination_message_type enum value — no new type, no ALTER.
      // FR-2 disambiguates INTENT from FR-3a signals via payload.intent_action.
      target_session: 'broadcast-coordinator',
      message_type: 'INFO',
      subject,
      body: payload.body || null,
      payload,
      expires_at: expiresAt
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('ERROR: failed to insert intent:', error.message);
    process.exit(1);
  }

  console.log('✓ Intent broadcast');
  console.log('  intent_id:', inserted.id);
  console.log('  intent_action:', action);
  console.log('  target_sd_key:', targetSdKey || '(none)');
  console.log('  target_tree:', targetTree || '(none)');
  console.log('  target_files:', payload[INTENT_PAYLOAD_KEYS.files].length ? payload[INTENT_PAYLOAD_KEYS.files].join(', ') : '(none)');
}

// ============================================================================
// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-7 — worker request -> reply -> await
// round-trip. DEFAULT-OFF behind COORDINATOR_TWOWAY_V2 (read via resolve.cjs
// isTwoWayV2Enabled). A request row carries message_type='INFO' +
// payload.correlation_id + expects_reply=true (NO signal_type, NO intent_action
// — so signal-router and the intent sweep never scoop it). The coordinator
// replies via scripts/coordinator-reply.cjs writing payload.kind=
// 'coordinator_reply' + reply_to=<correlation_id>; the worker inbox hook SKIPS
// those (FR-6) so awaitCoordinatorReply owns consumption. Correlation rides in
// payload JSONB — no migration, no new enum value (P0-2).
// ============================================================================
const REQUEST_DEFAULT_TIMEOUT_MS = 30_000;
const REQUEST_DEFAULT_POLL_MS = 1_000;

// Pure + exported (TS): the exact request payload the worker emits.
function buildRequestPayload({ correlationId, body, senderCallsign, repo }) {
  const payload = {
    kind: 'coordinator_request',
    correlation_id: correlationId,
    expects_reply: true,
    sender_callsign: senderCallsign || null,
    repo: repo || null
  };
  if (body) payload.body = redact(String(body)).slice(0, BODY_HARD_CAP);
  // INVARIANT: no signal_type / no intent_action on request rows.
  return payload;
}

// Poll session_coordination for the coordinator's correlated reply. Returns
// { ok, reply, timedOut }. Read-only + never throws (errors → "no reply yet").
// Injectable `sleep` keeps it unit-testable without real timers.
async function awaitCoordinatorReply(supabase, opts = {}) {
  const {
    sessionId, correlationId,
    timeoutMs = REQUEST_DEFAULT_TIMEOUT_MS,
    pollMs = REQUEST_DEFAULT_POLL_MS,
    sleep,
    now
  } = opts;
  const clock = typeof now === 'function' ? now : () => Date.now();
  const doSleep = typeof sleep === 'function' ? sleep : (ms) => new Promise(r => setTimeout(r, ms));
  const deadline = clock() + timeoutMs;
  for (;;) {
    let row = null;
    try {
      const { data } = await supabase
        .from('session_coordination')
        .select('id, payload, body, sender_session, created_at')
        .eq('target_session', sessionId)
        .eq('payload->>reply_to', correlationId)
        .order('created_at', { ascending: false })
        .limit(1);
      row = Array.isArray(data) && data.length ? data[0] : null;
    } catch { row = null; }
    if (row) return { ok: true, reply: row, timedOut: false };
    if (clock() >= deadline) return { ok: false, reply: null, timedOut: true };
    await doSleep(pollMs);
  }
}

// Usage: node scripts/worker-signal.cjs request "<question>" [--timeout <ms>]
async function requestMain(flags, positional) {
  if (!isTwoWayV2Enabled()) {
    console.error('ERROR: request/await round-trip is gated by COORDINATOR_TWOWAY_V2=on (currently OFF — no-op).');
    process.exit(3);
  }

  const body = positional.slice(1).join(' ').trim();
  if (!body) {
    console.error('ERROR: request requires a "<question>" body.');
    console.error('Usage: node scripts/worker-signal.cjs request "<question>" [--timeout <ms>]');
    process.exit(2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
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

  const coordinatorId = await getActiveCoordinatorId(supabase);
  if (!coordinatorId) {
    console.error('ERROR: no live coordinator to request from (none resolved). Try again once a coordinator is active.');
    process.exit(4);
  }

  let senderCallsign = null;
  try {
    const { data: senderRow } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    senderCallsign = senderRow?.metadata?.fleet_identity?.callsign || null;
  } catch { /* best-effort */ }

  const correlationId = crypto.randomUUID();
  const timeoutMs = Number(flags.timeout) > 0 ? Number(flags.timeout) : REQUEST_DEFAULT_TIMEOUT_MS;
  const payload = buildRequestPayload({ correlationId, body, senderCallsign, repo: process.cwd() });
  const subject = `[WORKER_REQUEST] ${payload.body.slice(0, 80)}`;
  // Request expiry guards the coordinator's reply window (request + reply margin).
  const expiresAt = new Date(Date.now() + timeoutMs + 5 * 60_000).toISOString();

  const { error: insErr } = await supabase
    .from('session_coordination')
    .insert({
      sender_session: sessionId,
      sender_type: 'worker',
      target_session: coordinatorId,
      message_type: 'INFO',
      subject,
      body: payload.body,
      payload,
      expires_at: expiresAt
    });
  if (insErr) {
    console.error('ERROR: failed to insert request:', insErr.message);
    process.exit(1);
  }

  console.log('✓ Request sent; awaiting coordinator reply');
  console.log('  correlation_id:', correlationId);
  console.log('  coordinator:', coordinatorId);
  console.log('  timeout_ms:', timeoutMs);

  const result = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs });
  if (result.timedOut) {
    console.log('⌛ No reply within timeout. Reply (if any) will arrive later as a coordinator_reply row.');
    process.exit(0);
  }

  // Consume: mark the reply read so it does not linger (the FR-6 inbox skip left it for us).
  try {
    await supabase
      .from('session_coordination')
      .update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() })
      .eq('id', result.reply.id);
  } catch { /* best-effort */ }

  console.log('✓ Reply received');
  console.log('  from:', result.reply.sender_session);
  console.log('  reply:', (result.reply.payload && result.reply.payload.body) || result.reply.body || '(empty)');
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);

  // FR-1: route the `intent` subcommand before the legacy signal path.
  if (positional[0] === 'intent') {
    return intentMain(flags, positional);
  }

  // SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-7: route the `request` subcommand
  // (request -> await coordinator reply) before the legacy signal path.
  if (positional[0] === 'request') {
    return requestMain(flags, positional);
  }

  if (flags.help || positional.length < 2) {
    printHelp();
    process.exit(positional.length === 0 ? 0 : 2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.error('ERROR: CLAUDE_SESSION_ID env var required (set by SessionStart hook).');
    process.exit(1);
  }

  const type = positional[0];
  const rawBody = positional.slice(1).join(' ');

  if (!SIGNAL_TYPES.includes(type)) {
    console.error(`ERROR: Unknown signal type "${type}".`);
    console.error(`Valid: ${SIGNAL_TYPES.join(', ')}`);
    process.exit(2);
  }

  if (type === 'other' && !flags.reason) {
    console.error('ERROR: type "other" requires --reason "<short label>" (stored as payload.subtype for grouping).');
    process.exit(2);
  }

  const severity = flags.severity || 'medium';
  if (!SEVERITIES.includes(severity)) {
    console.error(`ERROR: Invalid severity "${severity}". Valid: ${SEVERITIES.join(', ')}`);
    process.exit(2);
  }

  // M1: redact, then M2: hard-cap at 4096
  const body = redact(rawBody).slice(0, BODY_HARD_CAP);
  const subtype = flags.reason ? redact(String(flags.reason)).slice(0, 200) : null;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // Resolve coordinator (file-first, DB fallback). Null → buffer-broadcast sentinel.
  const coordinatorId = await getActiveCoordinatorId(supabase);
  const target = coordinatorId || 'broadcast-coordinator';

  // Look up sender's callsign + claimed sd_key (snapshot at write time).
  let senderCallsign = null;
  let claimedSdKey = null;
  try {
    const { data: senderRow } = await supabase
      .from('claude_sessions')
      .select('metadata, sd_key')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (senderRow) {
      senderCallsign = senderRow.metadata?.fleet_identity?.callsign || null;
      claimedSdKey = senderRow.sd_key || null;
    }
  } catch { /* best-effort */ }

  const subject = `[WORKER_SIGNAL:${type.toUpperCase()}] ${body.slice(0, 80)}`;
  const payload = {
    signal_type: type,
    body,
    severity,
    sender_callsign: senderCallsign,
    sd_key: claimedSdKey,
    repo: process.cwd(),
    ...(subtype ? { subtype } : {})
  };

  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

  const { data: inserted, error } = await supabase
    .from('session_coordination')
    .insert({
      sender_session: sessionId,
      sender_type: 'worker',
      target_session: target,
      message_type: 'INFO',
      subject,
      body,
      payload,
      expires_at: expiresAt
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('ERROR: failed to insert signal:', error.message);
    process.exit(1);
  }

  console.log('✓ Signal sent');
  console.log('  signal_id:', inserted.id);
  console.log('  signal_type:', type);
  console.log('  target:', target === 'broadcast-coordinator' ? 'broadcast-coordinator (no live coordinator — will be drained on next /coordinator start)' : target);
  console.log('  severity:', severity);
  console.log('  callsign:', senderCallsign || '(none assigned)');
  if (subtype) console.log('  subtype:', subtype);
}

// Export internals for unit testing.
module.exports = {
  redact, parseArgs, REDACTION_PATTERNS, SIGNAL_TYPES, SEVERITIES, BODY_HARD_CAP,
  // FR-1 (SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001)
  INTENT_ACTIONS, INTENT_PAYLOAD_KEYS, buildIntentPayload, DECONFLICTION_ENABLED,
  // FR-7 (SD-LEO-INFRA-COMPLETE-TWO-WAY-001) — request/await round-trip
  buildRequestPayload, awaitCoordinatorReply, REQUEST_DEFAULT_TIMEOUT_MS, REQUEST_DEFAULT_POLL_MS
};

if (require.main === module) {
  main().catch(err => {
    console.error('UNHANDLED:', err.message || err);
    process.exit(1);
  });
}
