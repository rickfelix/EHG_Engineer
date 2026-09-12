#!/usr/bin/env node
/**
 * FR-6: archive-not-delete age-out for informational feedback rows.
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: converted from a bulk set-based UPDATE (rejected by
 * the append-only trigger) to a root-scoped per-row insert-correction. Previously had NO
 * per-row fetch at all; now selects the full matching root rows, chunked, and resolves each
 * to its latest state before deciding whether a correction is still needed.
 *
 * Sets archived_at = now() (via a correction row) on rows WHERE category='informational_note'
 * AND archived_at IS NULL AND updated_at < now() - 30 days. Rows in any other category are
 * structurally excluded by the WHERE clause -- actionable (harness_backlog) rows never age
 * out; they either get promoted (FR-5) or manually dispositioned. No DELETE is ever issued (TR-3).
 *
 * Usage:
 *   node scripts/feedback-age-out.mjs           # dry run (default)
 *   node scripts/feedback-age-out.mjs --apply    # actually set archived_at
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { renderCount } from '../lib/db/fetch-all-paginated.mjs';
import { fetchLatestFeedback, buildFeedbackCorrection } from '../lib/governance/feedback-correction.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const AGE_OUT_DAYS = 30;
const FETCH_CHUNK = 200;

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
    .is('metadata->>corrects_feedback_id', null)
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

  console.log(`Candidates: ${candidateCount} informational_note root row(s) untouched ${AGE_OUT_DAYS}+ days.`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to set archived_at.');
    return;
  }

  if (candidateCount === 0) {
    console.log('Nothing to age out.');
    return;
  }

  // SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: fetch the full root rows (needed to build a
  // correction payload) chunked via .range(), then resolve each to its latest state and skip
  // anything already archived by another correction before inserting.
  let archived = 0;
  let skippedAlreadyHandled = 0;
  for (let offset = 0; ; offset += FETCH_CHUNK) {
    const { data: page, error: pageErr } = await supabase
      .from('feedback')
      .select('*')
      .eq('category', 'informational_note')
      .is('archived_at', null)
      .is('metadata->>corrects_feedback_id', null)
      .lt('updated_at', cutoff)
      .order('id', { ascending: true })
      .range(offset, offset + FETCH_CHUNK - 1);

    if (pageErr) {
      console.error('ERROR (fetch page):', JSON.stringify(pageErr));
      process.exitCode = 1;
      process.exit();
    }
    const rows = Array.isArray(page) ? page : [];
    if (rows.length === 0) break;

    for (const candidate of rows) {
      const latestResult = await fetchLatestFeedback(supabase, candidate.id);
      if (latestResult.error) {
        console.error(`ERROR (resolve latest for ${candidate.id}): ${latestResult.error}`);
        continue;
      }
      if (latestResult.row.archived_at) {
        skippedAlreadyHandled++;
        continue;
      }

      const payload = buildFeedbackCorrection(latestResult.row, { archived_at: new Date().toISOString() });
      const { error: insertError } = await supabase.from('feedback').insert(payload);
      if (insertError) {
        console.error(`ERROR (insert correction for ${candidate.id}):`, JSON.stringify(insertError));
        process.exitCode = 1;
        process.exit();
      }
      archived++;
    }

    if (rows.length < FETCH_CHUNK) break;
  }

  console.log(`Archived ${archived} row(s) (${skippedAlreadyHandled} already handled by a prior run/write).`);
}

if (isMainModule(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main({ apply }).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
