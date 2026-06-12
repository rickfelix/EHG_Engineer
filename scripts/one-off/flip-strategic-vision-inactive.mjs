#!/usr/bin/env node
/**
 * SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-D — soft-retire the legacy strategic_vision root.
 *
 * Flips strategic_vision.is_active=false for the single dormant row a5ecb994
 * (EHG-2028). Reversible: the table and row are preserved; rollback is
 *   UPDATE strategic_vision SET is_active=true WHERE id='a5ecb994-aa27-47ec-8e65-39207a0b24c8';
 *
 * Chairman preauthorization: sitting #1 item 4 (granted 2026-06-11T14:52:49Z) —
 * "Execute flip after 2026-06-12T18:04Z IFF pre-flip verification passes."
 * Pre-flip verification (2026-06-12T20:33Z): zero live code readers of
 * strategic_vision (comment-only references post -E repoint), zero
 * v_okr_hierarchy readers, canonical eva_vision_documents L1 active +
 * chairman_approved, 48h observe window elapsed.
 *
 * Usage: node scripts/one-off/flip-strategic-vision-inactive.mjs [--rollback]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const LEGACY_ROW_ID = 'a5ecb994-aa27-47ec-8e65-39207a0b24c8';
const WINDOW_OPEN = Date.parse('2026-06-12T18:04:00Z');

const rollback = process.argv.includes('--rollback');
const target = rollback ? true : false;

if (!rollback && Date.now() < WINDOW_OPEN) {
  console.error(`Preauthorization window not open until 2026-06-12T18:04Z — refusing flip.`);
  process.exit(2);
}

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: before, error: readErr } = await db
  .from('strategic_vision')
  .select('id, code, is_active')
  .eq('id', LEGACY_ROW_ID)
  .single();
if (readErr) { console.error('read failed:', readErr.message); process.exit(1); }
console.log('before:', JSON.stringify(before));

if (before.is_active === target) {
  console.log(`idempotent: is_active already ${target} — nothing to do.`);
  process.exit(0);
}

const { data: updated, error } = await db
  .from('strategic_vision')
  .update({ is_active: target })
  .eq('id', LEGACY_ROW_ID)
  .select('id, code, is_active');
if (error) { console.error('flip failed:', error.message); process.exit(1); }
if (!updated || updated.length !== 1) { console.error(`expected 1 row, got ${updated?.length}`); process.exit(1); }
console.log('after:', JSON.stringify(updated[0]));
console.log(rollback ? 'ROLLBACK complete (is_active=true restored).' : 'FLIP complete (legacy root soft-retired).');
