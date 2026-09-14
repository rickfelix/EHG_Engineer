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
 *     integration_backfill key (i.e., untouched since the original backfill) --
 *     re-checked live, not from a stale read.
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
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('id, metadata')
      .not('metadata->integration_backfill', 'is', null)
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
  const { data, error } = await supabase
    .from('governance_audit_log')
    .select('old_values, changed_at')
    .eq('table_name', 'product_requirements_v2')
    .eq('record_id', recordId)
    .eq('operation', 'UPDATE')
    .gte('changed_at', WINDOW_START)
    .lte('changed_at', WINDOW_END)
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

  let alreadyRestored = 0;
  let noAuditRow = 0;
  let restored = 0;
  let failed = 0;
  let noPriorKeys = 0;
  const problems = [];

  for (const row of markedRows) {
    const keyCount = Object.keys(row.metadata || {}).length;
    if (keyCount !== 1) {
      // Already has more than the single provenance key -- either already restored by a
      // prior run of this script, or touched by something else since the backfill.
      // Either way, never overwrite it here.
      alreadyRestored++;
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

    const restoredMetadata = {
      ...priorMetadata,
      integration_backfill: row.metadata.integration_backfill,
    };

    if (!EXECUTE) {
      restored++; // count as "would restore" in dry-run
      continue;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({ metadata: restoredMetadata })
      .eq('id', row.id)
      // Re-guard at write time: only restore if the row STILL has exactly the single
      // provenance key (never clobber a newer legitimate write).
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

  console.log(`Already-restored/touched-since-backfill (skipped): ${alreadyRestored}`);
  console.log(`No prior metadata to restore (was genuinely empty before): ${noPriorKeys}`);
  console.log(`No audit row found (investigate): ${noAuditRow}`);
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
