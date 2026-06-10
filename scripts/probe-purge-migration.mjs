// Prospective validation for SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001.
// Runs the purge migration inside a self-managed BEGIN ... ROLLBACK so it touches NO committed data
// but proves end-to-end that: the asserts pass, the DELETE empties the table, and the UNIQUE guard
// adds cleanly. (apply-migration.js --dry-run does NOT execute SQL — BULK-PURGE-LIVE-001 lesson.)
// NOTE: holds ACCESS EXCLUSIVE on management_reviews for the (sub-second) probe, then rolls back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = path.resolve(__dirname, '..', 'database', 'migrations', '20260610_purge_management_reviews_pollution.sql');
const sql = fs.readFileSync(UP, 'utf8');

const client = await createDatabaseClient('ehg');
let ok = false;
try {
  await client.query('SET statement_timeout = 60000');
  await client.query('BEGIN');

  const before = await client.query('SELECT count(*)::bigint AS n FROM management_reviews');
  console.log('live count before (in-tx):', before.rows[0].n);

  // Run the whole migration as one multi-statement query (matches apply-migration.js single-tx model).
  await client.query(sql);

  const after = await client.query('SELECT count(*)::bigint AS n FROM management_reviews');
  const quar = await client.query('SELECT count(*)::bigint AS n FROM management_reviews_quarantine_20260610');
  const con = await client.query(`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'management_reviews_review_date_type_key'
      AND conrelid = 'management_reviews'::regclass`);

  console.log('live count after delete (in-tx):', after.rows[0].n, '(expect 0)');
  console.log('quarantine count (in-tx):', quar.rows[0].n, '(expect == before)');
  console.log('UNIQUE constraint present (in-tx):', con.rowCount === 1 ? 'YES' : 'NO');

  const pass =
    after.rows[0].n === '0' &&
    quar.rows[0].n === before.rows[0].n &&
    con.rowCount === 1;

  if (!pass) throw new Error('PROBE ASSERTIONS FAILED');
  ok = true;
  console.log('\n✅ PROBE PASS — migration executes correctly (asserts pass, table empties, constraint adds).');
} catch (e) {
  console.error('\n❌ PROBE FAIL:', e.message);
} finally {
  try { await client.query('ROLLBACK'); console.log('rolled back — no committed change'); } catch {}
  await client.end();
  process.exitCode = ok ? 0 : 1;
}
