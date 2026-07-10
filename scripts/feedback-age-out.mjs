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

const apply = process.argv.includes('--apply');
const AGE_OUT_DAYS = 30;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - AGE_OUT_DAYS * 24 * 3600 * 1000).toISOString();

const { data: candidates, error: selErr } = await supabase
  .from('feedback')
  .select('id')
  .eq('category', 'informational_note')
  .is('archived_at', null)
  .lt('updated_at', cutoff);

if (selErr) {
  console.error('ERROR (select candidates):', JSON.stringify(selErr));
  process.exitCode = 1;
  process.exit();
}

console.log(`Candidates: ${candidates.length} informational_note row(s) untouched ${AGE_OUT_DAYS}+ days.`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply to set archived_at.');
  process.exit();
}

if (candidates.length === 0) {
  console.log('Nothing to age out.');
  process.exit();
}

const { data: updated, error: updErr } = await supabase
  .from('feedback')
  .update({ archived_at: new Date().toISOString() })
  .eq('category', 'informational_note')
  .is('archived_at', null)
  .lt('updated_at', cutoff)
  .select('id');

if (updErr) {
  console.error('ERROR (update):', JSON.stringify(updErr));
  process.exitCode = 1;
  process.exit();
}

console.log(`Archived ${updated.length} row(s).`);
