#!/usr/bin/env node
/**
 * Fail-safe, reversible backfill for wireframe_screens.surface + page_type
 * SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-C
 *
 * Assigns surface (marketing|auth|app) and page_type to existing wireframe_screens
 * rows that were written before EVA_SURFACE_AWARE_ENABLED was on.
 *
 * Classification rules: same `classifySurface()` pure function used at generation
 * time — no divergence from the canonical logic.
 *
 * Defaults: INDETERMINATE screens (anything not matching marketing or auth regex) are
 * assigned surface='app' — the MOST RESTRICTIVE default.  This is intentionally
 * conservative: marketing/auth pages should be explicitly named; indeterminate names
 * get the safe "authenticated" default and can be corrected by re-running generation.
 *
 * Usage:
 *   node scripts/backfill-wireframe-screen-surfaces.mjs [--dry-run] [--limit N]
 *
 * Flags:
 *   --dry-run       Print the rows that WOULD be updated; writes nothing.
 *   --limit N       Cap the number of rows processed (default: 1000).
 *
 * Rollback (documented):
 *   -- ROLLBACK: set surface + page_type back to NULL for all rows updated by
 *   -- this script (identified by the backfill_source metadata column if present,
 *   -- or by the updated_at timestamp range):
 *   --
 *   -- UPDATE wireframe_screens
 *   --   SET surface = NULL, page_type = NULL
 *   --   WHERE surface IS NOT NULL
 *   --     AND updated_at >= '<timestamp of backfill run>';
 *   --
 *   -- Or via the safe wrapper in the migration file:
 *   --   database/migrations/20260520_backfill_wireframe_surface_rollback.sql
 *
 * NOT applied to the live DB automatically — requires manual invocation.
 */

import { createClient } from '@supabase/supabase-js';
import { classifySurface } from '../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';

// ── CLI arg parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit=')) || args[args.indexOf('--limit') + 1];
const LIMIT = Math.min(parseInt(limitArg, 10) || 1000, 5000);

// ── Supabase client ──────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, key);
}

// ── classifyRow: pure function, re-uses canonical classifySurface ────────────
/**
 * Given a wireframe_screens row, return { surface, page_type }.
 * Defaults INDETERMINATE rows to surface='app' (most restrictive).
 *
 * @param {{ screen_name?: string, name?: string }} row
 * @returns {{ surface: 'marketing'|'auth'|'app', page_type: string }}
 */
export function classifyRow(row) {
  // wireframe_screens may store the screen name as `screen_name` or `name`
  const screenName = row?.screen_name || row?.name || '';
  return classifySurface({ name: screenName });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[backfill-wireframe-surface] Starting (dry_run=${DRY_RUN}, limit=${LIMIT})`);

  const supabase = getSupabase();

  // Fetch rows missing surface classification
  const { data: rows, error: fetchErr } = await supabase
    .from('wireframe_screens')
    .select('id, screen_name, name, surface, page_type')
    .is('surface', null)
    .limit(LIMIT);

  if (fetchErr) {
    console.error('[backfill-wireframe-surface] Fetch failed:', fetchErr.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('[backfill-wireframe-surface] No rows to backfill — all screens already have surface.');
    return;
  }

  console.log(`[backfill-wireframe-surface] Found ${rows.length} rows to classify.`);

  // Classify each row
  const updates = rows.map(row => {
    const { surface, page_type } = classifyRow(row);
    return { id: row.id, surface, page_type };
  });

  // Summary diff
  const byClass = { marketing: 0, auth: 0, app: 0 };
  for (const u of updates) byClass[u.surface]++;
  console.log('[backfill-wireframe-surface] Classification summary:', byClass);

  if (DRY_RUN) {
    console.log('[backfill-wireframe-surface] DRY RUN — sample of first 10 updates:');
    for (const u of updates.slice(0, 10)) {
      const row = rows.find(r => r.id === u.id);
      const name = row?.screen_name || row?.name || '(unknown)';
      console.log(`  id=${u.id} name="${name}" → surface=${u.surface} page_type=${u.page_type}`);
    }
    console.log('[backfill-wireframe-surface] DRY RUN complete. No changes written.');
    return;
  }

  // Apply in batches of 100 to avoid payload limits
  const BATCH = 100;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    // upsert using primary key to be idempotent
    const { error: upErr } = await supabase
      .from('wireframe_screens')
      .upsert(
        batch.map(u => ({ id: u.id, surface: u.surface, page_type: u.page_type })),
        { onConflict: 'id' }
      );

    if (upErr) {
      console.error(`[backfill-wireframe-surface] Batch ${i}-${i + BATCH} failed:`, upErr.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
    }
  }

  console.log(`[backfill-wireframe-surface] Done. updated=${successCount} errors=${errorCount}`);
}

main().catch(err => {
  console.error('[backfill-wireframe-surface] Fatal:', err.message);
  process.exit(1);
});
