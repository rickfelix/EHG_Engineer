// QF-20260822-805 -- S2 decision_at backfill, incident ba330d67 / Part B S2 follow-up.
//
// Backfills solomon_advice_outcome_ledger.decision_at for the 2 rows Solomon's binding S2
// ruling named (922f8dfb.../0f9ffc05...), per lib/solomon/s2-decision-at-backfill.js.
// decision_by is NEVER written by this script -- both rows already carry the correct
// 'adam-08049808' identity from an earlier write path; only the null decision_at is patched.
//
// Dry-run by default (prints the staged patch, touches nothing). --apply executes the UPDATE
// and reads every row back to confirm the value landed exactly as staged.
//
// Usage: node scripts/one-off/backfill-s2-decision-at.mjs [--apply]
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { S2_DECISION_AT_TARGETS, buildDecisionAtBackfill } from '../../lib/solomon/s2-decision-at-backfill.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
  try {
    const ids = S2_DECISION_AT_TARGETS.map((t) => t.id);
    const { rows } = await client.query(
      'SELECT id, decision_by, decision_at FROM solomon_advice_outcome_ledger WHERE id = ANY($1::uuid[])',
      [ids]
    );
    const { applied, skipped } = buildDecisionAtBackfill(
      rows.map((r) => ({ id: r.id, decision_at: r.decision_at }))
    );

    console.log(`Staged: ${applied.length} row(s) to patch, ${skipped.length} skipped.`);
    for (const s of skipped) console.log(`  SKIP ${s.id}: ${s.reason}`);
    for (const a of applied) console.log(`  ${apply ? 'APPLY' : 'DRY-RUN'} ${a.id} -> decision_at=${a.decisionAt} (tol +/-${a.toleranceMinutes}min)`);

    if (!apply) {
      console.log('\nDry-run only -- pass --apply to execute.');
      return;
    }
    if (applied.length === 0) {
      console.log('\nNothing to apply.');
      return;
    }

    for (const a of applied) {
      await client.query(
        'UPDATE solomon_advice_outcome_ledger SET decision_at = $1 WHERE id = $2 AND decision_at IS NULL',
        [a.decisionAt, a.id]
      );
    }

    const { rows: verify } = await client.query(
      'SELECT id, decision_by, decision_at FROM solomon_advice_outcome_ledger WHERE id = ANY($1::uuid[]) ORDER BY id',
      [ids]
    );
    console.log('\nRead-back verification:');
    for (const row of verify) {
      console.log(`  ${row.id}: decision_by=${row.decision_by} decision_at=${row.decision_at}`);
    }
    const stillNull = verify.filter((r) => r.decision_at === null && applied.some((a) => a.id === r.id));
    if (stillNull.length > 0) {
      throw new Error(`Read-back FAILED: ${stillNull.length} row(s) still NULL after apply.`);
    }
    console.log('\nRead-back PASSED -- all staged rows now carry a non-NULL decision_at.');
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
