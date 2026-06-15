#!/usr/bin/env node
/**
 * read-adam-directives.cjs — read-only, two-stage peek at coordinator/orchestrator
 * directives sent TO Adam that are not yet acknowledged.
 * QF-20260610-623 (FR-3).
 *
 * The inbox hook + adam-advisory drainReplies only surface rows with read_at IS NULL, so
 * once read_at is stamped a directive is hidden permanently even if Adam never ACTED on it.
 * This monitor closes that gap: it surfaces session_coordination rows targeting the Adam
 * session from a coordinator/orchestrator sender where acknowledged_at IS NULL — i.e. the
 * READ-but-UNACKNOWLEDGED tier — so a directive whose read_at got stamped (by any poll) is
 * still recoverable until Adam genuinely acknowledges it. Stamps NOTHING (neither read_at
 * nor acknowledged_at); re-running shows the same rows until they are acked. Mirrors the
 * non-mutating read-adam-advisories.cjs.
 *
 * Usage: node scripts/read-adam-directives.cjs
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

// SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: include 'chairman'. The full-lane inbox drain stamps
// read_at=DELIVERED on directive-kind rows of ANY sender; this acked-NULL safety net must cover
// chairman too, or a chairman directive is DELIVERED-then-dropped (harness-bug 43c2dee2: 5 chairman
// messages auto-acked unseen — the exact blindspot this SD lineage closes). Sender-agnostic by intent.
const DIRECTIVE_SENDERS = ['coordinator', 'orchestrator', 'chairman'];

// Resolve the Adam session id: prefer CLAUDE_SESSION_ID when it is the Adam session, else fall
// back to the most-recent active session tagged metadata.role='adam'. Returns null if none.
async function resolveAdamSessionId(supabase) {
  const envId = process.env.CLAUDE_SESSION_ID;
  if (envId) {
    const { data } = await supabase
      .from('claude_sessions').select('session_id, metadata').eq('session_id', envId).single();
    if (data && data.metadata && data.metadata.role === 'adam') return envId;
  }
  const { data: rows } = await supabase
    .from('claude_sessions')
    .select('session_id, status, updated_at, metadata')
    .eq('metadata->>role', 'adam')
    .order('updated_at', { ascending: false })
    .limit(1);
  return rows && rows.length ? rows[0].session_id : null;
}

async function main() {
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const adamId = await resolveAdamSessionId(supabase);
  if (!adamId) { console.log('ADAM DIRECTIVE PEEK: no active Adam session found — nothing to surface.'); return; }

  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, message_type, subject, body, payload, sender_type, sender_session, created_at, read_at, acknowledged_at')
    .eq('target_session', adamId)
    .in('sender_type', DIRECTIVE_SENDERS)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) { console.error('ERROR: directive query failed:', error.message); process.exit(1); }

  console.log('ADAM DIRECTIVE PEEK — read-but-unacknowledged (read-only — stamps nothing)');
  console.log('─'.repeat(60));
  if (!rows || !rows.length) { console.log('  (no unacknowledged coordinator/orchestrator directives to Adam)'); return; }

  console.log(`  ${rows.length} unacknowledged directive(s):`);
  for (const r of rows) {
    const stage = r.read_at ? 'READ-unacked' : 'unread';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const body = (r.body || (r.payload && r.payload.body) || r.subject || '').replace(/\n/g, ' ');
    console.log(`  • ${r.id}`);
    console.log(`      ${r.sender_type} | ${r.message_type} | ${stage} | ${ageStr} ago`);
    console.log(`      ${body}`);
  }
  console.log('');
  console.log('  These rows stay visible until acknowledged_at is stamped (genuine Adam action).');
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

module.exports = { resolveAdamSessionId, DIRECTIVE_SENDERS };
