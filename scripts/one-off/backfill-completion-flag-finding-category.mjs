#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 — FR-3 / FR-4.
 *
 * Two DISTINCT, INDEPENDENT, SEQUENCED predicate-defined passes over the `feedback` table:
 *
 *   PASS A (FR-3): rows WHERE category='harness_backlog' AND title ILIKE 'Completion flag (%'
 *                  -> category='completion_flag_finding'
 *   PASS B (FR-4): rows WHERE category='harness_backlog' AND metadata->>'no_flags'='true'
 *                  -> category='completion_flag_witness'
 *                  (sweeps the 2 leaked witness stragglers, ids bb073a83.../18d74e94...,
 *                  created after the original DRAIN-POLICY-001 witness backfill ran)
 *
 * Both predicates are evaluated FRESH at execution time against live data — never against a
 * count measured during LEAD investigation. Each pass logs its own ACTUAL matched/updated
 * count (never a hardcoded expectation), then re-queries its OWN predicate post-apply and
 * asserts 0 rows remain. Pass B never runs until Pass A has fully completed and logged its own
 * result — a failure in one predicate must never mask or block the other.
 *
 * COUNT-TRUNCATION DISCIPLINE (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): the LEAD-phase
 * measured population is ~4,598 rows — well past PostgREST's 1000-row default page cap. Both
 * the predicate select AND the id list driving the UPDATE go through fetchAllPaginated(); the
 * UPDATE itself is issued in id-chunked batches (.in('id', chunk)) rather than trusting a single
 * UPDATE...RETURNING call, which would silently truncate the returned id list (and therefore the
 * FR-7 out-file) at the same 1000-row cap even though the UPDATE itself affected every row.
 *
 * COULD-NOT-CHECK PATH: if a pass's post-apply re-query itself errors (DB unreachable,
 * permission denied), the pass is reported COULD_NOT_VERIFY — never treated as an implicit pass.
 *
 * EXIT-CODE CONTRACT:
 *   0 = both passes PASS (UPDATE succeeded AND post-apply verification confirms 0 remaining)
 *   1 = either pass's UPDATE itself failed (SQL/network error)
 *   2 = either pass's post-apply verification could-not-run (UPDATE succeeded, verify errored)
 *   (1 takes priority over 2 if both occur, since an UPDATE failure is the more severe outcome)
 *
 * FR-7: --out-file <path> is a REQUIRED argument — the script refuses to run without it. Every
 * updated row (across BOTH passes) is appended as one NDJSON line:
 *   {"id":"<uuid>","previous_category":"harness_backlog","new_category":"<...>","table":"feedback"}
 * This is the rollback artifact FR-9's revert script consumes.
 *
 * Usage:
 *   node scripts/one-off/backfill-completion-flag-finding-category.mjs --out-file <path>          # dry run
 *   node scripts/one-off/backfill-completion-flag-finding-category.mjs --out-file <path> --apply   # apply
 */
import 'dotenv/config';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

export const PASS_A = Object.freeze({
  name: 'FR-3 (per-flag findings)',
  previousCategory: 'harness_backlog',
  newCategory: 'completion_flag_finding',
});

export const PASS_B = Object.freeze({
  name: 'FR-4 (leaked witness stragglers)',
  previousCategory: 'harness_backlog',
  newCategory: 'completion_flag_witness',
});

/** UPDATE batch size for id-chunked writes — comfortably under the PostgREST/URL payload limits. */
const UPDATE_CHUNK_SIZE = 500;

/** Pass A predicate: category='harness_backlog' AND title ILIKE 'Completion flag (%'. */
function selectPassA(supabase) {
  return supabase.from('feedback').select('id').eq('category', PASS_A.previousCategory).ilike('title', 'Completion flag (%');
}

/** Pass B predicate: category='harness_backlog' AND metadata->>'no_flags'='true'. */
function selectPassB(supabase) {
  return supabase.from('feedback').select('id').eq('category', PASS_B.previousCategory).eq('metadata->>no_flags', 'true');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Run one predicate-defined pass end-to-end: paginated pre-select (the matched id list, never a
 * hardcoded expectation), id-chunked UPDATE, paginated post-apply re-verify. Never throws — every
 * failure mode is captured in the returned result so the caller can print a per-pass summary
 * regardless of the other pass's outcome (TS-8).
 *
 * @param {Object} supabase
 * @param {{name:string, previousCategory:string, newCategory:string}} pass
 * @param {Function} selectFn - (supabase) => PostgrestFilterBuilder (predicate select('id'), unranged)
 * @returns {Promise<{
 *   name:string, matchedCount:number, updatedCount:number, updatedIds:Array<string>,
 *   updateError:string|null, remainingAfter:number|null, verifyError:string|null,
 *   status:'PASS'|'FAIL'|'COULD_NOT_VERIFY'
 * }>}
 */
export async function runPass(supabase, pass, selectFn) {
  const result = {
    name: pass.name,
    matchedCount: 0,
    updatedCount: 0,
    updatedIds: [],
    updateError: null,
    remainingAfter: null,
    verifyError: null,
    status: 'PASS',
  };

  // Pre-select the FULL matched id list (paginated — never trust a single-page read for a
  // population that can exceed the 1000-row PostgREST cap).
  let matched;
  try {
    matched = await fetchAllPaginated(() => selectFn(supabase));
  } catch (e) {
    result.updateError = `pre-select query failed: ${e.message}`;
    result.status = 'FAIL';
    return result;
  }
  const matchedIds = matched.map((r) => r.id);
  result.matchedCount = matchedIds.length;

  if (matchedIds.length > 0) {
    // Id-chunked UPDATE — driven by the id list we already fetched, not by trusting
    // UPDATE...RETURNING to return every affected row past the 1000-row cap. Partial progress
    // (chunks that succeeded before a later chunk failed) is still captured for the out-file.
    for (const idChunk of chunk(matchedIds, UPDATE_CHUNK_SIZE)) {
      const { data: updated, error: updateErr } = await supabase
        .from('feedback')
        .update({ category: pass.newCategory })
        .in('id', idChunk)
        .select('id');
      if (updateErr) {
        result.updateError = `UPDATE failed on a chunk of ${idChunk.length} row(s): ${updateErr.message || JSON.stringify(updateErr)}`;
        result.status = 'FAIL';
        result.updatedCount = result.updatedIds.length;
        return result;
      }
      result.updatedIds.push(...(updated || []).map((r) => r.id));
    }
    result.updatedCount = result.updatedIds.length;
  }

  // Post-apply verification: re-query the SAME predicate fresh (paginated); assert 0 rows remain.
  let after;
  try {
    after = await fetchAllPaginated(() => selectFn(supabase));
  } catch (e) {
    result.verifyError = `POST_APPLY_VERIFICATION_COULD_NOT_RUN: ${e.message}`;
    result.status = 'COULD_NOT_VERIFY';
    return result;
  }
  result.remainingAfter = after.length;
  if (result.remainingAfter !== 0) {
    result.updateError = `post-apply predicate still matches ${result.remainingAfter} row(s) after UPDATE — convergence assertion failed`;
    result.status = 'FAIL';
    return result;
  }

  result.status = 'PASS';
  return result;
}

/** Render the required per-pass PASS/FAIL/COULD_NOT_VERIFY summary line (TS-8, AC(i)). */
export function formatPassSummary(result) {
  return `[${result.name}] ${result.status} — matched=${result.matchedCount} updated=${result.updatedCount} remainingAfter=${result.remainingAfter === null ? 'n/a' : result.remainingAfter}` +
    (result.updateError ? ` | error: ${result.updateError}` : '') +
    (result.verifyError ? ` | ${result.verifyError}` : '');
}

/**
 * Compute the overall exit code from both pass results (FR-4 exit-code contract).
 * 1 (UPDATE failure) takes priority over 2 (could-not-verify) if both occur.
 */
export function computeExitCode(results) {
  if (results.some((r) => r.status === 'FAIL')) return 1;
  if (results.some((r) => r.status === 'COULD_NOT_VERIFY')) return 2;
  return 0;
}

/** NDJSON line for one updated row (FR-7 rollback artifact contract). */
export function toNdjsonLine({ id, previousCategory, newCategory }) {
  return JSON.stringify({ id, previous_category: previousCategory, new_category: newCategory, table: 'feedback' });
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const outFileIdx = argv.indexOf('--out-file');
  const outFile = outFileIdx >= 0 ? argv[outFileIdx + 1] : null;

  if (!outFile) {
    console.error('backfill-completion-flag-finding-category: --out-file <path> is REQUIRED (FR-7 rollback artifact). Refusing to run.');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (pass --apply to perform the UPDATE)'}`);
  console.log(`Out-file: ${outFile}`);

  if (!apply) {
    // Dry run: report matched counts only (paginated), never write.
    const a = await fetchAllPaginated(() => selectPassA(supabase));
    console.log(formatPassSummary({ name: PASS_A.name, matchedCount: a.length, updatedCount: 0, remainingAfter: null, updateError: null, verifyError: null, status: 'PASS' }));
    const b = await fetchAllPaginated(() => selectPassB(supabase));
    console.log(formatPassSummary({ name: PASS_B.name, matchedCount: b.length, updatedCount: 0, remainingAfter: null, updateError: null, verifyError: null, status: 'PASS' }));
    console.log('Dry run only — no rows updated, no out-file written.');
    return;
  }

  // Truncate/create the out-file up front so a re-run doesn't silently append to a stale file.
  writeFileSync(outFile, '');

  // PASS A (FR-3) completes and logs its own result FIRST.
  const resultA = await runPass(supabase, PASS_A, selectPassA);
  console.log(formatPassSummary(resultA));
  for (const id of resultA.updatedIds) {
    appendFileSync(outFile, toNdjsonLine({ id, previousCategory: PASS_A.previousCategory, newCategory: PASS_A.newCategory }) + '\n');
  }

  // PASS B (FR-4) runs independently, regardless of Pass A's outcome.
  const resultB = await runPass(supabase, PASS_B, selectPassB);
  console.log(formatPassSummary(resultB));
  for (const id of resultB.updatedIds) {
    appendFileSync(outFile, toNdjsonLine({ id, previousCategory: PASS_B.previousCategory, newCategory: PASS_B.newCategory }) + '\n');
  }

  const exitCode = computeExitCode([resultA, resultB]);
  console.log(`Exit code: ${exitCode} (0=both PASS, 1=an UPDATE failed, 2=a post-apply verification could not run)`);
  process.exitCode = exitCode;
}

const isMain = process.argv[1]?.endsWith('backfill-completion-flag-finding-category.mjs');
if (isMain) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exitCode = 1;
  });
}
