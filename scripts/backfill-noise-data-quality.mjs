#!/usr/bin/env node
/**
 * Backfill issue_patterns.data_quality_status='noise' for existing
 * provider/test-stub PAT-AUTO patterns.
 * (SD-LEO-INFRA-SUPPRESS-PROVIDER-TEST-001, FR-4)
 *
 * Idempotent: only stamps rows that match the SAME classifier used at capture
 * (lib/rca/noise-classifier.js::isNoiseMessage) and are not already flagged.
 * Re-running changes 0 rows. Scoped to source='auto_rca' so manually-curated
 * patterns are never touched. Reversible: UPDATE issue_patterns SET
 * data_quality_status=NULL WHERE data_quality_status='noise'.
 *
 * Usage:
 *   node scripts/backfill-noise-data-quality.mjs            # apply
 *   node scripts/backfill-noise-data-quality.mjs --dry-run  # preview only
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isNoiseMessage } from '../lib/rca/noise-classifier.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the prior `.limit(5000)` below
// does NOT bound the read: PostgREST's server-side max-rows clamp (1000) applies regardless of
// a larger client-requested limit, so this backfill was silently scanning at most 1000 of
// possibly-more auto_rca issue_patterns rows every run. issue_patterns is a growing table (RCA
// pattern history); paginate to completion so every eligible row is actually scanned.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const sb = createClient(url, key);

  // Only auto_rca-sourced patterns are eligible; the classifier decides which.
  let rows;
  try {
    rows = await fetchAllPaginated(() => sb
      .from('issue_patterns')
      .select('pattern_id, issue_summary, data_quality_status, occurrence_count, source')
      .eq('source', 'auto_rca')
      .order('id', { ascending: true }));
  } catch (e) {
    console.error('Query failed:', e.message);
    process.exit(1);
  }

  const candidates = rows.filter(
    (r) => isNoiseMessage(r.issue_summary) && r.data_quality_status !== 'noise'
  );
  const alreadyFlagged = rows.filter((r) => r.data_quality_status === 'noise').length;
  const noiseOcc = candidates.reduce((sum, r) => sum + (r.occurrence_count || 0), 0);

  console.log(`auto_rca patterns scanned: ${rows.length}`);
  console.log(`already flagged noise:      ${alreadyFlagged}`);
  console.log(`to flag this run:           ${candidates.length} (${noiseOcc} occurrences)`);

  if (candidates.length === 0) {
    console.log('Nothing to do — idempotent no-op.');
    return;
  }
  for (const r of candidates.slice(0, 50)) {
    console.log(`  ${r.pattern_id} | occ=${r.occurrence_count} | ${(r.issue_summary || '').slice(0, 70)}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: no rows changed.');
    return;
  }

  let updated = 0;
  for (const r of candidates) {
    // Idempotency comes from the JS `candidates` filter above (excludes rows
    // already flagged 'noise'). Do NOT add a `.neq('data_quality_status',
    // 'noise')` guard here: NULL != 'noise' is NULL (not TRUE) in SQL, so it
    // would match 0 rows and silently no-op the backfill.
    const { error: ue, count } = await sb
      .from('issue_patterns')
      .update({ data_quality_status: 'noise', updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('pattern_id', r.pattern_id);
    if (ue) console.error(`  FAILED ${r.pattern_id}: ${ue.message}`);
    else if (count === 0) console.error(`  WARN ${r.pattern_id}: matched 0 rows`);
    else updated++;
  }
  console.log(`\nFlagged ${updated} pattern(s) as noise. Total now: ${alreadyFlagged + updated}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
