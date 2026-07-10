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

// SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: include 'chairman'. (Kept exported for back-compat.)
// SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-2): the query NO LONGER filters by this
// list — the recoverable tier is UNIVERSAL across sender lanes (Solomon adam_advisory,
// coordinator_reply, untyped rows included; the 2026-07-10 incident rows 9370edf1/06843d14/
// 7bd9f12b were exactly the lanes the old sender allowlist hid). Only the handler-owned /
// terminal ADAM_EXCLUDED_KINDS are excluded (never acked by design — they would pollute an
// unacked tier forever).
const DIRECTIVE_SENDERS = ['coordinator', 'orchestrator', 'chairman'];
const { ADAM_EXCLUDED_KINDS } = require('../lib/fleet/worker-status.cjs');

/** FR-2 — tier membership: any directed row except handler-owned/terminal kinds. PURE. */
function isRecoverableTierRow(r) {
  const k = r && r.payload && r.payload.kind;
  return !(k != null && ADAM_EXCLUDED_KINDS.includes(k));
}

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

  // FR-2 (SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001): UNIVERSAL tier — no sender_type
  // filter. Fetch wide (excluded kinds are filtered in JS since payload.kind is jsonb),
  // render the oldest 20, and report the TRUE total so accumulation is always visible.
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, message_type, subject, body, payload, sender_type, sender_session, created_at, read_at, delivered_at, acknowledged_at')
    .eq('target_session', adamId)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) { console.error('ERROR: directive query failed:', error.message); process.exit(1); }
  const tier = (allRows || []).filter(isRecoverableTierRow);
  const rows = tier.slice(0, 20);

  console.log('ADAM RECOVERY PEEK — unacknowledged directed rows, ALL sender lanes (read-only — stamps nothing)');
  console.log('─'.repeat(60));
  if (!rows.length) { console.log('  (no unacknowledged directed rows to Adam)'); return; }

  console.log(`  ${tier.length} unacknowledged row(s) total${tier.length > rows.length ? ` — showing oldest ${rows.length}` : ''}${(allRows || []).length === 200 ? ' (fetch cap hit — true total may be higher)' : ''}:`);
  for (const r of rows) {
    const kind = (r.payload && r.payload.kind) || '(untyped)';
    const stage = r.read_at ? 'READ-unacked' : (r.delivered_at ? 'DELIVERED-unacked' : 'unread');
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const body = (r.body || (r.payload && r.payload.body) || r.subject || '').replace(/\n/g, ' ');
    console.log(`  • ${r.id}`);
    console.log(`      ${r.sender_type || '?'} | ${kind} | ${r.message_type} | ${stage} | ${ageStr} ago`);
    console.log(`      ${body}`);
  }
  console.log('');
  console.log('  These rows stay visible until acknowledged_at is stamped (adam-advisory.cjs ack <id> at genuine action time).');
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

module.exports = { resolveAdamSessionId, DIRECTIVE_SENDERS, isRecoverableTierRow };
