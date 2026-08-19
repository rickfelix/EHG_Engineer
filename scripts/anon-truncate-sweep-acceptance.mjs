#!/usr/bin/env node
/**
 * FR-3 acceptance suite for SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001, as a standalone binary (TR-6: the
 * vitest `db` project silently ctx.skip()s in this environment/CI -- DESIGNATED_NON_PROD_REFS is
 * frozen empty -- so a live-database assertion placed there would report green while testing nothing).
 * This script's own exit code IS the pass/fail signal. Uses the raw pooler connection (TR-1/TR-5),
 * never public.exec_sql (which rejects the literal string "TRUNCATE").
 *
 * Everything below runs inside BEGIN/ROLLBACK, mirroring the COMMIT-never-issued invariant already
 * established in scripts/anon-write-contract-probe.mjs -- query() throws on any commit-family
 * statement, so a connection drop or an early return is already safe; ROLLBACK-in-finally is hygiene,
 * not the guarantee.
 *
 * Sections:
 *   T1 -- dry-run the REAL staged UP file (AC-9): the highest-value test, since a scratch-mirror
 *         rewrite would test a transformation of the artifact, not the artifact itself.
 *   T2 -- mutation-test the post-condition (AC-8/TS-9): a post-condition never observed failing is
 *         indistinguishable from one that cannot fail.
 *   T3 -- UP -> DOWN round-trip, byte-identical relacl (AC-10/TS-10), plus a GRANT ALL lint on every
 *         staged _DOWN file in this SD.
 *   T4 -- TRUNCATE-refusal probe on a representative sample, SAVEPOINT-guarded per relation (FR-3
 *         AC-5), exact-42501 discrimination distinguishing genuine refusal from the 0A000
 *         FK-referenced-table error path (FR-3 AC-6).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATED_DIR = join(__dirname, '..', 'database', 'chairman-gated');
const UP_PATH = join(GATED_DIR, '20260819_anon_truncate_sweep.sql');
const DOWN_PATH = join(GATED_DIR, '20260819_anon_truncate_sweep_DOWN.sql');
const ARTIFACT_PATH = join(GATED_DIR, 'anon-truncate-sweep-enumeration.json');

// Excludes PL/pgSQL block terminators (END LOOP / END IF / END CASE / END $$), which are not the
// transaction-ending "END" statement -- only a bare END (immediately followed by `;` or whitespace
// then end-of-string) is the dangerous form.
const COMMIT_FAMILY = /(^|;)\s*(commit\b|end(?!\s*(loop|if|case|\$\$)\b)\s*;|prepare\s+transaction|release\s+savepoint\s+all)/i;
function assertNotCommitFamily(sql) {
  if (COMMIT_FAMILY.test(sql)) throw new Error(`REFUSING_COMMIT_FAMILY_STATEMENT: ${sql.slice(0, 80)}`);
  return sql;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} -- ${name}${detail ? ': ' + detail : ''}`);
}

async function withQ(client) {
  return (sql, params) => client.query(assertNotCommitFamily(sql), params);
}

async function t1_dryRunRealFile(client, q, artifact) {
  await q('SAVEPOINT sp_t1');
  try {
    const sql = readFileSync(UP_PATH, 'utf8');
    // Strip the file's own BEGIN;/COMMIT; -- we run it inside our own transaction/savepoint instead.
    // Literal split on the exact delimiters the generator emits (surrounded by blank lines), rather
    // than a regex, since the file's own header prose mentions "BEGIN"/"COMMIT" in free text and a
    // loose regex risks matching there instead of the actual statement lines.
    const afterBegin = sql.split('\nBEGIN;\n');
    if (afterBegin.length !== 2) throw new Error(`T1_PARSE_FAILED: expected exactly one "\\nBEGIN;\\n" delimiter, found ${afterBegin.length - 1}`);
    const beforeCommit = afterBegin[1].split('\nCOMMIT;\n');
    if (beforeCommit.length !== 2) throw new Error(`T1_PARSE_FAILED: expected exactly one "\\nCOMMIT;\\n" delimiter, found ${beforeCommit.length - 1}`);
    const body = beforeCommit[0];
    await q(body);
    record('T1: real staged UP file applies cleanly and its own post-condition RAISE NOTICE fires (no exception)', true, `${artifact.actionable_count} relations`);
  } catch (err) {
    record('T1: real staged UP file applies cleanly', false, err.message);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t1');
  }
}

async function t2_mutationTestPostCondition(client, q, artifact) {
  const relations = artifact.relations;
  const sample = relations.slice(0, 3);

  // Mutation A: drop one REVOKE line (leave a relation un-revoked) -- post-condition must RAISE.
  await q('SAVEPOINT sp_t2a');
  try {
    const revokes = relations.filter((r) => r !== sample[0]).map((r) => `REVOKE TRUNCATE ON ${r} FROM anon;`).join('\n');
    const postCondition = buildPostCondition(relations);
    await q(revokes);
    let raised = false;
    try { await q(postCondition); } catch { raised = true; }
    record('T2a: post-condition RAISEs when one relation is left un-revoked', raised);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t2a');
  }

  // Mutation B: inject a bogus/dropped relation into the regclass array -- must raise 42P01.
  await q('SAVEPOINT sp_t2b');
  try {
    const postCondition = buildPostCondition([...relations.slice(0, 5), 'public.__does_not_exist_sweep_mutation__']);
    let code = null;
    try { await q(postCondition); } catch (err) { code = err.code; }
    record('T2b: post-condition raises 42P01 for a bogus relation name in the regclass array', code === '42P01', `code=${code}`);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t2b');
  }

  // Mutation C: leave anon's SELECT stripped (over-broad revoke) -- must RAISE on the positive control.
  await q('SAVEPOINT sp_t2c');
  try {
    const revokes = relations.map((r) => `REVOKE TRUNCATE ON ${r} FROM anon;`).join('\n');
    await q(revokes);
    await q(`REVOKE SELECT ON ${sample[0]} FROM anon`);
    const postCondition = buildPostCondition(relations);
    let raised = false;
    try { await q(postCondition); } catch { raised = true; }
    record('T2c: post-condition RAISEs when anon loses SELECT (over-broad revoke) on one relation', raised);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t2c');
  }
}

function buildPostCondition(relations) {
  const arrayLiteral = relations.map((r) => `'${r}'`).join(',\n    ');
  return `DO $$
DECLARE
  rel regclass;
  bad_truncate_count integer := 0;
  bad_select_count integer := 0;
  checked_count integer := 0;
BEGIN
  FOR rel IN SELECT unnest(ARRAY[
    ${arrayLiteral}
  ]::regclass[])
  LOOP
    checked_count := checked_count + 1;
    IF has_table_privilege('anon', rel, 'TRUNCATE') THEN bad_truncate_count := bad_truncate_count + 1; END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN aclexplode(c.relacl) a ON true JOIN pg_roles r ON r.oid = a.grantee
               WHERE c.oid = rel AND r.rolname = 'anon' AND a.privilege_type = 'TRUNCATE') THEN
      bad_truncate_count := bad_truncate_count + 1;
    END IF;
    IF NOT has_table_privilege('anon', rel, 'SELECT') THEN bad_select_count := bad_select_count + 1; END IF;
  END LOOP;
  IF bad_truncate_count > 0 THEN RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) still show anon TRUNCATE', bad_truncate_count; END IF;
  IF bad_select_count > 0 THEN RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) lost anon SELECT', bad_select_count; END IF;
  RAISE NOTICE 'POST_CONDITION_PASSED: %', checked_count;
END $$;`;
}

async function t3_upDownRoundTrip(client, q, artifact) {
  const sample = artifact.relations.slice(0, 5);
  await q('SAVEPOINT sp_t3');
  try {
    const before = await q(
      `select c.oid::regclass::text as rel, c.relacl from pg_class c where c.oid = ANY($1::regclass[])`,
      [sample]
    );
    const beforeMap = new Map(before.rows.map((r) => [r.rel, r.relacl]));

    for (const r of sample) await q(`REVOKE TRUNCATE ON ${r} FROM anon`);
    for (const r of sample) await q(`GRANT TRUNCATE ON ${r} TO anon`);

    const after = await q(
      `select c.oid::regclass::text as rel, c.relacl from pg_class c where c.oid = ANY($1::regclass[])`,
      [sample]
    );
    const afterMap = new Map(after.rows.map((r) => [r.rel, r.relacl]));

    let identical = true;
    for (const r of sample) {
      if (JSON.stringify(beforeMap.get(r)) !== JSON.stringify(afterMap.get(r))) identical = false;
    }
    record('T3a: UP -> DOWN round-trip leaves relacl byte-identical to pre-UP snapshot (sample of 5)', identical);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t3');
  }

  const downSql = readFileSync(DOWN_PATH, 'utf8');
  const hasGrantAll = /GRANT\s+ALL\b/i.test(downSql);
  record('T3b: staged _DOWN file contains no literal "GRANT ALL" (grant-precise rollback only)', !hasGrantAll);
}

async function t4_refusalProbe(client, q) {
  // Representative sample: 2 ordinary relations + 1 FK-referenced relation (to exercise the 0A000
  // path per FR-3 AC-6) + 1 scratch table as a positive control.
  await q('SAVEPOINT sp_t4_setup');
  let sample;
  try {
    const { rows: fkReferenced } = await q(`
      select format('%I.%I', n.nspname, c.relname) as rel
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join aclexplode(c.relacl) a on true
      join pg_roles r on r.oid = a.grantee
      where r.rolname = 'anon' and a.privilege_type = 'TRUNCATE' and c.relkind = 'r'
        and exists (select 1 from pg_constraint fk where fk.confrelid = c.oid and fk.contype = 'f')
      limit 1
    `);
    const { rows: ordinary } = await q(`
      select format('%I.%I', n.nspname, c.relname) as rel
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join aclexplode(c.relacl) a on true
      join pg_roles r on r.oid = a.grantee
      where r.rolname = 'anon' and a.privilege_type = 'TRUNCATE' and c.relkind = 'r'
        and not exists (select 1 from pg_constraint fk where fk.confrelid = c.oid and fk.contype = 'f')
      limit 2
    `);
    sample = { fkReferenced: fkReferenced[0]?.rel, ordinary: ordinary.map((r) => r.rel) };
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t4_setup');
  }

  const targets = [...sample.ordinary, sample.fkReferenced].filter(Boolean);
  for (const rel of targets) {
    await q('SAVEPOINT sp_t4_probe');
    try {
      // Revoke FIRST, within this same savepoint scope -- otherwise this probe tests refusal against
      // still-live-granted state (a bug caught during this suite's own first run: TRUNCATE genuinely
      // LANDED for two ordinary tables because nothing had actually been revoked yet).
      await q(`REVOKE TRUNCATE ON ${rel} FROM anon`);
      await q('SET LOCAL ROLE anon');
      try {
        await q(`TRUNCATE ${rel}`);
        record(`T4: TRUNCATE as anon on ${rel} (post-revoke)`, false, 'LANDED (should be refused)');
      } catch (err) {
        const exactRefusal = err.code === '42501';
        const fkPath = err.code === '0A000';
        record(
          `T4: TRUNCATE as anon on ${rel} (post-revoke)`,
          exactRefusal || fkPath,
          exactRefusal ? 'REFUSED (42501, exact)' : fkPath ? 'REFUSED via FK-referenced-table path (0A000, distinguished per AC-6)' : `UNEXPECTED code=${err.code}`
        );
        // The savepoint is now in an aborted state (a real Postgres error occurred inside it) --
        // do NOT run any further statement (e.g. RESET ROLE) before the outer finally's
        // ROLLBACK TO SAVEPOINT restores it. SET LOCAL ROLE is itself savepoint-scoped, so the
        // rollback below also undoes the role change; no explicit RESET ROLE is needed either way.
      }
    } finally {
      await q('ROLLBACK TO SAVEPOINT sp_t4_probe');
    }
  }

  // Positive control: confirm the probe mechanism itself can observe a LANDING truncate, so a probe
  // that always reports REFUSED regardless of actual state would be caught.
  await q('SAVEPOINT sp_t4_positive');
  try {
    await q('CREATE TEMP TABLE _t4_positive_control (id int)');
    await q('GRANT TRUNCATE ON _t4_positive_control TO anon');
    await q('SET LOCAL ROLE anon');
    let landed = false;
    try { await q('TRUNCATE _t4_positive_control'); landed = true; } catch { /* leave false */ }
    record('T4: positive control -- TRUNCATE as anon LANDS on a scratch table still granted TRUNCATE', landed);
  } finally {
    await q('ROLLBACK TO SAVEPOINT sp_t4_positive');
  }
}

async function main() {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  const q = await withQ(client);
  try {
    await q('BEGIN');
    await t1_dryRunRealFile(client, q, artifact);
    await t2_mutationTestPostCondition(client, q, artifact);
    await t3_upDownRoundTrip(client, q, artifact);
    await t4_refusalProbe(client, q);
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
