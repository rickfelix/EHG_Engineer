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
const DOWN = path.resolve(__dirname, '..', 'database', 'migrations', '20260610_purge_management_reviews_pollution_DOWN.sql');
const upSql = fs.readFileSync(UP, 'utf8');
const downSql = fs.readFileSync(DOWN, 'utf8');

const constraintQ = `
  SELECT 1 FROM pg_constraint
  WHERE conname = 'management_reviews_review_date_type_key'
    AND conrelid = 'management_reviews'::regclass`;
// Order-independent full-content fingerprint of the table, to prove the DOWN restores it exactly.
const fingerprintQ = `
  SELECT md5(coalesce(string_agg(t.row_md5, '' ORDER BY t.row_md5), '')) AS fp
  FROM (SELECT md5(management_reviews::text) AS row_md5 FROM management_reviews) t`;

const client = await createDatabaseClient('ehg');
let ok = false;
let skipped = false;
try {
  // SD-LEO-INFRA-RETARGET-RESTORE-REHEARSAL-001: this is a one-shot pre-flight probe for a
  // migration that has already shipped to production (management_reviews_quarantine_20260610
  // is live). upSql's own 0a guard aborts on a pre-existing quarantine table, so re-running the
  // full probe against today's already-migrated state would always fail confusingly inside the
  // migration SQL. When this table is eventually DROPped (chairman-gated, separate migration —
  // see the breadcrumb in lib/retention/policies.js and scripts/sentinels/audit-security-linter.mjs),
  // this script becomes fully dead and should be deleted in that same PR.
  const existing = await client.query(
    "SELECT to_regclass('public.management_reviews_quarantine_20260610') AS t"
  );

  if (existing.rows[0].t !== null) {
    skipped = true;
    ok = true;
    console.log('ℹ️  management_reviews_quarantine_20260610 already exists — the 20260610 migration this probes has already shipped. Nothing further to verify; this script is historical.');
  } else {
    await client.query('BEGIN');

    const before = await client.query('SELECT count(*)::bigint AS n FROM management_reviews');
    const fpBefore = await client.query(fingerprintQ);
    console.log('live count before (in-tx):', before.rows[0].n);

    // --- UP: run the whole migration as one multi-statement query (matches apply-migration.js model) ---
    await client.query(upSql);

    const after = await client.query('SELECT count(*)::bigint AS n FROM management_reviews');
    const quar = await client.query('SELECT count(*)::bigint AS n FROM management_reviews_quarantine_20260610');
    const conUp = await client.query(constraintQ);
    console.log('after UP  — live:', after.rows[0].n, '(expect 0) | quarantine:', quar.rows[0].n, '(expect == before) | UNIQUE present:', conUp.rowCount === 1 ? 'YES' : 'NO');

    // --- DOWN: roll the purge back inside the same tx and prove byte-identical restoration ---
    await client.query(downSql);

    const restored = await client.query('SELECT count(*)::bigint AS n FROM management_reviews');
    const fpAfter = await client.query(fingerprintQ);
    const conDown = await client.query(constraintQ);
    console.log('after DOWN — live:', restored.rows[0].n, '(expect == before) | UNIQUE present:', conDown.rowCount === 1 ? 'YES' : 'NO', '(expect NO) | fingerprint match:', fpBefore.rows[0].fp === fpAfter.rows[0].fp ? 'YES' : 'NO');

    const pass =
      after.rows[0].n === '0' &&
      quar.rows[0].n === before.rows[0].n &&
      conUp.rowCount === 1 &&
      restored.rows[0].n === before.rows[0].n &&
      conDown.rowCount === 0 &&
      fpBefore.rows[0].fp === fpAfter.rows[0].fp;

    if (!pass) throw new Error('PROBE ASSERTIONS FAILED');
    ok = true;
    console.log('\n✅ PROBE PASS — UP purges + constrains, DOWN restores byte-identical (fingerprint match), all rolled back.');
  }
} catch (e) {
  console.error('\n❌ PROBE FAIL:', e.message);
} finally {
  if (!skipped) {
    try { await client.query('ROLLBACK'); console.log('rolled back — no committed change'); } catch {}
  }
  await client.end();
  process.exitCode = ok ? 0 : 1;
}
