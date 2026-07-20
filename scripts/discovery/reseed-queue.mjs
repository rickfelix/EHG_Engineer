#!/usr/bin/env node
/**
 * Archive-first reversible reseed of the opportunity_blueprints queue.
 * SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001 (FR-2)
 *
 * Classifies the stale queue rows (E2E fixtures vs real ideas) and archives
 * ALL of them via IN-TABLE reversibility: is_active=false + metadata
 * archive stamps. NOT retention_archive — keeps live queryability + FKs
 * (PURGE-UNDO ≠ DR). Reversal = flip is_active back to true.
 *
 * Reseed happens at the FIRST LIVE SCAN (explicit chairman/CLI invocation —
 * out of scope here); this script leaves the active queue empty and ready.
 *
 * Usage:
 *   node scripts/discovery/reseed-queue.mjs            # dry-run (default)
 *   node scripts/discovery/reseed-queue.mjs --apply    # archive for real
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — this script's own docstring
// promises to archive ALL active rows; a PostgREST-capped read would silently leave rows
// beyond the cap un-archived while reporting "reseed-ready". Paginate to completion.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const SD_KEY = 'SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001';

function classify(row) {
  // Validation-enumerated sentinels: fixtures carry the 'E2E Test:' title
  // prefix and source_type='manual'; real ideas are ai_generated.
  if (/^E2E Test:/i.test(row.title || '') || row.source_type === 'manual') return 'e2e_fixture';
  return 'real_idea';
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
  const db = createClient(url, key);

  let rows;
  try {
    rows = await fetchAllPaginated(() => db
      .from('opportunity_blueprints')
      .select('id, title, source_type, is_active, metadata')
      .eq('is_active', true)
      .order('id', { ascending: true }));
  } catch (e) { console.error('read failed:', e.message); process.exit(1); }

  if (!rows?.length) {
    console.log('Active queue already empty — nothing to archive (reseed-ready).');
    return;
  }

  console.log(`${APPLY ? 'ARCHIVING' : 'DRY-RUN'}: ${rows.length} active row(s)\n`);
  const archivedAt = new Date().toISOString();
  let failed = 0;

  for (const row of rows) {
    const kind = classify(row);
    console.log(`  [${kind}] ${row.id}  ${row.title}`);
    if (!APPLY) continue;
    const { error: upErr } = await db
      .from('opportunity_blueprints')
      .update({
        is_active: false,
        metadata: {
          ...(row.metadata || {}),
          archived_at: archivedAt,
          archived_by: SD_KEY,
          archive_reason: `pre-revival queue reseed (${kind}); reversible — flip is_active=true to restore`,
          archive_classification: kind,
        },
      })
      .eq('id', row.id);
    if (upErr) { console.error(`    ✗ ${upErr.message}`); failed++; }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to archive (0 deletes, reversible).');
  } else {
    console.log(`\nDone: ${rows.length - failed} archived, ${failed} failed, 0 deleted. Queue is reseed-ready.`);
    if (failed > 0) process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
