#!/usr/bin/env node
/**
 * read-solomon-directives.cjs — QF-20260704-491 (mirrors read-adam-directives.cjs / QF-20260703-946).
 * drainInbox's kind-based lane classifier misses out-of-allowlist kinds (e.g. Adam-sent
 * kind=adam_advisory); once ANY poll stamps read_at on such a row, its own unread-scoped orphan
 * detector never sees it again — a 9h-buried reply-needed consult, live 2026-07-04.
 * peekStaleReadUnacked surfaces Solomon-targeted rows read_at-stamped, acknowledged_at-null, and
 * older than a threshold (default 60min) — REGARDLESS OF KIND. Stamps nothing (recoverable until acked).
 * Usage: node scripts/read-solomon-directives.cjs [--threshold-min 60]
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');

const DEFAULT_THRESHOLD_MIN = 60;

function parseThresholdMin(argv) {
  const idx = argv.indexOf('--threshold-min');
  const n = idx >= 0 ? Number(argv[idx + 1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD_MIN;
}

// Query + print; nowMs is injectable for deterministic tests. Returns the surfaced rows.
async function peekStaleReadUnacked(supabase, solomonId, { thresholdMin = DEFAULT_THRESHOLD_MIN, nowMs = Date.now() } = {}) {
  const cutoff = new Date(nowMs - thresholdMin * 60_000).toISOString();
  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, message_type, subject, body, payload, sender_type, sender_session, created_at, read_at, acknowledged_at')
    .eq('target_session', solomonId)
    .not('read_at', 'is', null)
    .is('acknowledged_at', null)
    .lte('read_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) { console.error('ERROR: directive query failed:', error.message); process.exitCode = 1; return []; }
  console.log(`SOLOMON DIRECTIVE PEEK — read-but-unacknowledged >${thresholdMin}m (read-only — stamps nothing)\n${'─'.repeat(60)}`);
  if (!rows || !rows.length) { console.log('  (no stale read-but-unacked rows targeting Solomon)'); return []; }
  console.log(`  ${rows.length} stale read-but-unacked row(s):`);
  for (const r of rows) {
    const kind = (r.payload && r.payload.kind) || r.message_type || '(untyped)';
    const ageMin = Math.floor((nowMs - new Date(r.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const body = (r.body || (r.payload && r.payload.body) || r.subject || '').replace(/\n/g, ' ');
    console.log(`  • ${r.id}\n      ${r.sender_type || '?'} | ${kind} | READ-unacked | ${ageStr} ago\n      ${body}`);
  }
  console.log('\n  These rows stay visible until acknowledged_at is stamped (genuine Solomon action).');
  return rows;
}

async function main() {
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }
  const solomonId = await getActiveSolomonId(supabase);
  if (!solomonId) { console.log('SOLOMON DIRECTIVE PEEK: no active Solomon session found — nothing to surface.'); return; }
  const thresholdMin = parseThresholdMin(process.argv.slice(2));
  await peekStaleReadUnacked(supabase, solomonId, { thresholdMin });
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

module.exports = { parseThresholdMin, peekStaleReadUnacked, DEFAULT_THRESHOLD_MIN };
