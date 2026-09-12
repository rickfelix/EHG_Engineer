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
import { isMainModule } from '../lib/utils/is-main-module.js';

const AGE_OUT_DAYS = 30;

/**
 * Exported so tests can call it directly with explicit options -- reading argv / constructing
 * the client at module-load time made this script's behavior depend on the shared process.argv
 * global, which races against any other bare-main script imported in the same vitest worker
 * (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A). Mirrors the
 * scripts/one-off/backfill-stranded-escalated-qfs.mjs pattern.
 */
export async function main({ apply = false, supabase: injectedSupabase = null } = {}) {
  const supabase = injectedSupabase || createClient(
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
    return;
  }

  if (candidateCount === 0) {
    console.log('Nothing to age out.');
    return;
  }

  // GAUGE on the UPDATE...RETURNING itself: the update is NOT row-limited (PostgREST's max-rows
  // caps the RETURNING response, not how many rows the server-side UPDATE mutates), but a plain
  // `.select('id')` RETURNING array WOULD be capped at 1000 for the reported count -- count:'exact'
  // with head:true reports the true number of rows the UPDATE touched without a row-array cap.
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
}

if (isMainModule(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main({ apply }).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
