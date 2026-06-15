#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-6) — mark genuinely-stale vision duplicates as
 * superseded_by='VISION-EHG-L1-001'. VERIFY-DON'T-REBUILD; NEVER DELETE — every row is preserved,
 * only marked. So that exactly ONE vision source remains the discoverable active canonical.
 *
 * Per-table marker (tables differ in shape — there is no single superseded_by column):
 *   strategic_roadmaps  (metadata col) → metadata.superseded_by + reason + superseded_at
 *   roadmap_waves       (metadata col) → metadata.superseded_by + reason + superseded_at
 *   strategic_themes    (NO metadata col; status CHECK = draft|active|archived) → status='archived'
 *                        + an idempotent "[SUPERSEDED_BY:VISION-EHG-L1-001 ...]" marker appended to
 *                        description (records the WHY without a delete).
 *   strategic_vision    (NO metadata col; only is_active) → EHG-2028 is ALREADY is_active=false
 *                        (FR-6: verify, do not redo) → REPORTED, no write.
 *
 * Metadata writes MERGE into existing metadata (never clobber). Idempotent: re-running is a no-op.
 *
 * GOVERNANCE: PREPARED but NOT RUN by the worker. Dry run by default (prints exactly which rows it
 * would touch + before/after marker). Re-run with `--apply` to write.
 *
 * Targets (confirmed live 2026-06-15):
 *   strategic_roadmaps  ed12bf74-57c9-4ee0-a1b3-273bef11705c  "EVA Intake Roadmap"
 *   roadmap_waves       6 rows under that roadmap (Waves 1-6)
 *   strategic_themes    11 pre-pivot rows (THEME-2026-002..012, 2026-02-20, status='draft')
 *   strategic_vision    a5ecb994 "EHG-2028" (already inactive — verify only)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CANON = 'VISION-EHG-L1-001';
const REASON = 'Pre-pivot artifact; superseded by the canonical EHG vision (VISION-EHG-L1-001). Retained, not deleted.';
const EVA_ROADMAP_ID = 'ed12bf74-57c9-4ee0-a1b3-273bef11705c';
const EHG2028_ID = 'a5ecb994-aa27-47ec-8e65-39207a0b24c8';
const THEME_MARKER = `[SUPERSEDED_BY:${CANON}]`;

const APPLY = process.argv.includes('--apply');
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const nowIso = new Date().toISOString();
const touched = [];

function markedMeta(meta) {
  const m = (meta && typeof meta === 'object') ? { ...meta } : {};
  m.superseded_by = CANON;
  m.superseded_reason = REASON;
  m.superseded_at = m.superseded_at || nowIso;
  return m;
}
function alreadyMeta(meta) { return meta && meta.superseded_by === CANON; }

(async () => {
  // ── 1. strategic_roadmaps: EVA Intake Roadmap ──
  const { data: rm, error: rmErr } = await db.from('strategic_roadmaps')
    .select('id, title, status, metadata').eq('id', EVA_ROADMAP_ID).maybeSingle();
  if (rmErr) { console.error('roadmap read: ' + rmErr.message); }
  else if (!rm) { console.warn(`EVA Intake Roadmap ${EVA_ROADMAP_ID} not found`); }
  else if (alreadyMeta(rm.metadata)) { console.log(`[skip] strategic_roadmaps ${rm.id} "${rm.title}" already superseded`); }
  else {
    touched.push({ table: 'strategic_roadmaps', id: rm.id, label: rm.title, marker: 'metadata.superseded_by' });
    if (APPLY) {
      const { error } = await db.from('strategic_roadmaps').update({ metadata: markedMeta(rm.metadata) }).eq('id', rm.id);
      if (error) console.error('roadmap update: ' + error.message);
    }
  }

  // ── 2. roadmap_waves under the EVA Intake Roadmap ──
  const { data: waves, error: wErr } = await db.from('roadmap_waves')
    .select('id, title, metadata').eq('roadmap_id', EVA_ROADMAP_ID);
  if (wErr) { console.error('waves read: ' + wErr.message); }
  else for (const w of (waves || [])) {
    if (alreadyMeta(w.metadata)) { console.log(`[skip] roadmap_waves ${w.id} "${w.title}" already superseded`); continue; }
    touched.push({ table: 'roadmap_waves', id: w.id, label: w.title, marker: 'metadata.superseded_by' });
    if (APPLY) {
      const { error } = await db.from('roadmap_waves').update({ metadata: markedMeta(w.metadata) }).eq('id', w.id);
      if (error) console.error(`wave ${w.id} update: ` + error.message);
    }
  }

  // ── 3. strategic_themes: pre-pivot rows (no metadata col → status='archived' + description marker) ──
  const { data: themes, error: thErr } = await db.from('strategic_themes')
    .select('id, theme_key, title, status, description, derived_from_vision, year')
    // pre-pivot rows are stale DRAFTs (2026-02-20); status='draft' keeps a FUTURE
    // active/promoted canonical-vision theme from ever being swept up by this filter.
    .eq('derived_from_vision', true).eq('year', 2026).eq('status', 'draft');
  if (thErr) { console.error('themes read: ' + thErr.message); }
  else for (const th of (themes || [])) {
    const desc = th.description || '';
    const already = th.status === 'archived' && desc.includes(THEME_MARKER);
    if (already) { console.log(`[skip] strategic_themes ${th.theme_key} already archived+marked`); continue; }
    const newDesc = desc.includes(THEME_MARKER) ? desc : `${desc}\n\n${THEME_MARKER} ${REASON}`.trim();
    touched.push({ table: 'strategic_themes', id: th.id, label: `${th.theme_key} ${th.title}`, marker: "status='archived' + description marker" });
    if (APPLY) {
      const { error } = await db.from('strategic_themes').update({ status: 'archived', description: newDesc }).eq('id', th.id);
      if (error) console.error(`theme ${th.theme_key} update: ` + error.message);
    }
  }

  // ── 4. strategic_vision EHG-2028: VERIFY already inactive (FR-6: verify, do not redo) ──
  const { data: sv, error: svErr } = await db.from('strategic_vision')
    .select('id, code, title, is_active').eq('id', EHG2028_ID).maybeSingle();
  if (svErr) console.error('strategic_vision read: ' + svErr.message);
  else if (!sv) console.warn(`EHG-2028 ${EHG2028_ID} not found`);
  else if (sv.is_active === false) console.log(`[verified] strategic_vision ${sv.code} already inactive (is_active=false) — no write (no metadata/superseded_by column on this table)`);
  else {
    console.warn(`[ATTENTION] strategic_vision ${sv.code} is STILL ACTIVE — FR-6 expected it inactive; not auto-changing (chairman call)`);
  }

  // ── Report ──
  console.log('\n=== FR-6 rows this script WOULD ' + (APPLY ? 'WRITE' : 'TOUCH (dry run)') + ' ===');
  if (touched.length === 0) console.log('(none — all targets already superseded/verified)');
  for (const r of touched) console.log(`  ${r.table}  ${r.id}  ${r.marker}  ${EM_SAFE(r.label)}`);
  console.log(`\nTotal: ${touched.length} row(s). superseded_by='${CANON}'. NOTHING is deleted.`);
  if (!APPLY) console.log('[DRY RUN] no write performed. Re-run with --apply to write the markers.');
})();

function EM_SAFE(s) { return String(s ?? '').replace(/\s+/g, ' ').slice(0, 80); }
