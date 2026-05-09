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
  - cancelled_at=NOW
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
  // SD-FDBK-INFRA-HANDOFF-RETRO-GENERATORS-001 (FR-1): drop `cancelled_at` —
  // column does not exist on strategic_directives_v2 (sibling cols: cancellation_reason,
  // cancelled_by, archived_at). updated_at proxies the cancellation timestamp.
  // PR #3625 greenfield bug — not previously tested in DB before merge.
  const updates = {
    status: 'cancelled',
    current_phase: 'CANCELLED',
    cancellation_reason: reason,
    cancelled_by: process.env.CLAUDE_SESSION_ID || null,
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

  // Release the holder's claude_sessions row, if any
  if (claimedSessionId) {
    const { error: csErr } = await supabase
      .from('claude_sessions')
      .update({
        status: 'released',
        sd_key: null,
        worktree_path: null,
        worktree_branch: null,
        released_at: new Date().toISOString(),
      })
      .eq('session_id', claimedSessionId)
      .eq('sd_key', sd.sd_key);  // only release if THIS SD was the active claim
    if (csErr) {
      console.warn(`⚠️  claude_sessions release for ${claimedSessionId.slice(0, 8)} failed (non-fatal):`, csErr.message);
    } else {
      console.log(`✓ Released claude_sessions row for holder ${claimedSessionId.slice(0, 8)}`);
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
