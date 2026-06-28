#!/usr/bin/env node
/**
 * Backfill extracted_dimensions + sections for eager-synthesis visions that have NULL dims.
 * SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001 (FR-3).
 *
 * The eager-synthesis writer (upsertEvaVisionFromArtifacts) historically wrote visions WITHOUT
 * extracted_dimensions/sections, so they fail eva_vision_documents_active_rich_check on promotion.
 * The writer is now fixed going forward; this repairs the existing rows from their own content.
 *
 * Idempotent: only touches created_by='eager-synthesis' rows whose extracted_dimensions is null/empty.
 * The clean-clone vision (already hand-repaired) and any non-eager-synthesis vision are untouched.
 *
 * Usage: node scripts/one-off/backfill-eager-synthesis-vision-dims.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseMarkdownToSections, buildDefaultMapping } from '../eva/markdown-to-sections-parser.mjs';
import { extractDimensions } from '../../lib/eva/vision-dimensions-extractor.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, content, extracted_dimensions')
    .eq('created_by', 'eager-synthesis');
  if (error) { console.error('Query failed:', error.message); process.exit(1); }

  const targets = (rows || []).filter(
    r => !Array.isArray(r.extracted_dimensions) || r.extracted_dimensions.length === 0
  );
  console.log(`[backfill] eager-synthesis visions: ${rows?.length || 0} | NULL-dims targets: ${targets.length}${DRY_RUN ? ' (dry-run)' : ''}`);

  let repaired = 0;
  for (const r of targets) {
    if (!r.content || r.content.length < 1) { console.warn(`[backfill] skip ${r.vision_key}: empty content`); continue; }
    let sections = null;
    try { sections = parseMarkdownToSections(r.content, buildDefaultMapping()); }
    catch (e) { console.warn(`[backfill] ${r.vision_key} section parse failed: ${e.message}`); }
    const dims = await extractDimensions(r.content); // fail-soft: returns null on LLM failure
    if (!dims && !sections) { console.warn(`[backfill] ${r.vision_key}: nothing to write (no dims, no sections)`); continue; }
    if (DRY_RUN) { console.log(`[backfill] would update ${r.vision_key}: dims=${dims ? dims.length : 0}, sections=${sections ? 'yes' : 'no'}`); continue; }
    const update = { updated_at: new Date().toISOString() };
    if (dims) update.extracted_dimensions = dims;
    if (sections) update.sections = sections;
    const { error: upErr } = await supabase.from('eva_vision_documents').update(update).eq('vision_key', r.vision_key);
    if (upErr) { console.warn(`[backfill] ${r.vision_key} update failed: ${upErr.message}`); continue; }
    console.log(`[backfill] repaired ${r.vision_key}: dims=${dims ? dims.length : 0}, sections=${sections ? 'yes' : 'no'}`);
    repaired++;
  }
  console.log(`[backfill] done: ${DRY_RUN ? 0 : repaired} repaired of ${targets.length} target(s)`);
  process.exit(0);
}

main();
