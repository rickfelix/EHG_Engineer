#!/usr/bin/env node
// @wire-check-exempt — one-off backfill CLI (run manually, not imported)
/**
 * SD-LEO-INFRA-ROADMAP-TITLE-WRITEBACK-BACKFILL-001 FR-2 — one-time idempotent backfill of titles for
 * the 'promote'-scored roadmap_wave_items that have no title (the ~67 promote items predating the
 * FR-1 write-back). Mirrors the promoter's own skip filter (roadmap-manager.js:285-290) so the
 * fable_gated / chairman_* / dropped / deferred items are naturally excluded.
 *
 * Per item: resolve the FLOOR title via source_type/source_id → eva_todoist_intake.title /
 * eva_youtube_intake.title (both TEXT NOT NULL). Distillation of an SD-quality title from the persona
 * reasoning is OPTIONAL and falls back to the floor title when unavailable (this run uses the floor
 * title — a real human/source title, exactly what FR-1 preserves going forward).
 *
 * DRY-RUN by default (prints the plan); pass --apply to write. Idempotent: the UPDATE is guarded
 * (title IS NULL AND promoted_to_sd_key IS NULL AND refine_recommendation='promote'), so re-running is
 * a no-op for already-titled rows.
 *
 * Usage: node scripts/one-off/backfill-roadmap-promote-titles.js [--apply]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { fileURLToPath, pathToFileURL } from 'url';

const INTAKE_TABLE = { todoist: 'eva_todoist_intake', youtube: 'eva_youtube_intake' };

// Resolve the floor title for an item from its source intake table (fail-soft → null).
async function resolveFloorTitle(supabase, item) {
  const table = INTAKE_TABLE[item.source_type];
  if (!table || !item.source_id) return null;
  try {
    const { data, error } = await supabase.from(table).select('title').eq('id', item.source_id).maybeSingle();
    if (error || !data) return null;
    const t = (data.title || '').trim();
    return t && t !== '(untitled)' ? t : null;
  } catch { return null; }
}

export async function runBackfill({ supabase, apply = false, log = console.log } = {}) {
  // Selection mirrors the promoter's skip filter: promote-scored, untitled, not promoted, not a
  // brainstorm child, not dropped/deferred.
  const { data: rows, error } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, source_id, item_disposition, promoted_to_sd_key, brainstorm_session_id, metadata')
    .is('title', null)
    .is('promoted_to_sd_key', null)
    .is('brainstorm_session_id', null)
    .eq('metadata->>refine_recommendation', 'promote');
  if (error) { log(`[backfill] query failed: ${error.message}`); return { selected: 0, titled: 0, skipped: 0, applied: apply }; }
  const candidates = (rows || []).filter(r => !['dropped', 'deferred'].includes(r.item_disposition));

  let titled = 0, skipped = 0;
  for (const item of candidates) {
    const floor = await resolveFloorTitle(supabase, item);
    // (distillation hook: an SD-quality title could be distilled from
    //  metadata.refine_persona_scores[*].reasoning + the floor title; unavailable in this one-off →
    //  fall back to the floor title, per FR-2.)
    const newTitle = floor;
    if (!newTitle) { skipped++; log(`[backfill] SKIP ${item.id} (no resolvable source title for ${item.source_type}/${item.source_id})`); continue; }
    if (!apply) { titled++; log(`[backfill] DRY-RUN would title ${item.id} → "${newTitle.slice(0, 80)}"`); continue; }
    const { data: upd, error: uErr } = await supabase
      .from('roadmap_wave_items')
      .update({ title: newTitle })
      .eq('id', item.id)
      .is('title', null)                                   // idempotency guard
      .is('promoted_to_sd_key', null)
      .eq('metadata->>refine_recommendation', 'promote')
      .select('id');
    if (uErr) { skipped++; log(`[backfill] ERROR ${item.id}: ${uErr.message}`); continue; }
    if (upd && upd.length) { titled++; log(`[backfill] titled ${item.id} → "${newTitle.slice(0, 80)}"`); }
    else { skipped++; log(`[backfill] no-op ${item.id} (already titled/promoted — idempotent)`); }
  }
  log(`[backfill] ${apply ? 'APPLIED' : 'DRY-RUN'}: selected ${candidates.length}, titled ${titled}, skipped ${skipped}`);
  return { selected: candidates.length, titled, skipped, applied: apply };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  runBackfill({ supabase: createSupabaseServiceClient(), apply })
    .then(() => process.exit(0))
    .catch(err => { console.error('backfill error:', err.message); process.exit(1); });
}
