#!/usr/bin/env node
/**
 * One-shot remediation for SD-LEO-INFRA-STOP-RETRO-TRIGGER-001.
 *
 * Purges the test-fixture pollution that the pre-fix
 * tests/integration/retro-trigger-draft-insert.test.js leaked into the production
 * retrospectives table (all under sd_id f91556d5-6226-486f-a179-27c9b602029f).
 *
 * SAFETY (this is a destructive PROD delete — read before running):
 *  - DRY-RUN by default: opens a transaction, performs the DELETE, prints the
 *    counts, then ROLLBACKs. Nothing is committed without --apply.
 *  - --apply COMMITs, but ONLY if every guard passes, else it ROLLBACKs + exits 1:
 *      * --expected-count <N> must equal the live matched-row count (re-measure first);
 *      * the genuine (non-matching) row count must be unchanged by the delete;
 *      * all PRESERVE_ID_PREFIXES must still resolve to a row after the delete.
 *  - Uses `SET LOCAL session_replication_role = replica` so the AFTER-DELETE audit
 *    trigger (trg_retrospectives_audit, whose non-deferrable FK references the row
 *    being deleted) does not block the hard delete. SET LOCAL is scoped to this txn.
 *  - COORDINATOR-GATED: run with --apply ONLY after explicit coordinator greenlight
 *    (signal the exact predicate + a FRESH live count and wait for go-ahead).
 *  - NOT wired to CI or any test. Manual, deliberate invocation only.
 *
 * Usage:
 *   node scripts/one-off/purge-retro-test-fixture-pollution.mjs                       # dry-run
 *   node scripts/one-off/purge-retro-test-fixture-pollution.mjs --apply --expected-count 2294
 */
import { createDatabaseClient } from '../../lib/supabase-connection.js';

const TEST_SD_UUID = 'f91556d5-6226-486f-a179-27c9b602029f';

// Genuine retrospectives for SD-LEO-FIX-FIX-AUTO-POPULATE-001 that must SURVIVE the
// purge (validated at LEAD: none match the purge predicate). Stored as id prefixes.
const PRESERVE_ID_PREFIXES = ['f2f44f90', 'ad5a698c', '1d11cdd9'];

// The fixture-only predicate. Validated at LEAD to match exactly the leaked rows
// with 0 genuine rows caught. Each limb independently selects the same set.
const PREDICATE = `sd_id = $1 AND (project_name LIKE 'TEST-RETRO-%' OR title LIKE 'Regression %row%')`;

const apply = process.argv.includes('--apply');
const ecIdx = process.argv.indexOf('--expected-count');
const expectedCount = ecIdx !== -1 ? Number(process.argv[ecIdx + 1]) : null;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

const client = await createDatabaseClient('engineer', { verify: false });
let committed = false;
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL session_replication_role = replica`);

  const preserveSql = PRESERVE_ID_PREFIXES.map((_, i) => `id::text LIKE $${i + 2}`).join(' OR ');
  const preserveParams = PRESERVE_ID_PREFIXES.map(p => `${p}%`);

  const matched = (await client.query(`SELECT count(*)::int AS n FROM retrospectives WHERE ${PREDICATE}`, [TEST_SD_UUID])).rows[0].n;
  const genuineBefore = (await client.query(`SELECT count(*)::int AS n FROM retrospectives WHERE sd_id = $1 AND NOT (${PREDICATE.replace('$1', '$1')})`, [TEST_SD_UUID])).rows[0].n;
  const preservedBefore = (await client.query(`SELECT count(*)::int AS n FROM retrospectives WHERE sd_id = $1 AND (${preserveSql})`, [TEST_SD_UUID, ...preserveParams])).rows[0].n;

  console.log(`Mode:               ${apply ? 'APPLY (will COMMIT if guards pass)' : 'DRY-RUN (will ROLLBACK)'}`);
  console.log(`sd_id:              ${TEST_SD_UUID}`);
  console.log(`Matched (to purge): ${matched}`);
  console.log(`Genuine (NOT predicate, must be preserved): ${genuineBefore}`);
  console.log(`Known preserve-prefixes resolved (expect ${PRESERVE_ID_PREFIXES.length}): ${preservedBefore}`);

  const del = await client.query(`DELETE FROM retrospectives WHERE ${PREDICATE}`, [TEST_SD_UUID]);
  const deleted = del.rowCount;

  const genuineAfter = (await client.query(`SELECT count(*)::int AS n FROM retrospectives WHERE sd_id = $1`, [TEST_SD_UUID])).rows[0].n;
  const preservedAfter = (await client.query(`SELECT count(*)::int AS n FROM retrospectives WHERE sd_id = $1 AND (${preserveSql})`, [TEST_SD_UUID, ...preserveParams])).rows[0].n;

  console.log(`Deleted:            ${deleted}`);
  console.log(`Remaining for sd_id (genuine, after): ${genuineAfter}`);
  console.log(`Preserve-prefixes still present (after): ${preservedAfter}`);

  // ---- Guards ----
  const guards = [];
  if (deleted !== matched) guards.push(`deleted(${deleted}) != matched(${matched})`);
  if (genuineAfter !== genuineBefore) guards.push(`genuine rows changed: before=${genuineBefore} after=${genuineAfter} (would delete a genuine row!)`);
  if (preservedBefore !== PRESERVE_ID_PREFIXES.length) guards.push(`only ${preservedBefore}/${PRESERVE_ID_PREFIXES.length} preserve-prefixes found BEFORE — refusing`);
  if (preservedAfter !== preservedBefore) guards.push(`preserve-prefix count changed: before=${preservedBefore} after=${preservedAfter}`);
  if (apply && expectedCount === null) guards.push('--apply requires --expected-count <N> (re-measure the live count first)');
  if (apply && expectedCount !== null && expectedCount !== matched) guards.push(`--expected-count(${expectedCount}) != live matched(${matched}); re-confirm with coordinator`);

  if (guards.length) {
    console.error('\nGUARDS FAILED — rolling back:');
    for (const g of guards) console.error(`  - ${g}`);
    await client.query('ROLLBACK');
    fail('purge aborted (rolled back)');
  } else if (apply) {
    await client.query('COMMIT');
    committed = true;
    console.log(`\n✓ COMMITTED: purged ${deleted} fixture rows; ${genuineAfter} genuine rows preserved.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\n✓ DRY-RUN OK: would purge ${deleted} rows, preserve ${genuineAfter}. Re-run with --apply --expected-count ${matched} after coordinator greenlight.`);
  }
} catch (e) {
  try { if (!committed) await client.query('ROLLBACK'); } catch { /* ignore */ }
  fail(`error (rolled back): ${e.message}`);
} finally {
  await client.end();
}
