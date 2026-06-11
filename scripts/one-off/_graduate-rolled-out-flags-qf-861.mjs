#!/usr/bin/env node
/**
 * QF-20260610-861 — graduate 6 fully-rolled-out flags (stamp rolled_out_at) + dismiss
 * 2 transient flag-governance digest feedback rows.
 *
 * Root cause: these flags are is_enabled=true / lifecycle_state='enabled' in production
 * but rolled_out_at IS NULL, so governance-review.js classifyFlag's enabledNeverRolledOut
 * branch (lines 55-58) re-flags them as 'graduate' every watchdog cycle forever.
 *
 * Mirrors scripts/one-off/_enroll-forgotten-flags-make-feature-flags-001.mjs:50-67
 * (the stale-OFF-class twin). Idempotent: stamps ONLY where rolled_out_at IS NULL,
 * guarded on is_enabled=true AND lifecycle_state='enabled'. NEVER flips is_enabled.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRADUATE_FLAGS = [
  'quality_layer_sanitization',
  'quality_layer_quarantine',
  'quality_layer_audit_logging',
  'quality_layer_enhancement',
  's17_use_gvos_composer',
  's17_per_wireframe_sections',
];

const DIGEST_FEEDBACK_IDS = [
  'd3a2e5c1-e6a7-4c5a-a5b7-4fcd145b048e',
  '303b4c6b-e5ef-487d-9de2-ef960a20bc45',
];

(async () => {
  // FR-1: idempotent graduation stamp.
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

  // FR-2: verify — recompute stale flags; expect 0 graduate-class.
  const { computeStaleFlags } = await import('../../lib/feature-flags/governance-review.js');
  const { data: flags } = await sb.from('leo_feature_flags').select('*');
  // computeStaleFlags returns { stale, total, byRecommendation } — not a bare array.
  const { stale } = computeStaleFlags(flags || []);
  const graduates = stale.filter((s) => s.recommendation === 'graduate');
  console.log(`\nVERIFY: ${graduates.length} graduate-class stale flag(s) remain (expect 0).`);
  graduates.forEach((g) => console.log('  still stale:', g.flag_key));

  // FR-3: dismiss the 2 transient watchdog digest rows.
  for (const id of DIGEST_FEEDBACK_IDS) {
    const { data: fb } = await sb.from('feedback').select('id, status, metadata').eq('id', id).maybeSingle();
    if (!fb) { console.log(`• feedback ${id.slice(0, 8)}: not found — skipping.`); continue; }
    if (fb.status === 'resolved') { console.log(`• feedback ${id.slice(0, 8)}: already ${fb.status} — no-op.`); continue; }
    const md = fb.metadata || {};
    md.reconciled_by = 'QF-20260610-861';
    md.reconciliation_note = 'Transient FLAG_GOVERNANCE_REVIEW_V1 watchdog digest; graduate-class residual stamped rolled_out_at by this QF, review-class already self-cleared via last_reviewed_at.';
    const { error } = await sb.from('feedback').update({
      status: 'resolved', // feedback_status_check allows in_progress|new|resolved — no 'dismissed'
      resolution_notes: md.reconciliation_note,
      metadata: md,
    }).eq('id', id);
    console.log(error ? `• feedback ${id.slice(0, 8)}: dismiss failed: ${error.message}` : `• feedback ${id.slice(0, 8)}: dismissed.`);
  }

  process.exitCode = graduates.length === 0 ? 0 : 1;
})().catch((e) => { console.error('QF-861 backfill failed:', e.message); process.exitCode = 1; });
