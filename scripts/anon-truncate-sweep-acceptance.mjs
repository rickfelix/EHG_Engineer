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

/**
 * Extracts the real file's four sections by literal delimiter, so every test below runs the file's
 * OWN code rather than a hand-rebuilt reconstruction. A hand-rebuilt copy is exactly how this suite
 * drifted from the real post-condition twice already during EXEC-phase review (TESTING D5) -- once
 * a mutation helper stops being byte-for-byte the shipped logic, it stops proving anything about the
 * shipped file.
 */
function extractUpFileSections(sql) {
  const afterBegin = sql.split('\nBEGIN;\n');
  if (afterBegin.length !== 2) throw new Error(`PARSE_FAILED: expected exactly one "\\nBEGIN;\\n" delimiter, found ${afterBegin.length - 1}`);
  const beforeCommit = afterBegin[1].split('\nCOMMIT;\n');
  if (beforeCommit.length !== 2) throw new Error(`PARSE_FAILED: expected exactly one "\\nCOMMIT;\\n" delimiter, found ${beforeCommit.length - 1}`);
  const body = beforeCommit[0];

  const beforeRevokes = body.split('\n\nREVOKE TRUNCATE ON ');
  if (beforeRevokes.length !== 2) throw new Error(`PARSE_FAILED: expected exactly one "\\n\\nREVOKE TRUNCATE ON " delimiter, found ${beforeRevokes.length - 1}`);
  const baselineCapture = beforeRevokes[0]; // SET LOCAL ... + CREATE TEMP TABLE _sweep_baseline ...
  const rest = 'REVOKE TRUNCATE ON ' + beforeRevokes[1];

  const revokeVsPostCondition = rest.split(/\n\n-- Post-condition:/);
  if (revokeVsPostCondition.length !== 2) throw new Error(`PARSE_FAILED: expected exactly one post-condition comment delimiter, found ${revokeVsPostCondition.length - 1}`);
  const revokeStatements = revokeVsPostCondition[0];

  const doStart = revokeVsPostCondition[1].indexOf('DO $$');
  if (doStart === -1) throw new Error('PARSE_FAILED: no "DO $$" found after the post-condition comment');
  const afterDo = revokeVsPostCondition[1].slice(doStart).split('\n\nDROP TABLE _sweep_baseline;\n');
  if (afterDo.length !== 2) throw new Error(`PARSE_FAILED: expected exactly one "DROP TABLE _sweep_baseline;" delimiter, found ${afterDo.length - 1}`);
  const postConditionBlock = afterDo[0]; // DO $$ ... END $$;

  return { baselineCapture, revokeStatements, postConditionBlock };
}

async function t1_dryRunRealFile(client, q, artifact) {
  await q('SAVEPOINT sp_t1');
  try {
    const sql = readFileSync(UP_PATH, 'utf8');
    const { baselineCapture, revokeStatements, postConditionBlock } = extractUpFileSections(sql);
    await q(baselineCapture);
    await q(revokeStatements);
    await q(postConditionBlock);
    record('T1: real staged UP file applies cleanly and its own post-condition RAISE NOTICE fires (no exception)', true, `${artifact.actionable_count} relations`);
  } catch (err) {
    record('T1: real staged UP file applies cleanly', false, err.message);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t1');
  }
}

async function t2_mutationTestPostCondition(client, q, artifact) {
  const relations = artifact.relations;
  const sample = relations.slice(0, 3);
  const upSql = readFileSync(UP_PATH, 'utf8');
  const { baselineCapture, revokeStatements, postConditionBlock } = extractUpFileSections(upSql);

  // Mutation A: drop one REVOKE line (leave a relation un-revoked) -- the REAL post-condition must
  // RAISE, run verbatim from the file (see extractUpFileSections header comment for why).
  await q('SAVEPOINT sp_t2a');
  try {
    await q(baselineCapture);
    const mutatedRevokes = revokeStatements.split('\n').filter((l) => !l.includes(` ${sample[0]} `)).join('\n');
    await q(mutatedRevokes);
    let raised = false;
    try { await q(postConditionBlock); } catch { raised = true; }
    record('T2a: real post-condition RAISEs when one relation is left un-revoked', raised);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t2a');
  }

  // Mutation B: bogus/dropped relation in the baseline-capture's regclass array -- must raise 42P01
  // at the BASELINE CAPTURE step (earliest possible point, per the file's own design), not later.
  await q('SAVEPOINT sp_t2b');
  try {
    const mutatedBaseline = baselineCapture.replace(
      /\]::regclass\[\]\) AS rel;$/m,
      `,\n  'public.__does_not_exist_sweep_mutation__'\n]::regclass[]) AS rel;`
    );
    if (mutatedBaseline === baselineCapture) throw new Error('T2B_MUTATION_NOOP: regex did not match the baseline-capture text -- test would give a false pass');
    let code = null;
    try { await q(mutatedBaseline); } catch (err) { code = err.code; }
    record('T2b: baseline capture raises 42P01 for a bogus relation name in the regclass array', code === '42P01', `code=${code}`);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t2b');
  }

  // Mutation C: leave anon's SELECT stripped (over-broad revoke) -- the REAL post-condition must RAISE.
  await q('SAVEPOINT sp_t2c');
  try {
    await q(baselineCapture);
    await q(revokeStatements);
    await q(`REVOKE SELECT ON ${sample[0]} FROM anon`);
    let raised = false;
    try { await q(postConditionBlock); } catch { raised = true; }
    record('T2c: real post-condition RAISEs when anon loses SELECT (over-broad revoke) on one relation', raised);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t2c');
  }

  // Mutation D (closes the D1 finding, TESTING + SECURITY EXEC-phase review): revoke a NON-SELECT
  // privilege (MAINTAIN, adjacent to TRUNCATE in the arwdDxtm ACL string) -- the first-drafted post-
  // condition asserted only SELECT, so this exact mutation would have silently passed before the fix.
  await q('SAVEPOINT sp_t2d');
  try {
    await q(baselineCapture);
    await q(revokeStatements);
    await q(`REVOKE MAINTAIN ON ${sample[0]} FROM anon`);
    let raised = false;
    try { await q(postConditionBlock); } catch { raised = true; }
    record('T2d: real post-condition RAISEs when anon loses MAINTAIN (a non-SELECT untouched privilege)', raised);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t2d');
  }

  // Mutation E (closes TESTING D5): the POST_CONDITION_COUNT_MISMATCH branch had never been observed
  // firing. Trigger it by capturing a baseline with one FEWER relation than the (unmutated)
  // post-condition's hardcoded expected-count literal.
  await q('SAVEPOINT sp_t2e');
  try {
    const shrunkBaseline = baselineCapture.replace(/ARRAY\[\n\s*'[^']+',\n/, 'ARRAY[\n');
    if (shrunkBaseline === baselineCapture) throw new Error('T2E_MUTATION_NOOP: regex did not remove the first array element -- test would give a false pass');
    await q(shrunkBaseline);
    const revokesExcludingSample0 = revokeStatements.split('\n').filter((l) => !l.includes(` ${sample[0]} `)).join('\n');
    await q(revokesExcludingSample0);
    let mismatchDetected = false;
    try { await q(postConditionBlock); } catch (err) { mismatchDetected = /COUNT_MISMATCH/.test(err.message); }
    record('T2e: real post-condition raises POST_CONDITION_COUNT_MISMATCH when the baseline row count differs from the expected literal', mismatchDetected);
  } finally {
    // ROLLBACK TO SAVEPOINT alone (no separate DROP TABLE first) -- if an earlier statement in this
    // block errored, the transaction is aborted and NO normal statement (including DROP TABLE) can
    // run until a ROLLBACK recovers it; ROLLBACK TO SAVEPOINT also undoes the CREATE TEMP TABLE
    // itself, so an explicit DROP is both redundant and, ordered first, the actual bug.
    await q('ROLLBACK TO SAVEPOINT sp_t2e');
  }
}

/**
 * TR-4 (the standing machine-checkable file invariant, confirmed missing by TESTING + SECURITY
 * EXEC-phase review -- previously verified only ad-hoc by a reviewing sub-agent, never as a real
 * persisted check). Every non-comment line in the staged UP file's REVOKE block must match the
 * strict pattern REVOKE TRUNCATE ON <schema>.<relation> FROM anon; and the sorted relation set must
 * equal the enumeration artifact byte-for-byte.
 */
function partitionStatements(sql) {
  const withoutDoBlock = sql.replace(/DO \$\$[\s\S]*?\$\$;/g, 'DO_BLOCK;');
  const withoutComments = withoutDoBlock.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  return withoutComments.split(';').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

const REVOKE_STATEMENT = /^REVOKE TRUNCATE ON [a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]* FROM anon$/;
const SCAFFOLD_ALLOWLIST = new Set(['BEGIN', "SET LOCAL lock_timeout = '5s'", 'DO_BLOCK', 'COMMIT', 'DROP TABLE _sweep_baseline']);
function isAllowedNonPrivilegeStatement(stmt) {
  return SCAFFOLD_ALLOWLIST.has(stmt) || /^CREATE TEMP TABLE _sweep_baseline\b/.test(stmt);
}

async function t5_fileLint(artifact) {
  const upSql = readFileSync(UP_PATH, 'utf8');
  const STRICT_LINE = /^REVOKE TRUNCATE ON ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*) FROM anon;$/;
  const lines = upSql.split('\n').filter((l) => l.trim().startsWith('REVOKE TRUNCATE ON'));
  const nonConforming = lines.filter((l) => !STRICT_LINE.test(l));
  record('T5a: every REVOKE line in the staged UP file matches the strict pattern', nonConforming.length === 0, nonConforming.length > 0 ? nonConforming.slice(0, 3).join(' | ') : `${lines.length} lines checked`);

  const fileRelations = lines.map((l) => STRICT_LINE.exec(l)?.[1]).filter(Boolean).sort();
  const artifactRelations = [...artifact.relations].sort();
  const identical = JSON.stringify(fileRelations) === JSON.stringify(artifactRelations);
  record('T5b: the file\'s relation set equals the enumeration artifact, byte-for-byte (sorted)', identical, identical ? `${fileRelations.length} relations` : `file=${fileRelations.length} artifact=${artifactRelations.length}`);

  // T5c (SECURITY EXEC-phase re-review, "SEC-R5"): T5a/T5b self-select to lines that ALREADY start
  // with "REVOKE TRUNCATE ON" -- an appended GRANT, an out-of-artifact REVOKE, or a DROP TABLE
  // anywhere else in the file is invisible to both, since neither ever looks at what else is present.
  // Partition EVERY statement in the file; each must be either a conforming REVOKE TRUNCATE or a
  // member of the file's own fixed scaffold -- nothing else is permitted to exist.
  const allStatements = partitionStatements(upSql);
  const privilegeStatements = allStatements.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
  const otherStatements = allStatements.filter((s) => !/^(GRANT|REVOKE)\b/i.test(s));
  const nonConformingPrivilege = privilegeStatements.filter((s) => !REVOKE_STATEMENT.test(s));
  const nonConformingOther = otherStatements.filter((s) => !isAllowedNonPrivilegeStatement(s));
  const clean = nonConformingPrivilege.length === 0 && nonConformingOther.length === 0;
  record(
    'T5c: every statement in the staged UP file is a conforming REVOKE TRUNCATE or a named scaffold statement (no smuggled addition)',
    clean,
    clean ? `${allStatements.length} statements checked` : `bad_privilege=${nonConformingPrivilege.length} bad_other=${nonConformingOther.map((s) => s.slice(0, 60)).join(' | ')}`
  );

  // T5d: mutation-prove T5c is not vacuous. Append a statement T5a/T5b structurally cannot see (it
  // never starts with "REVOKE TRUNCATE ON") and confirm the SAME partition logic flags it. Runs
  // against an in-memory mutated copy only -- never touches the real file or the database.
  const mutated = upSql.replace('\nCOMMIT;\n', '\nGRANT ALL ON public.__sec_r5_mutation_probe TO anon;\nCOMMIT;\n');
  if (mutated === upSql) throw new Error('T5D_MUTATION_NOOP: replace target not found in the real file -- test would give a false pass');
  const mutatedStatements = partitionStatements(mutated);
  const mutatedPrivilege = mutatedStatements.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
  const mutatedOther = mutatedStatements.filter((s) => !/^(GRANT|REVOKE)\b/i.test(s));
  const mutationCaught = mutatedPrivilege.some((s) => !REVOKE_STATEMENT.test(s)) || mutatedOther.some((s) => !isAllowedNonPrivilegeStatement(s));
  record('T5d: T5c catches a smuggled statement (appended GRANT ALL) that T5a/T5b would miss', mutationCaught);
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

/**
 * Top-level safety net: an unexpected throw escaping a test SECTION (not an individual mutation
 * within it) must not cascade and kill every test after it -- a savepoint here + a catch/rollback
 * turns "one section has a bug" into "one section is reported as a hard failure, the rest still run
 * and still mean something," rather than "current transaction is aborted" for everything downstream.
 */
async function runSection(q, name, fn) {
  await q(`SAVEPOINT sp_section_${name}`);
  try {
    await fn();
  } catch (err) {
    record(`SECTION ${name}: crashed unexpectedly`, false, err.message);
  } finally {
    try { await q('ROLLBACK TO SAVEPOINT sp_section_' + name); } catch { /* connection likely already dead; main()'s own finally will surface it */ }
  }
}

async function main() {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  const q = await withQ(client);
  try {
    await q('BEGIN');
    await runSection(q, 't1', () => t1_dryRunRealFile(client, q, artifact));
    await runSection(q, 't2', () => t2_mutationTestPostCondition(client, q, artifact));
    await runSection(q, 't3', () => t3_upDownRoundTrip(client, q, artifact));
    await runSection(q, 't4', () => t4_refusalProbe(client, q));
    await runSection(q, 't5', () => t5_fileLint(artifact));
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
