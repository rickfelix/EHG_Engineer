/**
 * qf-link-resolution — operator-confirmed close-the-loop link (FR-3)
 * SD-LEO-INFRA-AUTO-CLOSE-QUICK-001
 *
 * Links a quick-fix to the SD that resolved it (sets quick_fixes.resolution_sd_id).
 * If that SD is ALREADY completed (the common case at LEAD-FINAL, where the
 * completion trigger has already fired and won't re-fire), it also cancels the QF
 * directly so the loop is closed. Otherwise the link stands and
 * trg_auto_close_quick_fixes_on_sd_completion cancels the QF when the SD completes.
 *
 * Usage: node scripts/qf-link-resolution.mjs <QF-ID> <SD-KEY> [--no-cancel]
 *
 * This is the operator-confirmed step — it is never invoked automatically.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001: single canonical quick_fixes.status writer + the
// ONE canonical needs_sd predicate (shared with FR-3's stale-sweep fix and FR-5's belt ranker,
// so this exclusion cannot independently drift from the other two).
import { setQuickFixStatus, isNeedsSdRow } from '../lib/quick-fix/status-writer.cjs';

const [qfId, sdKey, ...rest] = process.argv.slice(2);
const noCancel = rest.includes('--no-cancel');

if (!qfId || !sdKey) {
  console.error('Usage: node scripts/qf-link-resolution.mjs <QF-ID> <SD-KEY> [--no-cancel]');
  process.exit(2);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, status').eq('id', sdKey).maybeSingle();
if (sdErr || !sd) { console.error(`SD ${sdKey} not found${sdErr ? ': ' + sdErr.message : ''}`); process.exit(1); }

const { data: qf, error: qfErr } = await supabase
  .from('quick_fixes').select('id, status, routing_tier, escalated_to_sd_id').eq('id', qfId).maybeSingle();
if (qfErr || !qf) { console.error(`QF ${qfId} not found${qfErr ? ': ' + qfErr.message : ''}`); process.exit(1); }

// Always set the link (idempotent record of supersession).
const update = { resolution_sd_id: sdKey };

// If the resolving SD is already completed, the trigger won't fire again — cancel now.
// SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-4): a needs_sd row (isNeedsSdRow) is NEVER
// auto-cancelled here, even though its status='open' would otherwise pass the terminal-status
// check below — it is explicitly awaiting an SD, not simply closed-loop work. This is the JS-side
// half of FR-4's exemption; the SQL trigger carries the matching exemption for the path this
// script cannot reach (a link recorded before the SD later completes).
const sdDone = sd.status === 'completed';
const qfOpen = !['completed', 'cancelled', 'escalated', 'closed'].includes(qf.status) && !isNeedsSdRow(qf);
let cancelled = false;
if (sdDone && qfOpen && !noCancel) {
  update.completed_at = new Date().toISOString();
  update.verified_by = 'operator: qf-link-resolution';
  update.verification_notes = `Auto-cancelled: linked to already-completed SD ${sdKey} (close-the-loop).`;
  cancelled = true;
}

// SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-2/FR-5): the status-changing portion (only
// present when cancelling) routes through the single canonical writer, which now requires
// disposition fields on open->cancelled (Guard B) — supplied here since this IS a genuine
// dispositioning event (closing the loop on a linked, already-completed SD).
if (cancelled) {
  try {
    await setQuickFixStatus(supabase, qfId, {
      ...update,
      status: 'cancelled',
      disposition_reason_code: 'auto_cancelled_linked_sd_completed',
      disposed_by: 'operator: qf-link-resolution',
      disposed_at: update.completed_at,
    });
  } catch (e) {
    console.error('Link failed:', e.message);
    process.exit(1);
  }
} else {
  const { error: upErr } = await supabase.from('quick_fixes').update(update).eq('id', qfId);
  if (upErr) { console.error('Link failed:', upErr.message); process.exit(1); }
}

console.log(`Linked ${qfId} → ${sdKey} (resolution_sd_id set).`);
if (cancelled) console.log(`  SD already completed → ${qfId} cancelled now.`);
else if (sdDone) console.log(`  SD already completed and QF already closed (or awaiting an SD) — link recorded only.`);
else console.log(`  SD not yet completed — QF will auto-cancel when ${sdKey} completes.`);
