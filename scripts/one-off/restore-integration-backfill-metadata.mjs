#!/usr/bin/env node
/**
 * restore-integration-backfill-metadata -- INCIDENT REMEDIATION for
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012.
 *
 * scripts/one-off/backfill-integration-operationalization-v2.mjs (--execute, run
 * 2026-09-14T02:46-02:47Z) blind-replaced product_requirements_v2.metadata on 1,570 rows
 * instead of merging (Supabase .update() replaces a jsonb column value; it does not deep
 * merge). SECURITY sub-agent evidence (sub_agent_execution_results 9d21ac12) measured
 * 7,743 destroyed keys across 1,382 of those rows and found a full recovery path:
 * governance_audit_log's AFTER UPDATE trigger writes old_values = row_to_json(OLD) for
 * every UPDATE, and as of that review 0 of the 1,570 rows had been touched again since
 * the backfill (independently re-confirmed live before writing this script).
 *
 * This script restores each row's pre-backfill metadata from governance_audit_log,
 * re-merging the integration_backfill provenance marker back in (never dropping
 * provenance that the original SD legitimately wants recorded).
 *
 * Safety:
 *   - dry-run by default; --execute required to write.
 *   - Per-row guard: only restores a row if it STILL carries exactly the single
 *     integration_backfill key (i.e., untouched since the original backfill). This is
 *     re-checked with a FRESH read immediately before each write (SECURITY re-review
 *     finding #1, evidence f93b30cc): the initial batch fetch is a snapshot that can be
 *     minutes stale by the time a given row's turn comes up in a 1,570-row run, and a
 *     concurrent legitimate writer (e.g. storeSubAgentResults) touching a target row in
 *     that window must not be clobbered. The write-time `.not(...)` filter alone is
 *     defense in depth only -- it tests marker presence, not the single-key invariant.
 *   - Idempotent: a row already restored (more than 1 metadata key) is skipped.
 *   - Never overwrites a row that was legitimately re-written by something else since
 *     the backfill (that data is newer and must win).
 *
 * Usage:
 *   node scripts/one-off/restore-integration-backfill-metadata.mjs             # dry-run
 *   node scripts/one-off/restore-integration-backfill-metadata.mjs --execute   # apply
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
// Padded slightly beyond the measured backfill window
// [2026-09-14T02:46:18.631Z, 2026-09-14T02:47:31.643Z] to tolerate clock skew.
const WINDOW_START = '2026-09-14T02:46:00Z';
const WINDOW_END = '2026-09-14T02:48:00Z';

async function fetchAllMarkedRows(supabase) {
  // ADVERSARIAL SHIP-REVIEW FINDING (PR #8950, ship-adversarial-review-8950): this
  // offset-paginated query had NO .order() -- the exact defect class this entire SD
  // exists to fix (see module header: the prior ad-hoc backfill silently skipped rows
  // this same way). Without an explicit order, Postgres gives no stable row ordering
  // guarantee across separate LIMIT/OFFSET pages, and this table has heavy concurrent
  // write traffic from other sessions -- a row can shift position between page 1 and
  // page 2 and be silently skipped. Order by id so pagination is deterministic.
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('id, metadata')
      .not('metadata->integration_backfill', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllMarkedRows failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function findPreBackfillMetadata(supabase, recordId) {
  // ADVERSARIAL SHIP-REVIEW FINDING (PR #8950): the WINDOW_START/END pair alone is not
  // a correctness guarantee -- it is padded 18s before the measured backfill start with
  // no filter tying a match to the backfill specifically, so a legitimate unrelated write
  // to the same row inside that padding window would have been picked up as "pre-backfill"
  // and silently reverted. Make the match self-identifying instead: the backfill's own
  // UPDATE is uniquely the one that ADDS the integration_backfill marker where it was
  // previously absent (new_values has it, old_values does not) -- this is correct
  // regardless of exact timing or clock skew. The time window is kept as an additional,
  // non-load-bearing performance narrowing filter (record_id already makes this query
  // selective and fast -- verified ~36ms per lookup against the live table).
  const { data, error } = await supabase
    .from('governance_audit_log')
    .select('old_values, changed_at')
    .eq('table_name', 'product_requirements_v2')
    .eq('record_id', recordId)
    .eq('operation', 'UPDATE')
    .gte('changed_at', WINDOW_START)
    .lte('changed_at', WINDOW_END)
    .not('new_values->metadata->>integration_backfill', 'is', null)
    .is('old_values->metadata->>integration_backfill', null)
    .order('changed_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findPreBackfillMetadata(${recordId}) failed: ${error.message}`);
  return data;
}

async function run() {
  const supabase = createSupabaseServiceClient();

  const markedRows = await fetchAllMarkedRows(supabase);
  console.log(`Marked rows (carrying metadata.integration_backfill): ${markedRows.length}`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'}`);

  let trulyRestored = 0;
  let touchedByOtherWriterContentStillLost = 0;
  let noAuditRow = 0;
  let restored = 0;
  let failed = 0;
  let noPriorKeys = 0;
  let concurrentlyModified = 0;
  const problems = [];

  for (const row of markedRows) {
    const keyCount = Object.keys(row.metadata || {}).length;
    if (keyCount !== 1) {
      // ADVERSARIAL SHIP-REVIEW FINDING (PR #8950): this bucket used to silently lump
      // "genuinely restored" together with "destroyed and then touched by another writer
      // for an unrelated reason, original content still permanently lost" -- both look
      // identical from key COUNT alone. Distinguish them honestly: look up what this row
      // is supposed to contain (from the audit log's own record of the backfill event)
      // and check whether the row's CURRENT metadata actually contains it.
      const auditRowCheck = await findPreBackfillMetadata(supabase, row.id);
      if (!auditRowCheck) {
        // ADVERSARIAL SHIP-REVIEW FINDING (PR #8950, follow-up): distinct from "genuinely
        // had no prior content" -- the audit trigger is best-effort (EXCEPTION WHEN OTHERS
        // THEN RAISE WARNING ... RETURN NEW), so a missing audit row means this row's
        // pre-backfill state is UNKNOWABLE, not confirmed-empty. Flag it rather than
        // silently folding it into noPriorKeys.
        noAuditRow++;
        problems.push({ id: row.id, issue: 'keyCount!==1 row has no governance_audit_log transition row -- prior state unknowable, cannot confirm whether content was lost' });
        continue;
      }
      const priorMetadataCheck = auditRowCheck.old_values?.metadata;
      const hadRealPriorContent = priorMetadataCheck && typeof priorMetadataCheck === 'object' && Object.keys(priorMetadataCheck).length > 0;
      if (!hadRealPriorContent) {
        // Nothing was ever lost on this row -- any extra keys are unrelated legitimate
        // content, not a restoration outcome either way.
        noPriorKeys++;
        continue;
      }
      const currentKeys = new Set(Object.keys(row.metadata || {}));
      const isSuperset = Object.keys(priorMetadataCheck).every((k) => currentKeys.has(k));
      if (isSuperset) {
        trulyRestored++;
      } else {
        touchedByOtherWriterContentStillLost++;
        problems.push({
          id: row.id,
          issue: 'row was touched by another writer after the incident but does not contain its original destroyed keys -- content still lost, needs manual recovery from governance_audit_log',
          missingKeys: Object.keys(priorMetadataCheck).filter((k) => !currentKeys.has(k)),
        });
      }
      continue;
    }

    const auditRow = await findPreBackfillMetadata(supabase, row.id);
    if (!auditRow) {
      noAuditRow++;
      problems.push({ id: row.id, issue: 'no governance_audit_log row found in backfill window' });
      continue;
    }

    const priorMetadata = auditRow.old_values?.metadata;
    if (!priorMetadata || typeof priorMetadata !== 'object' || Object.keys(priorMetadata).length === 0) {
      // Genuinely had empty/null metadata before -- nothing to restore, current state is
      // already correct (just the provenance marker). Not a problem.
      noPriorKeys++;
      continue;
    }

    if (!EXECUTE) {
      restored++; // count as "would restore" in dry-run
      continue;
    }

    // SECURITY re-review finding #1 (evidence f93b30cc, superseding 9d21ac12): markedRows
    // is a batch snapshot read ONCE at the top of the loop, but a run over 1,570 rows can
    // take minutes -- a concurrent legitimate writer (e.g. storeSubAgentResults stamping
    // metadata.security_analysis, observed live on this SD's own PRD) can touch a target
    // row between that snapshot and this row's turn. The prior write-time guard
    // (`.not('metadata->integration_backfill','is',null)`) only tested marker PRESENCE,
    // which is true of every marked row by definition, so it enforced nothing. Re-fetch
    // the row's CURRENT metadata immediately before writing and re-check the single-key
    // invariant live, closing the race window from "whole script runtime" down to one
    // round trip.
    const { data: freshRow, error: freshReadError } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('id', row.id)
      .maybeSingle();
    if (freshReadError) {
      failed++;
      problems.push({ id: row.id, issue: `pre-write live re-check failed: ${freshReadError.message}` });
      continue;
    }
    const freshKeyCount = Object.keys(freshRow?.metadata || {}).length;
    if (freshKeyCount !== 1) {
      // Row was touched by something else between the batch snapshot and now -- never
      // overwrite it. Manual recovery from governance_audit_log remains possible.
      concurrentlyModified++;
      continue;
    }

    const restoredMetadata = {
      ...priorMetadata,
      integration_backfill: freshRow.metadata.integration_backfill,
    };

    const { data: updatedRow, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({ metadata: restoredMetadata })
      .eq('id', row.id)
      // Defense in depth: still require the marker to be present at write time.
      .not('metadata->integration_backfill', 'is', null)
      .select('id, metadata')
      .maybeSingle();

    if (updateError) {
      failed++;
      problems.push({ id: row.id, issue: updateError.message });
      continue;
    }
    if (!updatedRow) {
      failed++;
      problems.push({ id: row.id, issue: 'update matched 0 rows (guard failed -- row changed concurrently)' });
      continue;
    }
    if (Object.keys(updatedRow.metadata).length !== Object.keys(restoredMetadata).length) {
      failed++;
      problems.push({ id: row.id, issue: 'post-write key count mismatch -- investigate' });
      continue;
    }
    restored++;
  }

  console.log(`Genuinely restored, verified (current metadata contains original keys): ${trulyRestored}`);
  console.log(`⚠ Touched by another writer, ORIGINAL CONTENT STILL LOST (needs manual recovery -- see problems): ${touchedByOtherWriterContentStillLost}`);
  console.log(`No prior metadata to restore (was genuinely empty before): ${noPriorKeys}`);
  console.log(`No audit row found (investigate): ${noAuditRow}`);
  console.log(`Concurrently modified since batch snapshot (skipped, manual recovery still possible): ${concurrentlyModified}`);
  console.log(`${EXECUTE ? 'Restored' : 'Would restore'}: ${restored}`);
  console.log(`Failed: ${failed}`);
  if (problems.length > 0) {
    console.log('Problems:', JSON.stringify(problems, null, 2));
  }
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { fetchAllMarkedRows, findPreBackfillMetadata, run };
