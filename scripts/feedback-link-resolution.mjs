/**
 * feedback-link-resolution — operator-confirmed close-the-loop link for `feedback` rows
 * SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-3
 *
 * Sibling to scripts/qf-link-resolution.mjs, generalized from quick_fixes to feedback:
 * links a feedback row to the SD or QF that actually resolved it. If that SD/QF is
 * ALREADY completed (the b6594220 case — trg_auto_close_feedback_on_sd_completion /
 * trg_auto_close_feedback_on_qf_completion already fired and won't re-fire just because
 * a link is added later), it also flips the feedback row to resolved right now via the
 * shared lib/governance/resolve-feedback.js writer. Otherwise only the FK link is set,
 * and the existing trigger closes the row normally when the target later completes.
 *
 * Usage: node scripts/feedback-link-resolution.mjs <feedback-id> <SD-KEY-or-QF-ID> [--no-resolve]
 *
 * This is the operator-confirmed step — it is never invoked automatically.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveFeedback } from '../lib/governance/resolve-feedback.js';

const [feedbackId, targetId, ...rest] = process.argv.slice(2);
const noResolve = rest.includes('--no-resolve');

if (!feedbackId || !targetId) {
  console.error('Usage: node scripts/feedback-link-resolution.mjs <feedback-id> <SD-KEY-or-QF-ID> [--no-resolve]');
  process.exit(2);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: feedback, error: fbErr } = await supabase
  .from('feedback').select('id, status').eq('id', feedbackId).maybeSingle();
if (fbErr || !feedback) { console.error(`feedback ${feedbackId} not found${fbErr ? ': ' + fbErr.message : ''}`); process.exit(1); }

// Resolve target: try an SD (by sd_key or id) first, then a QF (by id).
const { data: sd } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, status')
  .or(`id.eq.${targetId},sd_key.eq.${targetId}`).maybeSingle();
const { data: qf } = sd ? { data: null } : await supabase
  .from('quick_fixes').select('id, status').eq('id', targetId).maybeSingle();

if (!sd && !qf) { console.error(`Target ${targetId} not found as an SD or a QF`); process.exit(1); }

const target = sd
  ? { kind: 'sd', id: sd.id, label: sd.sd_key || sd.id, done: sd.status === 'completed' }
  : { kind: 'qf', id: qf.id, label: qf.id, done: ['completed', 'shipped'].includes(qf.status) };

if (target.done && !noResolve) {
  const notes = `Auto-resolved: linked to already-completed ${target.kind === 'sd' ? 'SD' : 'QF'} ${target.label} (close-the-loop).`;
  const result = await resolveFeedback({
    supabase,
    feedbackId: feedback.id,
    ...(target.kind === 'sd' ? { sdId: target.id } : { quickFixId: target.id }),
    notes,
  });
  if (result.error) { console.error('Link failed:', result.error); process.exit(1); }
  console.log(`Linked ${feedbackId} -> ${target.label} (${target.kind === 'sd' ? 'resolution_sd_id' : 'quick_fix_id'} set).`);
  console.log(result.updated
    ? `  ${target.kind === 'sd' ? 'SD' : 'QF'} already completed -> feedback row resolved now.`
    : `  Feedback row was already resolved -- link recorded only (idempotent no-op on status).`);
} else {
  // Link-only: set the FK, leave status untouched. Mirrors qf-link-resolution.mjs's
  // --no-cancel escape hatch and the "target not yet completed" branch.
  const update = target.kind === 'sd' ? { resolution_sd_id: target.id } : { quick_fix_id: target.id };
  const { error: upErr } = await supabase.from('feedback').update(update).eq('id', feedback.id);
  if (upErr) { console.error('Link failed:', upErr.message); process.exit(1); }
  console.log(`Linked ${feedbackId} -> ${target.label} (${target.kind === 'sd' ? 'resolution_sd_id' : 'quick_fix_id'} set).`);
  console.log(target.done
    ? `  ${target.kind === 'sd' ? 'SD' : 'QF'} already completed but --no-resolve set -- link recorded only.`
    : `  ${target.kind === 'sd' ? 'SD' : 'QF'} not yet completed -- feedback row will auto-resolve when ${target.label} completes.`);
}
