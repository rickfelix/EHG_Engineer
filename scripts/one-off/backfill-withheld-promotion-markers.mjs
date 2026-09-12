#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A (FR-8/FR-9 step 2): one-off backfill of
 * feedback.metadata withheld-promotion bookkeeping into withheld_promotion_markers (FR-7's
 * migration, step 1). Idempotent (upsert on feedback_id PK) -- safe to re-run.
 *
 * Per FR-8's own acceptance criterion, this is NOT done on "ran without error": it prints an
 * explicit BEFORE count (measured from feedback.metadata) vs AFTER count (measured from
 * withheld_promotion_markers, --apply only) and states plainly whether they match. FR-9's
 * producer cutover (withheld-registry.mjs, feedback-fingerprint-promoter.mjs) may only proceed
 * once this reports MATCH.
 *
 * Usage:
 *   node scripts/one-off/backfill-withheld-promotion-markers.mjs           # dry run (counts only)
 *   node scripts/one-off/backfill-withheld-promotion-markers.mjs --apply    # write + verify
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { MARKER_KEY } from '../../lib/governance/withheld-registry.mjs';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import {
  buildBackfillRows,
  computeBeforeCounts,
  computeAfterCounts,
  verifyBackfillCounts,
} from '../../lib/governance/withheld-promotion-markers-backfill.mjs';

const apply = process.argv.includes('--apply');
const CHUNK = 200;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const setA = await fetchAllPaginated(() => supabase
    .from('feedback').select('id, metadata')
    .not(`metadata->>${MARKER_KEY}`, 'is', null)
    .order('id', { ascending: true }));
  const setB = await fetchAllPaginated(() => supabase
    .from('feedback').select('id, metadata')
    .eq('metadata->>promoted_to_qf', 'true')
    .is(`metadata->>${MARKER_KEY}`, null)
    .order('id', { ascending: true }));

  const before = computeBeforeCounts(setA, setB);
  console.log(`[BEFORE] (feedback.metadata) withheldPendingRows=${before.withheldPendingRows} pendingRows=${before.pendingRows} promotedRows=${before.promotedRows} totalMarkerRows=${before.totalMarkerRows}`);

  const rows = buildBackfillRows(setA, setB);
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${rows.length} row(s) to upsert into withheld_promotion_markers`);

  if (!apply) {
    console.log('\nRe-run with --apply to write, then verify the AFTER counts.');
    return;
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('withheld_promotion_markers')
      .upsert(chunk, { onConflict: 'feedback_id' });
    if (error) {
      console.error(`[BACKFILL_FAILED] chunk ${i}-${i + chunk.length}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const written = await fetchAllPaginated(() => supabase
    .from('withheld_promotion_markers').select('promoted_at, disposed_at'));
  const after = computeAfterCounts(written);
  console.log(`[AFTER]  (withheld_promotion_markers) pendingRows=${after.pendingRows} promotedRows=${after.promotedRows} totalMarkerRows=${after.totalMarkerRows}`);

  const verdict = verifyBackfillCounts(before, after);
  if (verdict.matched) {
    console.log('[MATCH] before/after counts agree -- FR-9 producer cutover may proceed.');
  } else {
    console.error(`[MISMATCH] before/after counts disagree -- DO NOT cut over producers:\n  ${verdict.mismatches.join('\n  ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[backfill-withheld-promotion-markers] FAILED: ${err.message}`);
  process.exit(1);
});
