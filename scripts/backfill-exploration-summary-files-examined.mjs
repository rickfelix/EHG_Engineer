#!/usr/bin/env node
/**
 * One-shot migration: move `exploration_summary.files_examined` arrays
 * to the canonical `exploration_summary.files_explored` key on
 * strategic_directives_v2. Idempotent — re-running is safe.
 *
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR7)
 *
 * Context: `files_examined` was an undocumented alternate key that a few
 * SD creators populated. `scripts/phase-preflight.js` now reads either key
 * (dual-key support) but the canonical location is `files_explored`.
 * This migration consolidates stored data onto the canonical key.
 *
 * Usage:
 *   node scripts/migrate-exploration-summary-files-examined.mjs [--dry-run]
 *
 * Behavior:
 *   - Scans strategic_directives_v2 for rows where
 *     exploration_summary.files_examined is a non-empty array AND
 *     exploration_summary.files_explored is missing.
 *   - For each match, copies the files_examined array into files_explored
 *     and drops the files_examined key (single atomic UPDATE).
 *   - If BOTH keys exist, leaves the row alone (caller should audit).
 *
 * Exit codes:
 *   0  success (or nothing to migrate)
 *   1  argument error
 *   2  DB error
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[migrate] missing SUPABASE_URL/SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  console.log(`[migrate] ${DRY_RUN ? 'DRY RUN — ' : ''}scanning strategic_directives_v2 for files_examined usage...`);

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, exploration_summary')
    .not('exploration_summary', 'is', null);

  if (error) {
    console.error('[migrate] scan failed:', error.message);
    process.exit(2);
  }

  const candidates = (data || []).filter((r) => {
    const es = r.exploration_summary || {};
    return Array.isArray(es.files_examined) && es.files_examined.length > 0;
  });

  if (candidates.length === 0) {
    console.log('[migrate] No rows to migrate.');
    process.exit(0);
  }

  console.log(`[migrate] Found ${candidates.length} candidate row(s):`);

  let migrated = 0;
  let conflicts = 0;
  let errors = 0;

  for (const row of candidates) {
    const es = row.exploration_summary || {};
    const hasExplored = Array.isArray(es.files_explored) && es.files_explored.length > 0;
    if (hasExplored) {
      console.log(`  - SKIP ${row.sd_key}: both keys present (files_explored has ${es.files_explored.length}, files_examined has ${es.files_examined.length}) — audit manually`);
      conflicts++;
      continue;
    }

    const newES = { ...es, files_explored: es.files_examined };
    delete newES.files_examined;

    console.log(`  - ${DRY_RUN ? 'WOULD MIGRATE' : 'MIGRATE'} ${row.sd_key}: files_examined[${es.files_examined.length}] → files_explored`);

    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .from('strategic_directives_v2')
        .update({ exploration_summary: newES })
        .eq('id', row.id);
      if (updErr) {
        console.error(`    ERROR: ${updErr.message}`);
        errors++;
      } else {
        migrated++;
      }
    }
  }

  console.log('');
  console.log(`[migrate] Summary: candidates=${candidates.length}, ${DRY_RUN ? 'would_migrate' : 'migrated'}=${DRY_RUN ? candidates.length - conflicts : migrated}, skipped_conflicts=${conflicts}, errors=${errors}`);

  process.exit(errors > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error('[migrate] fatal:', e.message);
  process.exit(2);
});
