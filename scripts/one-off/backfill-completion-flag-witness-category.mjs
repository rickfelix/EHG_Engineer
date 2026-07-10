#!/usr/bin/env node
/**
 * FR-3: re-categorize existing completion-flag witness rows from
 * category='harness_backlog' to category='completion_flag_witness'.
 *
 * Identifies witness rows structurally via metadata.no_flags=true — the field
 * scripts/capture-completion-flags.js unconditionally sets on every zero-findings
 * witness write (see WITNESS_TUPLE / captureCompletionFlags). This is the ground-truth
 * marker; title-text matching and a dedup_key column were both considered and rejected
 * (dedup_key is not a stored column, only folded into metadata.dedup_hash; title text
 * varies and undercounts). Verified live before running: 63 rows matched
 * metadata->>'no_flags'='true', all with category='harness_backlog' and
 * status='backlog' already.
 *
 * Archive-not-delete (TR-3): this is a plain UPDATE re-categorization. No DELETE is
 * issued, no rows are lost, only feedback.category changes.
 *
 * Usage:
 *   node scripts/one-off/backfill-completion-flag-witness-category.mjs           # dry run
 *   node scripts/one-off/backfill-completion-flag-witness-category.mjs --apply   # apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: before, error: beforeErr } = await supabase
  .from('feedback')
  .select('id')
  .eq('category', 'harness_backlog')
  .eq('metadata->>no_flags', 'true');

if (beforeErr) {
  console.error('ERROR (pre-count):', JSON.stringify(beforeErr));
  process.exitCode = 1;
  process.exit();
}

console.log(`Matched ${before.length} witness rows (category='harness_backlog', metadata.no_flags=true).`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply to perform the UPDATE.');
  process.exit();
}

const { data: updated, error: updateErr } = await supabase
  .from('feedback')
  .update({ category: 'completion_flag_witness' })
  .eq('category', 'harness_backlog')
  .eq('metadata->>no_flags', 'true')
  .select('id');

if (updateErr) {
  console.error('ERROR (update):', JSON.stringify(updateErr));
  process.exitCode = 1;
  process.exit();
}

console.log(`Updated ${updated.length} rows to category='completion_flag_witness'.`);

if (updated.length !== before.length) {
  console.error(`WARNING: pre-count (${before.length}) != updated-count (${updated.length}) — investigate before trusting this run.`);
  process.exitCode = 1;
}
