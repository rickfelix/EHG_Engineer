#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 — FR-2 part (a): the grant-posture readback.
 *
 * WHY THIS IS A SCRIPT AND NOT A `.db.test.js`. The vitest `db` project is DISABLED fleet-wide
 * ("no designated non-production target"), so a DB test here would SKIP rather than run — and a
 * skipped test is not evidence, it is a check that cannot fail. This runs on demand and reports
 * a real verdict.
 *
 * IT IS THE OBSERVABLE FOR A MIGRATION THAT CANNOT SELF-APPLY. The staged revoke waits for the
 * chairman ceremony, so the only proof it ran is a before/after difference in this output:
 *   BEFORE apply : authenticated holds TRUNCATE/DELETE/INSERT/UPDATE  -> exit 10 (STAGED_NOT_APPLIED)
 *   AFTER  apply : those are gone, SELECT retained, service_role intact -> exit 0 (APPLIED_AND_SAFE)
 *
 * Exit 10 is deliberately NOT exit 0 and NOT a failure: pre-apply is the expected state at merge
 * time, and a reviewer skimming for green must not read "unchanged posture" as "migration worked".
 *
 * Exit 1 is a real problem: the revoke landed but took collateral with it (authenticated lost
 * SELECT, or service_role lost its write path) — a silenced bus, which is worse than the exposure.
 *
 * Read-only. Never issues DDL.
 */
import 'dotenv/config';
import pg from 'pg';

const TABLE = 'session_coordination';
const REVOKED = ['TRUNCATE', 'DELETE', 'INSERT', 'UPDATE'];
const JSON_OUT = process.argv.includes('--json');

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
  if (!conn) { console.error('UNREADABLE: no SUPABASE_POOLER_URL / SUPABASE_DB_URL.'); process.exit(2); }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let rows;
  try {
    const r = await client.query(
      `select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = $1
        group by grantee order by grantee`,
      [TABLE],
    );
    rows = r.rows;
  } finally {
    await client.end();
  }

  if (!rows || rows.length === 0) {
    console.error(`UNREADABLE: no grants returned for public.${TABLE}. Not a pass.`);
    process.exit(2);
  }

  const privsOf = (role) => (rows.find((x) => x.grantee === role)?.privs ?? '').split(',').filter(Boolean);
  const authenticated = privsOf('authenticated');
  const anon = privsOf('anon');
  const serviceRole = privsOf('service_role');

  const stillRevocable = REVOKED.filter((p) => authenticated.includes(p));
  const authKeepsSelect = authenticated.includes('SELECT');
  const serviceCanWrite = serviceRole.includes('INSERT');
  // anon must never acquire a write grant. It holds none today; this is a ratchet, not a report.
  const anonWrites = anon.filter((p) => ['TRUNCATE', 'DELETE', 'INSERT', 'UPDATE'].includes(p));

  let verdict;
  let exit;
  if (anonWrites.length > 0) {
    verdict = 'REGRESSION'; exit = 1;
  } else if (!authKeepsSelect || !serviceCanWrite) {
    verdict = 'COLLATERAL_DAMAGE'; exit = 1;
  } else if (stillRevocable.length === REVOKED.length) {
    verdict = 'STAGED_NOT_APPLIED'; exit = 10;
  } else if (stillRevocable.length === 0) {
    verdict = 'APPLIED_AND_SAFE'; exit = 0;
  } else {
    verdict = 'PARTIALLY_APPLIED'; exit = 1;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ verdict, exit, authenticated, anon, service_role: serviceRole, still_revocable: stillRevocable }, null, 2));
  } else {
    console.log(`=== grant posture: public.${TABLE} ===`);
    for (const r of rows) console.log(`  ${r.grantee.padEnd(16)} : ${r.privs}`);
    console.log(`\nVERDICT: ${verdict}`);
    if (verdict === 'STAGED_NOT_APPLIED') {
      console.log(`  authenticated still holds [${stillRevocable.join(', ')}] — the staged revoke has NOT been applied.`);
      console.log('  This is the EXPECTED state at merge time. It is not a failure and not a pass.');
    } else if (verdict === 'APPLIED_AND_SAFE') {
      console.log('  The four write grants are gone from authenticated; SELECT retained; service_role write path intact.');
    } else if (verdict === 'COLLATERAL_DAMAGE') {
      if (!authKeepsSelect) console.log('  authenticated LOST SELECT — the read path was collateral damage.');
      if (!serviceCanWrite) console.log('  service_role LOST INSERT — THE FLEET WRITE PATH IS BROKEN. This is worse than the exposure.');
    } else if (verdict === 'REGRESSION') {
      console.log(`  anon has acquired write grants [${anonWrites.join(', ')}] — it held NONE at 2026-08-04 measurement.`);
    } else {
      console.log(`  Only some of the revoke landed; still present: [${stillRevocable.join(', ')}]. A half-applied grant posture needs a human.`);
    }
    console.log('\n  service_role is reported, never modified — out of scope per the SD Deletion Audit.');
  }
  process.exit(exit);
}

main().catch((e) => { console.error(`UNREADABLE: ${e.message}`); process.exit(2); });
