#!/usr/bin/env node
/**
 * backfill-707-fabricated-integration -- SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-1).
 *
 * One-time correction of product_requirements_v2.integration_operationalization rows that
 * carry FABRICATED boilerplate written by an archived, buggy backfill script
 * (scripts/archive/one-time/backfill-prd-integration.js, see that file's guard header for
 * the pagination-bug root cause). Target rows are identified LIVE at execution time via
 * the fabrication predicate integration_operationalization->consumers->0->>name =
 * 'LEO Protocol Engine' (confirmed exactly 707 rows at SD authoring time; the archived
 * script's own commit message claims 706 -- a harmless 1-row historical drift that is
 * exactly why this script never hardcodes a count).
 *
 * Modeled directly on the precedented sibling script
 * scripts/one-off/backfill-integration-operationalization-v2.mjs (SD-LEARN-FIX-ADDRESS-
 * PAT-LES-012), reusing its keyset-pagination + updated_at CAS-guard pattern. Differs from
 * that script in two ways, per LEAD-phase Explore+VALIDATION sub-agent review
 * (sub_agent_execution_results rows c04bec4e / 425e034f) and this SD's PRD (FR-1):
 *   - Target predicate is the FABRICATION shape, not NULL.
 *   - No metadata provenance marker is written (avoids that script's read-merge-write
 *     metadata race entirely) -- instead `updated_by` (a plain scalar column, never
 *     'EXEC' per the enforce_doctrine_of_constraint trigger) is set directly on the same
 *     UPDATE for governance_audit_log attribution, which the sibling script's rows lack
 *     (they read changed_by='SYSTEM').
 * mergeJsonbColumn (lib/coordinator/safe-metadata-merge.mjs) is deliberately NOT used: its
 * product_requirements_v2 allowlist entry hardcodes jsonbColumn:'metadata' (a different,
 * separate top-level column from integration_operationalization) and it performs a `||`
 * MERGE, not a REPLACE, with no CAS/extra-guard capability -- confirmed wrong tool for
 * this write shape by both LEAD-phase sub-agents.
 *
 * Usage:
 *   node scripts/one-off/backfill-707-fabricated-integration.mjs             # dry-run (count only)
 *   node scripts/one-off/backfill-707-fabricated-integration.mjs --execute   # apply the correction
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { buildDefaultIntegrationOperationalization } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
const BATCH_SIZE = 500;
const SCRIPT_NAME = 'backfill-707-fabricated-integration.mjs';
const SD_KEY = 'SD-LEO-FIX-REPLACE-707-FABRICATED-001';
const FABRICATION_PREDICATE_PATH = 'integration_operationalization->consumers->0->>name';
const FABRICATION_MARKER_VALUE = 'LEO Protocol Engine';

/**
 * Keyset-paginated enumeration of every row matching the fabrication predicate, ordered by
 * id ascending. Never uses .range(offset) -- that is the exact defect class of the archived
 * script this SD corrects (see scripts/archive/one-time/backfill-prd-integration.js header).
 */
async function* enumerateFabricatedRows(supabase, batchSize = BATCH_SIZE) {
  let lastId = null;
  for (;;) {
    let query = supabase
      .from('product_requirements_v2')
      .select('id')
      .eq(FABRICATION_PREDICATE_PATH, FABRICATION_MARKER_VALUE)
      .order('id', { ascending: true });
    if (lastId !== null) query = query.gt('id', lastId);
    query = query.limit(batchSize);

    const { data, error } = await query;
    if (error) throw new Error(`enumerateFabricatedRows query failed: ${error.message}`);
    if (!data || data.length === 0) return;

    for (const row of data) yield row.id;
    lastId = data[data.length - 1].id;
    if (data.length < batchSize) return;
  }
}

/**
 * Write the honest placeholder to a single row, guarded by an updated_at compare-and-swap
 * read immediately beforehand (product_requirements_v2 has a BEFORE-UPDATE trigger that
 * touches updated_at on every write regardless of which columns changed, confirmed by
 * LEAD-phase VALIDATION -- so an unchanged updated_at at write time proves the row has not
 * been touched since it was read, a complete concurrency guard on its own) PLUS a re-check
 * of the fabrication predicate itself in the WHERE clause (belt-and-braces: a row that was
 * already corrected by a concurrent run, or was never fabricated, is never touched).
 *
 * updated_by is set to this script's identity for governance_audit_log attribution -- never
 * 'EXEC' (enforce_doctrine_of_constraint trigger hard-aborts on
 * COALESCE(created_by, updated_by) = 'EXEC'; measured 0/707 rows have created_by='EXEC').
 *
 * @param {object} supabase
 * @param {string} id
 * @param {object} placeholder - buildDefaultIntegrationOperationalization() output
 * @returns {Promise<{ok: true, written: boolean} | {ok: false, error: string}>}
 */
async function writeCorrectedRow(supabase, id, placeholder) {
  const { data: currentRow, error: readError } = await supabase
    .from('product_requirements_v2')
    .select('updated_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    return { ok: false, error: `pre-write read failed: ${readError.message}` };
  }

  let updateQuery = supabase
    .from('product_requirements_v2')
    .update({
      integration_operationalization: placeholder,
      updated_by: SCRIPT_NAME
    })
    .eq('id', id);
  updateQuery = currentRow?.updated_at
    ? updateQuery.eq('updated_at', currentRow.updated_at)
    : updateQuery;
  const { data: updated, error: updateError } = await updateQuery
    .eq(FABRICATION_PREDICATE_PATH, FABRICATION_MARKER_VALUE)
    .select('id')
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: updateError.message };
  }
  return { ok: true, written: !!updated };
}

async function run() {
  const supabase = createSupabaseServiceClient();

  const { count: liveFabricatedCount, error: countError } = await supabase
    .from('product_requirements_v2')
    .select('id', { count: 'exact', head: true })
    .eq(FABRICATION_PREDICATE_PATH, FABRICATION_MARKER_VALUE);
  if (countError) throw new Error(`Live fabricated-row count query failed: ${countError.message}`);

  console.log(`Live fabricated-row count: ${liveFabricatedCount} (SD authored against a measured 707; live count may drift -- this script always re-measures)`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'}`);

  const placeholder = buildDefaultIntegrationOperationalization();
  let enumerated = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for await (const id of enumerateFabricatedRows(supabase)) {
    enumerated++;
    if (!EXECUTE) continue;

    const result = await writeCorrectedRow(supabase, id, placeholder);
    if (result.ok) {
      if (result.written) written++;
      else skipped++;
    } else {
      failed++;
      failures.push({ id, error: result.error });
    }
  }

  console.log(`Enumerated: ${enumerated}`);
  if (EXECUTE) {
    console.log(`Written: ${written}`);
    console.log(`Skipped (CAS/predicate mismatch at write time): ${skipped}`);
    console.log(`Failed: ${failed}`);
    if (failures.length > 0) {
      console.log('Failures:', JSON.stringify(failures, null, 2));
    }

    const { count: remainingFabricated, error: remainingError } = await supabase
      .from('product_requirements_v2')
      .select('id', { count: 'exact', head: true })
      .eq(FABRICATION_PREDICATE_PATH, FABRICATION_MARKER_VALUE);
    if (remainingError) throw new Error(`Post-run fabricated-row count query failed: ${remainingError.message}`);
    console.log(`Remaining fabricated rows: ${remainingFabricated}`);
  } else {
    console.log(`Dry-run enumerated count (${enumerated}) vs live fabricated count (${liveFabricatedCount}): ${enumerated === liveFabricatedCount ? 'MATCH' : 'MISMATCH -- investigate before executing'}`);
  }
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { enumerateFabricatedRows, writeCorrectedRow, run, FABRICATION_PREDICATE_PATH, FABRICATION_MARKER_VALUE };
