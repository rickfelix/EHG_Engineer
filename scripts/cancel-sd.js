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
  // SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-2): report the closure-loop reset that the
  // trg_reset_patterns_on_sd_cancel trigger performs on this cancel. Read-only count;
  // the trigger does the actual issue_patterns reset (assigned -> active).
  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (b): capture the linked pattern ROWS
  // BEFORE the cancel — trg_reset_patterns_on_sd_cancel nulls assigned_sd_id
  // during the cancel UPDATE, so a post-cancel lookup by assigned_sd_id finds
  // nothing and the suppression would silently no-op.
  let assignedPatternCount = 0;
  let linkedPatterns = [];
  try {
    const { data: linkedRows } = await supabase
      .from('issue_patterns')
      .select('id, pattern_id, metadata')
      .eq('status', 'assigned')
      .in('assigned_sd_id', [sd.id, sd.sd_key].filter(Boolean));
    linkedPatterns = linkedRows || [];
    assignedPatternCount = linkedPatterns.length;
  } catch { /* non-fatal: reporting only */ }

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

  // QF-20260525-211 (A1): write an audit_log row so cancellations are visible to the audit
  // stream. Previously the reason landed ONLY in the cancellation_reason column, which
  // coordination tooling does not surface — which is why a cancellation trace appeared
  // missing during investigation. Non-fatal: the SD is already cancelled; a failed audit
  // write should not mask that, but it is surfaced loudly.
  const { error: auditErr } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'sd_cancelled',
      entity_type: 'strategic_directive',
      entity_id: sd.sd_key || sd.id,
      old_value: { status: sd.status, current_phase: sd.current_phase, is_working_on: sd.is_working_on },
      new_value: { status: 'cancelled', current_phase: 'CANCELLED' },
      metadata: { reason, prior_claiming_session: claimedSessionId || null, source: 'cancel-sd.js', assigned_patterns_reset: assignedPatternCount },
      severity: 'warning',
      created_by: 'cancel-sd.js',
    });
  if (auditErr) {
    console.warn(`⚠️  audit_log write for ${sd.sd_key} failed (non-fatal):`, auditErr.message);
  } else {
    console.log(`✓ audit_log: sd_cancelled recorded for ${sd.sd_key}`);
  }

  // SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-2): surface the closure-loop reset.
  if (assignedPatternCount > 0) {
    console.log(`✓ closure-loop: ${assignedPatternCount} assigned issue_pattern(s) reset to active by trg_reset_patterns_on_sd_cancel`);
  }

  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (a/b): cancel-sd ALWAYS records a reason
  // (this CLI requires one) — that reason IS the evidence-cancelled marker. The
  // trigger's assigned->active reset RE-ARMS the alert creator (cancel -> active ->
  // threshold -> re-file: two PAT-FIX storms on 2026-06-12). Override the reset:
  // resolve linked pattern(s) with an auditable disposition so the family never
  // re-files. Genuinely NEW post-cancel occurrences still re-escalate via the
  // creator's recency check against the disposition timestamp.
  if (assignedPatternCount > 0) {
    try {
      // Use the PRE-cancel snapshot (linkedPatterns): the trigger already
      // nulled assigned_sd_id, so re-querying by it would return nothing.
      const linked = linkedPatterns;
      let suppressed = 0;
      for (const p of linked || []) {
        // Re-read metadata by id (id survives the trigger reset) so the
        // trigger's last_cancelled_assignment breadcrumb is preserved.
        const { data: freshRow } = await supabase
          .from('issue_patterns').select('metadata').eq('id', p.id).single();
        const { error: supErr } = await supabase
          .from('issue_patterns')
          .update({
            status: 'resolved',
            metadata: {
              ...((freshRow || p).metadata || {}),
              disposition: {
                kind: 'evidence_cancelled_suppressed',
                cancelled_sd: sd.sd_key,
                cancellation_reason: String(reason).slice(0, 500),
                stamped_at: new Date().toISOString(),
                stamped_by: 'cancel-sd.js (SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001)'
              }
            }
          })
          .eq('id', p.id);
        if (!supErr) suppressed++;
      }
      console.log(`✓ closure-loop: ${suppressed} linked pattern(s) resolved with evidence_cancelled_suppressed disposition (no re-file)`);
    } catch (e) {
      console.warn(`⚠️  pattern suppression failed (non-fatal — reconcile sweep is the backstop): ${e.message}`);
    }
  }

  // Release the holder's claude_sessions row, if any.
  // QF-20260525-211 (A2): VERIFIED release. A fire-and-forget warn-and-swallow could silently
  // fail (e.g. a CHECK violation returning 204) and leave the dangling claim that feeds the
  // stale-session-sweep CLAIM_FIX churn. A genuine error is now fatal so the caller knows the
  // claim was NOT released. (Zero rows affected is expected & fine — the holder already moved on.)
  if (claimedSessionId) {
    const { data: releasedRows, error: csErr } = await supabase
      .from('claude_sessions')
      .update({
        status: 'released',
        sd_key: null,
        worktree_path: null,
        worktree_branch: null,
        released_at: new Date().toISOString(),
      })
      .eq('session_id', claimedSessionId)
      .eq('sd_key', sd.sd_key)  // only release if THIS SD was the active claim
      .select('session_id');
    if (csErr) {
      console.error(`❌ claude_sessions release for ${claimedSessionId.slice(0, 8)} FAILED:`, csErr.message);
      console.error('   SD is cancelled but its claim was NOT released — the dangling claim will feed sweep churn. Resolve manually.');
      process.exit(1);
    } else if (releasedRows && releasedRows.length > 0) {
      console.log(`✓ Released claude_sessions row for holder ${claimedSessionId.slice(0, 8)}`);
    } else {
      console.log(`ℹ️  Holder ${claimedSessionId.slice(0, 8)} no longer claimed ${sd.sd_key} (already released) — nothing to do.`);
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
