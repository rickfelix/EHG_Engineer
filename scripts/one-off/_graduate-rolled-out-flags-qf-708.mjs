#!/usr/bin/env node
/**
 * QF-20260703-708 — graduate 2 fully-rolled-out flags (stamp rolled_out_at) + dismiss
 * the digest feedback row that motivated this QF.
 *
 * Root cause: FLAG_GOVERNANCE_REVIEW_V1 + COORD_ADAM_REVIEW_V1 are is_enabled=true /
 * lifecycle_state='enabled' in production but rolled_out_at IS NULL, so
 * governance-review.js classifyFlag's enabledNeverRolledOut branch re-flags them as
 * 'graduate' every daily watchdog cycle forever.
 *
 * Mirrors scripts/one-off/_graduate-rolled-out-flags-qf-861.mjs (same class, same
 * playbook). Idempotent: stamps ONLY where rolled_out_at IS NULL, guarded on
 * is_enabled=true AND lifecycle_state='enabled'. NEVER flips is_enabled.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRADUATE_FLAGS = [
  'FLAG_GOVERNANCE_REVIEW_V1',
  'COORD_ADAM_REVIEW_V1',
];

const DIGEST_FEEDBACK_ID = '32156379-8694-4e3a-ab14-1b4cee3903ed';

(async () => {
  for (const key of GRADUATE_FLAGS) {
    const { data: row, error: selErr } = await sb
      .from('leo_feature_flags')
      .select('flag_key, is_enabled, lifecycle_state, rolled_out_at, created_at')
      .eq('flag_key', key)
      .maybeSingle();
    if (selErr || !row) { console.log(`• ${key}: not found (${selErr?.message || 'no row'}) — skipping.`); continue; }
    if (row.rolled_out_at) { console.log(`• ${key}: already graduated (rolled_out_at set) — no-op.`); continue; }
    if (!(row.is_enabled === true && row.lifecycle_state === 'enabled')) {
      console.log(`• ${key}: NOT fully enabled (is_enabled=${row.is_enabled}, state=${row.lifecycle_state}) — guard refuses to stamp.`);
      continue;
    }
    const { error: updErr } = await sb
      .from('leo_feature_flags')
      .update({ rolled_out_at: row.created_at || new Date().toISOString() })
      .eq('flag_key', key);
    console.log(updErr
      ? `• ${key}: UPDATE failed: ${updErr.message}`
      : `• ${key}: stamped rolled_out_at=${row.created_at} (is_enabled untouched).`);
  }

  // Verify — recompute stale flags; the 2 graduate-class flags above should be gone.
  const { computeStaleFlags } = await import('../../lib/feature-flags/governance-review.js');
  const { data: flags } = await sb.from('leo_feature_flags').select('*');
  const { stale } = computeStaleFlags(flags || []);
  const stillGraduating = stale.filter((s) => s.recommendation === 'graduate' && GRADUATE_FLAGS.includes(s.flag_key));
  console.log(`\nVERIFY: ${stillGraduating.length}/${GRADUATE_FLAGS.length} target flag(s) still graduate-class (expect 0).`);
  stillGraduating.forEach((g) => console.log('  still stale:', g.flag_key));

  const { data: fb } = await sb.from('feedback').select('id, status, metadata').eq('id', DIGEST_FEEDBACK_ID).maybeSingle();
  if (!fb) {
    console.log(`• feedback ${DIGEST_FEEDBACK_ID.slice(0, 8)}: not found — skipping.`);
  } else if (fb.status === 'resolved') {
    console.log(`• feedback ${DIGEST_FEEDBACK_ID.slice(0, 8)}: already ${fb.status} — no-op.`);
  } else {
    const md = fb.metadata || {};
    md.reconciled_by = 'QF-20260703-708';
    md.reconciliation_note = 'Graduate-class stale flags (FLAG_GOVERNANCE_REVIEW_V1, COORD_ADAM_REVIEW_V1) stamped rolled_out_at by this QF.';
    const { error } = await sb.from('feedback').update({
      status: 'resolved',
      resolution_notes: md.reconciliation_note,
      metadata: md,
    }).eq('id', DIGEST_FEEDBACK_ID);
    console.log(error ? `• feedback ${DIGEST_FEEDBACK_ID.slice(0, 8)}: dismiss failed: ${error.message}` : `• feedback ${DIGEST_FEEDBACK_ID.slice(0, 8)}: dismissed.`);
  }

  process.exitCode = stillGraduating.length === 0 ? 0 : 1;
})().catch((e) => { console.error('QF-708 backfill failed:', e.message); process.exitCode = 1; });
