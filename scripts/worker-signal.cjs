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
const { createClient } = require('@supabase/supabase-js');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');

const SIGNAL_TYPES = ['stuck', 'need-sweep', 'prd-ambiguous', 'gate-bug', 'spec-conflict', 'harness-bug', 'feedback', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const BODY_HARD_CAP = 4096;

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

async function main() {
  const { flags, positional } = parseArgs(process.argv);

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
module.exports = { redact, parseArgs, REDACTION_PATTERNS, SIGNAL_TYPES, SEVERITIES, BODY_HARD_CAP };

if (require.main === module) {
  main().catch(err => {
    console.error('UNHANDLED:', err.message || err);
    process.exit(1);
  });
}
