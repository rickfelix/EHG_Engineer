#!/usr/bin/env node
/**
 * Dry-run acceptance for FR-5 (default privileges) and FR-6 (security_audit_events, authenticated
 * axis) staged files -- same standalone-binary, BEGIN/ROLLBACK, raw-pooler pattern as
 * anon-truncate-sweep-acceptance.mjs (TR-1/TR-5/TR-6). SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from './lib/supabase-connection.js';
import { classifyMigration } from './lib/migration-tier-classifier.mjs';

// Same COMMIT-never-issued guard as anon-truncate-sweep-acceptance.mjs (SECURITY EXEC-phase review:
// this sibling suite lacked it despite advertising the same safety invariant).
const COMMIT_FAMILY = /(^|;)\s*(commit\b|end(?!\s*(loop|if|case|\$\$)\b)\s*;|prepare\s+transaction|release\s+savepoint\s+all)/i;
function assertNotCommitFamily(sql) {
  if (COMMIT_FAMILY.test(sql)) throw new Error(`REFUSING_COMMIT_FAMILY_STATEMENT: ${sql.slice(0, 80)}`);
  return sql;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATED_DIR = join(__dirname, '..', 'database', 'chairman-gated');

const FILES = [
  { up: '20260819_anon_truncate_default_privileges.sql', down: '20260819_anon_truncate_default_privileges_DOWN.sql', label: 'FR-5' },
  { up: '20260819_security_audit_events_revoke_authenticated_truncate.sql', down: '20260819_security_audit_events_revoke_authenticated_truncate_DOWN.sql', label: 'FR-6' },
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} -- ${name}${detail ? ': ' + detail : ''}`);
}

function stripTx(sql) {
  const afterBegin = sql.split('\nBEGIN;\n');
  if (afterBegin.length !== 2) throw new Error(`PARSE_FAILED: expected one BEGIN; delimiter, found ${afterBegin.length - 1}`);
  const beforeCommit = afterBegin[1].split('\nCOMMIT;\n');
  if (beforeCommit.length !== 2) throw new Error(`PARSE_FAILED: expected one COMMIT; delimiter, found ${beforeCommit.length - 1}`);
  return beforeCommit[0];
}

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);
  try {
    await q('BEGIN');
    for (const f of FILES) {
      const upSql = readFileSync(join(GATED_DIR, f.up), 'utf8');
      const downSql = readFileSync(join(GATED_DIR, f.down), 'utf8');

      const tier = classifyMigration(upSql);
      record(`${f.label}: UP file classifies as tier 2 (chairman-gated)`, tier.tier === 2, JSON.stringify(tier));

      const hasGrantAllOrBroad = /GRANT\s+ALL\b/i.test(downSql);
      record(`${f.label}: DOWN file contains no "GRANT ALL"`, !hasGrantAllOrBroad);

      await q('SAVEPOINT sp_dryrun');
      try {
        const body = stripTx(upSql);
        await q(body);
        record(`${f.label}: UP file applies cleanly (post-condition RAISE NOTICE fires, no exception)`, true);
      } catch (err) {
        record(`${f.label}: UP file applies cleanly`, false, err.message);
      } finally {
        await q('ROLLBACK TO SAVEPOINT sp_dryrun');
      }

      // UP -> DOWN round trip for FR-5/FR-6's specific targets.
      await q('SAVEPOINT sp_roundtrip');
      try {
        if (f.label === 'FR-5') {
          const before = await q(`select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as ns, defaclacl from pg_default_acl where defaclobjtype = 'r' and defaclrole::regrole::text = 'postgres' and defaclnamespace::regnamespace::text in ('public','storage') order by ns`);
          await q(stripTx(upSql));
          await q(stripTx(downSql));
          const after = await q(`select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as ns, defaclacl from pg_default_acl where defaclobjtype = 'r' and defaclrole::regrole::text = 'postgres' and defaclnamespace::regnamespace::text in ('public','storage') order by ns`);
          const identical = JSON.stringify(before.rows) === JSON.stringify(after.rows);
          record('FR-5: UP -> DOWN round-trip leaves pg_default_acl byte-identical', identical, identical ? '' : `before=${JSON.stringify(before.rows)} after=${JSON.stringify(after.rows)}`);
        } else {
          const before = await q(`select relacl from pg_class where oid = 'public.security_audit_events'::regclass`);
          await q(stripTx(upSql));
          await q(stripTx(downSql));
          const after = await q(`select relacl from pg_class where oid = 'public.security_audit_events'::regclass`);
          const identical = JSON.stringify(before.rows) === JSON.stringify(after.rows);
          record('FR-6: UP -> DOWN round-trip leaves relacl byte-identical', identical, identical ? '' : `before=${JSON.stringify(before.rows)} after=${JSON.stringify(after.rows)}`);
        }
      } finally {
        await q('ROLLBACK TO SAVEPOINT sp_roundtrip');
      }
    }
  } finally {
    await q('ROLLBACK');
    await client.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    console.log('FAILED:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('SUITE_FAILED:', err.message);
  process.exit(1);
});
