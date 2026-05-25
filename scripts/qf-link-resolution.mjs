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
  .from('quick_fixes').select('id, status').eq('id', qfId).maybeSingle();
if (qfErr || !qf) { console.error(`QF ${qfId} not found${qfErr ? ': ' + qfErr.message : ''}`); process.exit(1); }

// Always set the link (idempotent record of supersession).
const update = { resolution_sd_id: sdKey };

// If the resolving SD is already completed, the trigger won't fire again — cancel now.
const sdDone = sd.status === 'completed';
const qfOpen = !['completed', 'cancelled', 'escalated', 'closed'].includes(qf.status);
if (sdDone && qfOpen && !noCancel) {
  update.status = 'cancelled';
  update.completed_at = new Date().toISOString();
  update.verified_by = update.verified_by || 'operator: qf-link-resolution';
  update.verification_notes = `Auto-cancelled: linked to already-completed SD ${sdKey} (close-the-loop).`;
}

const { error: upErr } = await supabase.from('quick_fixes').update(update).eq('id', qfId);
if (upErr) { console.error('Link failed:', upErr.message); process.exit(1); }

console.log(`Linked ${qfId} → ${sdKey} (resolution_sd_id set).`);
if (update.status === 'cancelled') console.log(`  SD already completed → ${qfId} cancelled now.`);
else if (sdDone) console.log(`  SD already completed and QF already closed — link recorded only.`);
else console.log(`  SD not yet completed — QF will auto-cancel when ${sdKey} completes.`);
