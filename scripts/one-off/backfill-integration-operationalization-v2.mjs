#!/usr/bin/env node
/**
 * backfill-integration-operationalization-v2 -- SD-LEARN-FIX-ADDRESS-PAT-LES-012 (FR-5).
 *
 * One-time backfill of product_requirements_v2.integration_operationalization rows that
 * are currently NULL. Writes the SAME empty-per-subsection placeholder the write-path
 * default-builder now uses (scripts/prd/prd-creator.js buildDefaultIntegrationOperationalization),
 * imported directly so the two paths cannot diverge -- never fabricated content.
 *
 * Design constraints (measurement-verified by VALIDATION/TESTING/DATABASE sub-agent
 * passes on this SD, sub_agent_execution_results rows 53910d3f / a0b168bb / 8ba5e6c0):
 *   - Join: product_requirements_v2.sd_id = strategic_directives_v2.id (single column,
 *     resolves 100% of the target set -- NOT a dual-key directive_id join).
 *   - No exclusions: documentation and orchestrator sd_type rows get the IDENTICAL
 *     placeholder as everyone else (a distinct marker key is trigger-illegal; exclusion
 *     just re-creates the NULL-shaped problem this script exists to close).
 *   - Pagination: KEYSET (ORDER BY id, id > lastId), never .range(offset) -- the prior
 *     ad-hoc backfill (scripts/archive/one-time/backfill-prd-integration.js) paginated by
 *     offset over its own shrinking NULL predicate and silently skipped roughly half the
 *     corpus each pass. That is the actual reason only 707 rows were ever touched by it.
 *   - Provenance: written to metadata.integration_backfill in the SAME UPDATE statement
 *     (never inside integration_operationalization itself, which is a canonical-5-key
 *     trigger-enforced column with no room for a marker).
 *
 * Usage:
 *   node scripts/one-off/backfill-integration-operationalization-v2.mjs             # dry-run (count only)
 *   node scripts/one-off/backfill-integration-operationalization-v2.mjs --execute   # apply the backfill
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { buildDefaultIntegrationOperationalization } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
const BATCH_SIZE = 500;
const SHAPE_VERSION = 'v1-null-per-key';
const SCRIPT_NAME = 'backfill-integration-operationalization-v2.mjs';
const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';

/**
 * Keyset-paginated enumeration of every row with integration_operationalization IS NULL,
 * ordered by id ascending. Never uses .range(offset) -- see module header.
 */
async function* enumerateNullRows(supabase, batchSize = BATCH_SIZE) {
  let lastId = null;
  for (;;) {
    // Filters (.is, .gt) applied before .limit -- filters-then-limit is the natural read
    // order and keeps the query-building free of any assumption about whether .limit()
    // returns a chainable builder or a thenable/Promise.
    let query = supabase
      .from('product_requirements_v2')
      .select('id')
      .is('integration_operationalization', null)
      .order('id', { ascending: true });
    if (lastId !== null) query = query.gt('id', lastId);
    query = query.limit(batchSize);

    const { data, error } = await query;
    if (error) throw new Error(`enumerateNullRows query failed: ${error.message}`);
    if (!data || data.length === 0) return;

    for (const row of data) yield row.id;
    lastId = data[data.length - 1].id;
    if (data.length < batchSize) return;
  }
}

/**
 * Write the backfill placeholder + provenance marker to a single row, MERGING into its
 * current metadata rather than replacing the column.
 *
 * INCIDENT FIX (post-mortem: the first --execute run of this script, 2026-09-14
 * 02:46-02:47Z, blind-replaced `metadata` on 1,570 rows instead of merging -- Supabase's
 * .update() REPLACES a jsonb column value, it never deep-merges. Destroyed 7,743 keys
 * across 1,382 rows: plan_handoff, design_analysis, database_analysis, and other
 * PLAN-phase/sub-agent provenance. Recovered from governance_audit_log via
 * scripts/one-off/restore-integration-backfill-metadata.mjs (SECURITY sub-agent evidence
 * row 9d21ac12, re-reviewed and superseded at f93b30cc; TESTING row 96d51bde).
 *
 * CORRECTED ATTRIBUTION (per SECURITY re-review f93b30cc): the root cause is NOT simply
 * "no read-before-write" -- a naive read-spread-write is itself the documented-unsafe
 * pattern (see lib/coordinator/safe-metadata-merge.mjs's own header: "unsafe by
 * construction" without atomicity). The real gap is that no atomic-merge seam exists for
 * product_requirements_v2 (mergeMetadataKeys() there is hard-scoped to
 * strategic_directives_v2). This script's fetch-then-merge closes THIS incident because
 * writeBackfillRow() re-checks `integration_operationalization IS NULL` at write time
 * (closing that column's race), but the residual metadata TOCTOU between the fetch and
 * the write is accepted debt here, not a solved problem -- tracked for a proper
 * generalized merge helper as a separate follow-up (see restore script's own fix for the
 * same class of bug, SECURITY finding #1, evidence f93b30cc).
 *
 * @param {object} supabase
 * @param {string} id
 * @param {object} placeholder - buildDefaultIntegrationOperationalization() output
 * @returns {Promise<{ok: true, written: boolean} | {ok: false, error: string}>}
 */
async function writeBackfillRow(supabase, id, placeholder) {
  const { data: currentRow, error: readError } = await supabase
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    return { ok: false, error: `pre-write metadata read failed: ${readError.message}` };
  }

  const mergedMetadata = {
    ...(currentRow?.metadata || {}),
    integration_backfill: {
      at: new Date().toISOString(),
      sd: SD_KEY,
      script: SCRIPT_NAME,
      reason: 'PAT-LES-338e7a02477c backfill -- see SD-LEARN-FIX-ADDRESS-PAT-LES-012',
      shape_version: SHAPE_VERSION
    }
  };

  // SD-LEARN-FIX-ADDRESS-PAT-LES-012 (FR-5): re-check per-row (not just the batch
  // predicate) so a concurrent authoring write between enumeration and this UPDATE is
  // never overwritten -- WHERE ... IS NULL on the write itself, not just the read.
  const { data: updated, error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      integration_operationalization: placeholder,
      metadata: mergedMetadata
    })
    .eq('id', id)
    .is('integration_operationalization', null)
    .select('id')
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: updateError.message };
  }
  return { ok: true, written: !!updated };
}

async function run() {
  const supabase = createSupabaseServiceClient();

  const { count: liveNullCount, error: countError } = await supabase
    .from('product_requirements_v2')
    .select('id', { count: 'exact', head: true })
    .is('integration_operationalization', null);
  if (countError) throw new Error(`Live NULL count query failed: ${countError.message}`);

  console.log(`Live NULL count: ${liveNullCount}`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'}`);

  const placeholder = buildDefaultIntegrationOperationalization();
  let enumerated = 0;
  let written = 0;
  let failed = 0;
  const failures = [];

  for await (const id of enumerateNullRows(supabase)) {
    enumerated++;
    if (!EXECUTE) continue;

    const result = await writeBackfillRow(supabase, id, placeholder);
    if (result.ok) {
      if (result.written) written++;
    } else {
      failed++;
      failures.push({ id, error: result.error });
    }
  }

  console.log(`Enumerated: ${enumerated}`);
  if (EXECUTE) {
    console.log(`Written: ${written}`);
    console.log(`Failed: ${failed}`);
    if (failures.length > 0) {
      console.log('Failures:', JSON.stringify(failures, null, 2));
    }

    const { count: remainingNull, error: remainingError } = await supabase
      .from('product_requirements_v2')
      .select('id', { count: 'exact', head: true })
      .is('integration_operationalization', null);
    if (remainingError) throw new Error(`Post-run NULL count query failed: ${remainingError.message}`);
    console.log(`Remaining NULL rows: ${remainingNull}`);
  } else {
    console.log(`Dry-run enumerated count (${enumerated}) vs live NULL count (${liveNullCount}): ${enumerated === liveNullCount ? 'MATCH' : 'MISMATCH -- investigate before executing'}`);
  }
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { enumerateNullRows, writeBackfillRow, run };
