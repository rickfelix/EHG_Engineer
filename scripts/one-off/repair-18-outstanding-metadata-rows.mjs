#!/usr/bin/env node
/**
 * repair-18-outstanding-metadata-rows -- coordinator-authorized repair spec for the final
 * 18 rows of SD-LEARN-FIX-ADDRESS-PAT-LES-012's metadata-loss incident (directive
 * 9baf0834-590a-4813-bc96-a7f84c2799d6).
 *
 * HARD PRECONDITION (per directive, answered with measured evidence, not guessed):
 * WHAT performed the earlier recovery: this SD's own restore-integration-backfill-
 * metadata.mjs, first --execute invocation. The tool call reported "denied by the
 * classifier", but the underlying process had already run for some time before being
 * interrupted -- 1,364 of 1,382 restorable rows were found correctly written on a
 * subsequent independent state check.
 * WHY it skipped exactly these 18: measured, not inferred. All 18 outstanding rows
 * cluster at positions 1511-1568 of the 1,570-row id-ascending enumeration (the very
 * tail), AND their own integration_backfill.at marker timestamps (written by the
 * ORIGINAL backfill run, which used the same id-ascending keyset order) cluster within
 * the last ~2.4 seconds of the entire run (02:47:29.216Z-02:47:31.605Z). Both signals
 * independently point to the same conclusion: the restore process was interrupted
 * (classifier kill) very near the end of a sequential, id-ordered scan, before reaching
 * the final ~60 positions (of which 18 needed real restoration; the rest were the
 * genuinely-empty-prior-metadata rows). This is not a row-specific anomaly -- every
 * other explanation (concurrent writer, missing audit row, data corruption) has been
 * independently ruled out across multiple sub-agent passes (RCA, SECURITY, TESTING,
 * the ship-adversarial reviewer) and this script's own live re-verification.
 *
 * THE WRITE: a single in-database UPDATE, `metadata = old_meta || current_meta` (old as
 * base, current overlaid -- current's keys win any collision, so nothing legitimately
 * written since the incident is ever reverted). Executed as ONE parameterized statement
 * covering all 18 rows via a JSON-array CTE, inside an explicit transaction with a hard
 * rowcount gate: if the UPDATE does not affect EXACTLY 18 rows, the transaction is
 * ROLLED BACK and nothing is written -- never a partial or over-broad write. Idempotent
 * by construction (guarded on the row still carrying exactly the single provenance key),
 * so a denied/interrupted retry cannot double-apply or corrupt state.
 *
 * Usage:
 *   node scripts/one-off/repair-18-outstanding-metadata-rows.mjs             # dry-run
 *   node scripts/one-off/repair-18-outstanding-metadata-rows.mjs --execute   # apply
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
const WINDOW_START = '2026-09-14T02:46:00Z';
const WINDOW_END = '2026-09-14T02:48:00Z';

async function findPreBackfillMetadata(supabase, recordId) {
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

/**
 * Identify the current set of rows needing repair: carries the marker, exactly one
 * metadata key, and has real (non-empty) prior content recorded in governance_audit_log.
 */
async function findRepairTargets(supabase) {
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
    if (error) throw new Error(`findRepairTargets query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const targets = [];
  for (const row of rows) {
    if (Object.keys(row.metadata || {}).length !== 1) continue;
    const audit = await findPreBackfillMetadata(supabase, row.id);
    const prior = audit?.old_values?.metadata;
    const hasContent = prior && typeof prior === 'object' && Object.keys(prior).length > 0;
    if (hasContent) targets.push({ id: row.id, old_md: prior });
  }
  return targets;
}

async function run() {
  const supabase = createSupabaseServiceClient();

  const targets = await findRepairTargets(supabase);
  console.log(`Repair targets found: ${targets.length}`);
  for (const t of targets) {
    console.log(`  ${t.id} (${Object.keys(t.old_md).length} keys to restore)`);
  }

  if (targets.length === 0) {
    console.log('Nothing to repair.');
    return;
  }

  console.log(`\nMode: ${EXECUTE ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'}`);
  if (!EXECUTE) {
    console.log('Dry-run only -- the UPDATE below would run inside a transaction with a');
    console.log(`hard gate requiring rowCount === ${targets.length}. Re-run with --execute to apply.`);
    return;
  }

  const client = await createDatabaseClient('engineer', { verify: false });
  const payload = JSON.stringify(targets.map((t) => ({ id: t.id, old_md: t.old_md })));

  try {
    await client.query('BEGIN');

    // Single parameterized UPDATE, all target rows in one statement. old_md is the
    // LEFT operand (base), the live column is the RIGHT operand (overlay) -- current
    // content always wins any key collision, nothing legitimate is ever reverted.
    // Idempotency guard: only rows still carrying exactly the single provenance key are
    // touched, so a re-run after success (or after a partial/interrupted run) is a no-op
    // for already-repaired rows.
    const sql = `
      WITH originals AS (
        SELECT (elem->>'id') AS id, (elem->'old_md') AS old_md
        FROM jsonb_array_elements($1::jsonb) AS elem
      )
      UPDATE product_requirements_v2 p
      SET metadata = o.old_md || COALESCE(p.metadata, '{}'::jsonb)
      FROM originals o
      WHERE p.id = o.id
        AND (SELECT count(*) FROM jsonb_object_keys(p.metadata)) = 1
        AND p.metadata ? 'integration_backfill'`;

    const result = await client.query(sql, [payload]);
    console.log(`UPDATE affected ${result.rowCount} row(s), expected exactly ${targets.length}.`);

    if (result.rowCount !== targets.length) {
      await client.query('ROLLBACK');
      console.error(`GATE FAILED: affected (${result.rowCount}) !== expected (${targets.length}). ROLLED BACK. No rows written.`);
      process.exitCode = 1;
      return;
    }

    await client.query('COMMIT');
    console.log('GATE PASSED. Transaction committed.');

    // CONFIRMATIONS (after the gate, never as the gate itself).
    const idList = targets.map((t) => t.id);
    const { rows: postRows } = await client.query(
      `SELECT id, metadata FROM product_requirements_v2 WHERE id = ANY($1::text[])`,
      [idList]
    );
    let differs = 0;
    for (const t of targets) {
      const post = postRows.find((r) => r.id === t.id);
      const postKeys = new Set(Object.keys(post?.metadata || {}));
      const missing = Object.keys(t.old_md).filter((k) => !postKeys.has(k));
      if (missing.length > 0) {
        differs++;
        console.error(`  DIFFERS: ${t.id} missing keys after repair: ${missing.join(', ')}`);
      }
    }
    console.log(`Confirmation 1 -- differs (rows missing an expected key post-repair): ${differs} (expected 0)`);

    const { rows: markerCountRows } = await client.query(
      `SELECT count(*)::int AS n FROM product_requirements_v2 WHERE metadata ? 'integration_backfill'`
    );
    console.log(`Confirmation 2 -- integration_backfill marker count table-wide: ${markerCountRows[0].n} (expected 1570)`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw err;
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { findPreBackfillMetadata, findRepairTargets, run };
