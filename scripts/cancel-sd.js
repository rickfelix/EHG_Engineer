#!/usr/bin/env node
/**
 * Canonical SD Cancellation Script (QF-20260509-CANCEL-SD)
 *
 * Atomically cancels a Strategic Directive: sets status='cancelled',
 * current_phase='CANCELLED', cancellation_reason, clears claiming_session_id +
 * is_working_on, and releases the corresponding claude_sessions row.
 *
 * Closes feedback 5b5b959e (no canonical cancel-sd.js exists; direct UPDATE
 * leaves claiming_session_id populated → ck_claude_sessions_worktree_state_consistency
 * violations on stale releaseClaim path).
 *
 * Usage:
 *   node scripts/cancel-sd.js <SD-KEY-or-UUID> --reason "<reason>"
 *
 * Examples:
 *   node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "Superseded by SD-BAR"
 *   node scripts/cancel-sd.js f55da615-... --reason "Duplicate of SD-X"
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/cancel-sd.js <SD-KEY-or-UUID> --reason "<reason>"

Atomically cancels an SD:
  - status='cancelled', current_phase='CANCELLED'
  - cancellation_reason set (required)
  - claiming_session_id cleared
  - is_working_on=false
  - updated_at=NOW (trigger-managed cancellation timestamp)
  - claude_sessions row for the holder released

Required:
  --reason "<text>"   Cancellation reason (cannot be empty)

Examples:
  node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "Superseded by SD-BAR-001"
  node scripts/cancel-sd.js --help
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : null;
  const sdInput = args.find(a => !a.startsWith('-') && (reasonIdx === -1 || args.indexOf(a) !== reasonIdx + 1));

  if (!sdInput) {
    console.error('❌ Missing SD identifier (sd_key or UUID)');
    process.exit(1);
  }
  if (!reason || reason.trim() === '') {
    console.error('❌ Missing or empty --reason "<text>" (required)');
    process.exit(1);
  }

  return { sdInput, reason: reason.trim() };
}

async function resolveSD(input) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, claiming_session_id, is_working_on')
    .or(isUuid ? `id.eq.${input}` : `sd_key.eq.${input}`)
    .limit(1)
    .single();
  if (error || !data) {
    console.error(`❌ SD not found: ${input}`);
    process.exit(1);
  }
  return data;
}

async function cancelSD(sd, reason) {
  if (sd.status === 'cancelled') {
    console.log(`ℹ️  SD ${sd.sd_key} already cancelled (status='cancelled'). No-op.`);
    return false;
  }
  if (sd.status === 'completed') {
    console.error(`❌ Cannot cancel completed SD ${sd.sd_key} (status='completed'). Use a different remediation path.`);
    process.exit(1);
  }

  const claimedSessionId = sd.claiming_session_id;
  // QF-20260509-CANCEL-SD-COLDROP: strategic_directives_v2 has no dedicated
  // cancelled_at column — original PR #3625 INSERT shape included it,
  // causing PGRST204 "Could not find the 'cancelled_at' column" schema-cache
  // error on first canonical use. updated_at is trigger-managed; cancellation
  // timestamp is recoverable from updated_at WHERE status='cancelled'.
  const updates = {
    status: 'cancelled',
    current_phase: 'CANCELLED',
    cancellation_reason: reason,
    claiming_session_id: null,
    is_working_on: false,
    updated_at: new Date().toISOString(),
  };

  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', sd.id);
  if (sdErr) {
    console.error(`❌ Failed to update SD ${sd.sd_key}:`, sdErr.message);
    process.exit(1);
  }
  console.log(`✓ SD ${sd.sd_key} cancelled (status=cancelled, current_phase=CANCELLED)`);

  // SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 FR-3: defensive global is_working_on
  // sweep + post-condition assertion. The per-SD UPDATE above already clears
  // is_working_on, but the writer/consumer asymmetry pattern (13th-witness)
  // means another concurrent writer could re-set it between our UPDATE and the
  // SELECT. The sweep here is idempotent (no rows affected when already cleared);
  // the post-condition asserts the row is in the expected state.
  await supabase
    .from('strategic_directives_v2')
    .update({ is_working_on: false })
    .eq('id', sd.id)
    .eq('is_working_on', true);
  const { data: postSweep } = await supabase
    .from('strategic_directives_v2')
    .select('is_working_on, claiming_session_id, status')
    .eq('id', sd.id)
    .maybeSingle();
  if (!postSweep || postSweep.is_working_on !== false || postSweep.status !== 'cancelled') {
    console.error(`❌ POST_CONDITION_FAILED: SD ${sd.sd_key} expected (is_working_on=false, status=cancelled), got`, postSweep);
    process.exit(2);
  }

  // FR-3: release ALL claude_sessions rows pointing at this SD, not just the
  // recorded holder. Multiple sessions can claim simultaneously under drift
  // conditions (orphan witness EVA-SUPPORT-CLI-SKILL-ORCH-001-B carried
  // is_working_on=true since 2026-05-02). Surface the count for observability.
  const { data: releasedRows, error: csErr } = await supabase
    .from('claude_sessions')
    .update({
      status: 'released',
      sd_key: null,
      worktree_path: null,
      worktree_branch: null,
      released_at: new Date().toISOString(),
    })
    .eq('sd_key', sd.sd_key)
    .select('session_id');
  if (csErr) {
    console.warn(`⚠️  claude_sessions global release for ${sd.sd_key} failed (non-fatal):`, csErr.message);
  } else {
    const n = (releasedRows || []).length;
    console.log(`✓ Released ${n} claude_sessions row(s) pointing at ${sd.sd_key}`);
    if (claimedSessionId && !releasedRows.find(r => r.session_id === claimedSessionId)) {
      console.warn(`⚠️  Recorded holder ${claimedSessionId.slice(0, 8)} was not in the released set (already cleared by another path).`);
    }
  }

  return true;
}

(async () => {
  const { sdInput, reason } = parseArgs();
  const sd = await resolveSD(sdInput);

  console.log(`SD: ${sd.sd_key} — ${sd.title?.slice(0, 80)}`);
  console.log(`  Current status: ${sd.status} / phase: ${sd.current_phase}`);
  console.log(`  Claim: ${sd.claiming_session_id ? sd.claiming_session_id.slice(0, 8) : '(none)'}`);
  console.log(`  Reason: ${reason}`);
  console.log('');

  const changed = await cancelSD(sd, reason);
  if (changed) {
    console.log('\n✅ Cancellation complete.');
  }
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
