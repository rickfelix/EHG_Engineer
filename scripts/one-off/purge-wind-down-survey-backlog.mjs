// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-2): archive-then-purge the wind_down_survey backlog from
// the shared feedback table into the existing retention_archive mechanism, mirroring
// scripts/retention-enforce.js's own archive-before-delete shape (source_table, source_id,
// row_data, row_timestamp, archived_by, run_id) so this data lands where a future
// retention_archive-based audit would expect it, rather than a bespoke snapshot table.
//
// AUTHORIZED BY THE LEAD-PHASE READER CENSUS (Explore evidence, sub_agent_execution_results
// 0447d114-bca8-4355-be7c-ae668410d839): zero active dashboard/gauge/sweep reads
// feedback.category='wind_down_survey' today. Solomon's binding scope note ("delete only after
// the census reads zero consumers") is satisfied by that census, not re-derived here.
//
// This is a worker-executable DATA script, not a schema migration — it is NOT chairman-gated
// (see the PRD's TR-2). It only touches category='wind_down_survey' rows; every other feedback
// category is left untouched.
//
// Idempotent: an "already archived" check (mirroring retention-enforce.js's own id-cursor guard)
// skips re-archiving rows a prior partial run already archived, and only retries their delete —
// so a re-run after a mid-run failure converges rather than duplicating retention_archive rows.
//
// runOneBatch is exported (pure-ish: takes a client-like {query} object) so the archive-before-
// delete ordering, the id-cursor idempotency guard, and the category scoping are unit-testable
// against a mock client, not only exercisable via a live DB.
//
// Usage:
//   node scripts/one-off/purge-wind-down-survey-backlog.mjs --dry-run
//   node scripts/one-off/purge-wind-down-survey-backlog.mjs
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import crypto from 'node:crypto';

export const BATCH_SIZE = 500;
export const ARCHIVED_BY = 'wind-down-survey-backlog-purge';

/**
 * Run one archive-then-delete batch against `client`. Returns null when the backlog is drained
 * (no more matching rows), or {archived, deleted} for the batch just processed.
 *
 * ARCHIVE MUST SUCCEED BEFORE DELETE (TR-1-equivalent for this script): if the archive insert's
 * row count does not match the to-archive set, this throws BEFORE issuing any delete for the
 * batch — mirroring retention-enforce.js's own "no rows deleted this batch" invariant.
 *
 * @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[], rowCount: number}>}} client
 * @param {string} runId
 * @returns {Promise<{archived: number, deleted: number}|null>}
 */
export async function runOneBatch(client, runId) {
  await client.query('BEGIN');
  try {
    const { rows: batch } = await client.query(
      `SELECT id FROM public.feedback
       WHERE category = 'wind_down_survey'
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );
    if (batch.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const ids = batch.map((r) => r.id);

    // Id-cursor guard: skip re-archiving ids a prior partial run already archived (its delete
    // may have failed after a successful archive) — only their delete is retried below.
    const { rows: already } = await client.query(
      `SELECT source_id FROM public.retention_archive
       WHERE source_table = 'feedback' AND source_id = ANY($1::text[])`,
      [ids.map(String)],
    );
    const alreadyArchivedIds = new Set(already.map((r) => r.source_id));
    const toArchiveIds = ids.filter((id) => !alreadyArchivedIds.has(String(id)));

    let archived = 0;
    if (toArchiveIds.length > 0) {
      const { rowCount: insCount } = await client.query(
        `INSERT INTO public.retention_archive
           (source_table, source_id, row_data, row_timestamp, archived_by, run_id)
         SELECT 'feedback', f.id::text, to_jsonb(f), f.created_at, $2, $3
         FROM public.feedback f
         WHERE f.id = ANY($1::text[])`,
        [toArchiveIds.map(String), ARCHIVED_BY, runId],
      );
      if (insCount !== toArchiveIds.length) {
        throw new Error(`archive insert count mismatch (${insCount} != ${toArchiveIds.length}) — aborting batch before delete`);
      }
      archived = toArchiveIds.length;
    }

    const { rowCount: deleted } = await client.query(
      `DELETE FROM public.feedback WHERE id = ANY($1::text[])`,
      [ids.map(String)],
    );
    await client.query('COMMIT');
    return { archived, deleted };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const runId = `wind-down-survey-backlog-purge-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;

  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });

  try {
    const { rows: [{ n: totalMatching }] } = await client.query(
      `SELECT count(*) AS n FROM public.feedback WHERE category = 'wind_down_survey'`,
    );
    console.log(`Run: ${runId}`);
    console.log(`Matching rows (category='wind_down_survey'): ${totalMatching}`);

    if (dryRun) {
      console.log('--dry-run: no rows written.');
      return;
    }
    if (Number(totalMatching) === 0) {
      console.log('Nothing to purge. Already clean.');
      return;
    }

    let totalArchived = 0;
    let totalDeleted = 0;
    for (;;) {
      const result = await runOneBatch(client, runId);
      if (result === null) break;
      totalArchived += result.archived;
      totalDeleted += result.deleted;
      console.log(`  batch: archived ${result.archived}, deleted ${result.deleted} (running totals: archived ${totalArchived}, deleted ${totalDeleted})`);
    }

    const { rows: [{ n: remaining }] } = await client.query(
      `SELECT count(*) AS n FROM public.feedback WHERE category = 'wind_down_survey'`,
    );
    console.log(`Archived this run: ${totalArchived}`);
    console.log(`Deleted this run: ${totalDeleted}`);
    console.log(`Remaining category='wind_down_survey' in feedback: ${remaining} (expect 0)`);
    if (Number(remaining) !== 0) {
      console.error('WARNING: remaining > 0 after purge loop — investigate before re-running.');
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
