#!/usr/bin/env node
/**
 * Backfill script for venture_artifacts table.
 *
 * SD-EVA-INFRA-UNIFIED-PERSIST-SVC-001 (US-005)
 *
 * Repairs two data integrity issues:
 *   1. CONTENT_NULL: Artifacts with artifact_data but NULL content
 *   2. DUPLICATE_IS_CURRENT: Multiple is_current=true rows per venture/stage/type
 *
 * Usage:
 *   node scripts/backfill-artifact-data.mjs              # Dry run (report only)
 *   node scripts/backfill-artifact-data.mjs --apply       # Execute repairs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = !process.argv.includes('--apply');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backfillContentNull() {
  console.log('\n=== Phase 1: CONTENT_NULL Repair ===');

  const { data: nullContent, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, lifecycle_stage, artifact_data')
    .is('content', null)
    .not('artifact_data', 'is', null);

  if (error) {
    console.error('Query failed:', error.message);
    return { found: 0, repaired: 0 };
  }

  console.log(`Found ${nullContent.length} artifacts with NULL content but non-NULL artifact_data`);

  if (DRY_RUN) {
    nullContent.slice(0, 5).forEach(a => {
      console.log(`  [DRY] ${a.id} | stage ${a.lifecycle_stage} | ${a.artifact_type}`);
    });
    if (nullContent.length > 5) console.log(`  ... and ${nullContent.length - 5} more`);
    return { found: nullContent.length, repaired: 0 };
  }

  let repaired = 0;
  for (const artifact of nullContent) {
    const contentStr = JSON.stringify(artifact.artifact_data);
    const { error: updateErr } = await supabase
      .from('venture_artifacts')
      .update({ content: contentStr })
      .eq('id', artifact.id);

    if (updateErr) {
      console.error(`  FAIL ${artifact.id}: ${updateErr.message}`);
    } else {
      repaired++;
    }
  }

  console.log(`Repaired ${repaired}/${nullContent.length} CONTENT_NULL artifacts`);
  return { found: nullContent.length, repaired };
}

async function fixDuplicateIsCurrent() {
  console.log('\n=== Phase 2: DUPLICATE_IS_CURRENT Repair ===');

  // Find duplicates: multiple is_current=true per venture/stage/type
  const { data: allCurrent, error } = await supabase
    .from('venture_artifacts')
    .select('id, venture_id, lifecycle_stage, artifact_type, created_at')
    .eq('is_current', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Query failed:', error.message);
    return { found: 0, repaired: 0 };
  }

  // Group by venture_id + lifecycle_stage + artifact_type
  const groups = new Map();
  for (const row of allCurrent) {
    const key = `${row.venture_id}|${row.lifecycle_stage}|${row.artifact_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const totalDuplicateRows = duplicates.reduce((sum, [, rows]) => sum + rows.length - 1, 0);

  console.log(`Found ${duplicates.length} duplicate groups (${totalDuplicateRows} rows to fix)`);

  if (DRY_RUN) {
    duplicates.slice(0, 5).forEach(([key, rows]) => {
      console.log(`  [DRY] ${key}: ${rows.length} is_current=true (keeping newest)`);
    });
    if (duplicates.length > 5) console.log(`  ... and ${duplicates.length - 5} more`);
    return { found: totalDuplicateRows, repaired: 0 };
  }

  let repaired = 0;
  for (const [, rows] of duplicates) {
    // Keep newest (first in list since sorted desc), set rest to false
    const toFix = rows.slice(1);
    for (const row of toFix) {
      const { error: updateErr } = await supabase
        .from('venture_artifacts')
        .update({ is_current: false })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`  FAIL ${row.id}: ${updateErr.message}`);
      } else {
        repaired++;
      }
    }
  }

  console.log(`Repaired ${repaired}/${totalDuplicateRows} duplicate is_current rows`);
  return { found: totalDuplicateRows, repaired };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Venture Artifact Backfill Script                   ║');
  console.log('║  SD-EVA-INFRA-UNIFIED-PERSIST-SVC-001               ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'APPLY (writing changes)'}             ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  const contentResult = await backfillContentNull();
  const duplicateResult = await fixDuplicateIsCurrent();

  console.log('\n=== REPORT ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`);
  console.log(`CONTENT_NULL: ${contentResult.found} found, ${contentResult.repaired} repaired`);
  console.log(`DUPLICATE_IS_CURRENT: ${duplicateResult.found} found, ${duplicateResult.repaired} repaired`);

  if (DRY_RUN && (contentResult.found > 0 || duplicateResult.found > 0)) {
    console.log('\nTo apply repairs, run: node scripts/backfill-artifact-data.mjs --apply');
  }
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
