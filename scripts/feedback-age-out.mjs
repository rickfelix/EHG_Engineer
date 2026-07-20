#!/usr/bin/env node
/**
 * FR-6: archive-not-delete age-out for informational feedback rows.
 *
 * Sets archived_at = now() on rows WHERE category='informational_note' AND
 * archived_at IS NULL AND updated_at < now() - 30 days. Rows in any other category
 * are structurally excluded by the WHERE clause -- actionable (harness_backlog) rows
 * never age out; they either get promoted (FR-5) or manually dispositioned. No DELETE
 * is ever issued (TR-3).
 *
 * Usage:
 *   node scripts/feedback-age-out.mjs           # dry run (default)
 *   node scripts/feedback-age-out.mjs --apply    # actually set archived_at
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { renderCount } from '../lib/db/fetch-all-paginated.mjs';

const apply = process.argv.includes('--apply');
const AGE_OUT_DAYS = 30;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - AGE_OUT_DAYS * 24 * 3600 * 1000).toISOString();

// GAUGE (only the count is used below) — exact head-count avoids the 1000-row cap
// misreporting the candidate count (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9).
const { count: candidateCountRaw, error: selErr } = await supabase
  .from('feedback')
  .select('id', { count: 'exact', head: true })
  .eq('category', 'informational_note')
  .is('archived_at', null)
  .lt('updated_at', cutoff);

if (selErr) {
  console.error('ERROR (select candidates):', JSON.stringify(selErr));
  process.exitCode = 1;
  process.exit();
}

const candidateCount = renderCount(candidateCountRaw);
if (typeof candidateCount !== 'number') {
  console.error('ERROR: candidate count unavailable (measurement failed) — aborting rather than mis-reporting.');
  process.exitCode = 1;
  process.exit();
}

console.log(`Candidates: ${candidateCount} informational_note row(s) untouched ${AGE_OUT_DAYS}+ days.`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply to set archived_at.');
  process.exit();
}

if (candidateCount === 0) {
  console.log('Nothing to age out.');
  process.exit();
}

// GAUGE on the UPDATE...RETURNING itself: the update is NOT row-limited (PostgREST's max-rows
// caps the RETURNING response, not how many rows the server-side UPDATE mutates), but the prior
// `.select('id')` RETURNING array WAS capped at 1000 for the reported count — count:'exact' with
// head:true reports the true number of rows the UPDATE touched without a row-array cap.
const { count: updatedCountRaw, error: updErr } = await supabase
  .from('feedback')
  .update({ archived_at: new Date().toISOString() })
  .eq('category', 'informational_note')
  .is('archived_at', null)
  .lt('updated_at', cutoff)
  .select('id', { count: 'exact', head: true });

if (updErr) {
  console.error('ERROR (update):', JSON.stringify(updErr));
  process.exitCode = 1;
  process.exit();
}

console.log(`Archived ${renderCount(updatedCountRaw)} row(s).`);
