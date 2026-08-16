// Behavioural acceptance for
// database/chairman-gated/20260816_defacl_anon_auth_axis.sql
// (SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001, FR-4).
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. Writes .artifacts/defacl-anon-auth-axis-
//                                  baseline.json (AXIS-1 defacl rows, AXIS-2 manifest compliance
//                                  + completeness, public_exec_count scope-guard anchor).
//   node <this file> --verify      AFTER  the apply. Compares live state against the saved
//                                  baseline; every assertion below must PASS.
//   node <this file> --self-test   Fixture-only, zero DB/network dependency. Proves the assertion
//                                  LOGIC independent of live catalog observability (prospective
//                                  TESTING guidance, evidence d2d233ca-0c2c-4c5c-8982-5be923c28a61).
//
// ── TWO INDEPENDENT AXES (kept separate on purpose — a pass on one proves nothing about the
//    other; conflating them was the single highest-value correction from prospective TESTING
//    review, since ALTER DEFAULT PRIVILEGES is FUTURE-SCOPED ONLY) ───────────────────────────────
//   AXIS-1 (default-ACL / FUTURE functions): does this SD's own migration
//     (20260816_defacl_anon_auth_axis.sql) still leave anon/authenticated named in
//     pg_default_acl for (postgres, public) / (supabase_admin, public)?
//   AXIS-2 (existing-surface completeness / EXISTING functions): does the
//     scripts/audit-rpc-execute-grants-buckets.json manifest (extended by this SD with 3 new
//     Bucket C entries) still fully declare every live anon/PUBLIC-executable SECDEF function?
//     This reuses evaluateBucketCompliance()/findUndeclaredExposures() from
//     scripts/audit-rpc-execute-grants.mjs directly (VALIDATION finding: extend, don't
//     duplicate) — it does NOT re-implement bucket-compliance logic here.
//
// ── WHY A CATALOG READ, NOT A CREATE/DROP PROBE FUNCTION ─────────────────────────────────────
// pg_default_acl IS the exact catalog row PostgreSQL consults when a new function is created —
// reading it directly is not a proxy for the mechanism, it IS the mechanism's own state. A
// throwaway CREATE FUNCTION would only be indirect evidence of the same fact, and would also
// require DDL, which the exec_sql RPC path structurally rejects ("only allows SELECT/WITH") and
// the direct pooler connection cannot currently reach (credential-broken, confirmed in
// scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs). A live create/drop probe
// remains available as an OPTIONAL manual chairman-ceremony step (run by the chairman's own
// psql session, which has real DDL privileges) but is not required for this script to give a
// rigorous AXIS-1 verdict.
//
// ── SCOPE GUARD — the out-of-scope guarantee (VALIDATION finding, evidence 9af23eb7) ─────────
// The predecessor migration (database/chairman-gated/20260816_close_remaining_secdef_execute_
// exposure.sql:16-28) documents a SEPARATE, already-tracked defect: 84% of public functions
// (636/759 at last measurement) are public_exec=true via a DIFFERENT mechanism (a blanket
// GRANT...TO PUBLIC loop bug at database/migrations/20260603_03_revoke_secdef_execute_from_
// anon_authenticated_rollback.sql:19). This script asserts public_exec_count is UNCHANGED
// between baseline and verify — if it ever changes, that is a signal this acceptance script (or
// the migration it verifies) has silently widened to claim credit for fixing that unrelated
// defect, and the assertion below fails loudly rather than let the claim travel unchecked.
//
// ── BLAST RADIUS ───────────────────────────────────────────────────────────────────────────────
// None in --baseline/--verify: every live query is a SELECT via exec_sql (which itself rejects
// non-SELECT/WITH statements). --self-test makes zero network calls. Nothing is created, granted,
// revoked, or deleted by this script — the two staged migration files are the only things that
// mutate state, and only once the chairman applies them.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { evaluateBucketCompliance, findUndeclaredExposures } from '../../scripts/audit-rpc-execute-grants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(REPO_ROOT, '.artifacts', 'defacl-anon-auth-axis-baseline.json');

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : process.argv.includes('--self-test') ? 'self-test'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify | --self-test   (the baseline is not optional for --verify)');
  process.exit(2);
}

const supabase = MODE === 'self-test' ? null : createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Single-line SQL only — the exec_sql RPC wrapper falsely rejects multi-line/indented text
 *  with a 42501 "only allows SELECT/WITH" error (confirmed, mechanism-verification script). */
async function q(sql_text) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql_text.replace(/\s+/g, ' ').trim() });
  if (error) throw new Error(`exec_sql failed: ${error.message || JSON.stringify(error)}`);
  return data?.[0]?.result ?? data;
}

const TARGET_ROLES = ['postgres', 'supabase_admin'];

/** AXIS-1: read pg_default_acl directly for both target roles, schema public, objtype='f'. */
async function fetchDefaclRows() {
  const rows = await q(`
    select r.rolname as creator_role, d.defaclacl::text as raw_acl
      from pg_default_acl d join pg_roles r on r.oid = d.defaclrole
      left join pg_namespace n on n.oid = d.defaclnamespace
     where d.defaclobjtype = 'f' and n.nspname = 'public' and r.rolname = ANY(ARRAY['postgres','supabase_admin'])
  `);
  return rows;
}

/** AXIS-1 assertion logic, PURE — testable via --self-test with no DB. raw_acl is the
 *  defaclacl::text value (e.g. "{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}"
 *  or null when no default-ACL row exists for that role/schema/objtype, which ALSO means no
 *  anon/authenticated default — Postgres's own built-in default already excludes them once any
 *  REVOKE has been recorded for that role, or the row may be entirely absent post-REVOKE-to-
 *  nothing in some Postgres versions; both null and an ACL string without anon/authenticated
 *  grantees are treated as PASS). */
export function axis1Compliant(rowsByRole) {
  const failures = [];
  for (const role of TARGET_ROLES) {
    const row = rowsByRole.find((r) => r.creator_role === role);
    const raw = row?.raw_acl ?? null;
    if (raw === null) continue; // no default-ACL row for this role/schema = nothing to inherit
    if (/\banon=/.test(raw)) failures.push(`${role}: pg_default_acl still names anon explicitly (${raw})`);
    if (/\bauthenticated=/.test(raw)) failures.push(`${role}: pg_default_acl still names authenticated explicitly (${raw})`);
  }
  return failures;
}

/** AXIS-2: re-run the completeness/compliance check against the (now-extended) manifest,
 *  reusing scripts/audit-rpc-execute-grants.mjs's exported pure functions directly. */
async function fetchManifest() {
  const manifestPath = path.join(REPO_ROOT, 'scripts', 'audit-rpc-execute-grants-buckets.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function axis2Check() {
  const manifest = await fetchManifest();
  const declared = new Map();
  for (const [bucket, { functions }] of Object.entries(manifest.buckets)) {
    for (const f of functions) declared.set(f.signature, bucket);
  }
  const declaredNames = [...new Set([...declared.keys()].map((sig) => sig.split('(')[0].replace('public.', '')))];
  const rows = await q(`
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as full_sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
           has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = ANY(ARRAY[${declaredNames.map((n) => `'${n}'`).join(',')}])
  `);
  const bySig = new Map(rows.map((r) => [r.full_sig, r]));
  const failures = [];
  for (const [sig, bucket] of declared) failures.push(...evaluateBucketCompliance(sig, bucket, bySig.get(sig)));

  const allExposedRows = await q(`
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as full_sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef = true
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))
  `);
  const undeclared = findUndeclaredExposures(allExposedRows.map((r) => r.full_sig), declared);
  if (undeclared.length > 0) failures.push(`COMPLETENESS: ${undeclared.length} undeclared exposed function(s): ${undeclared.join(', ')}`);
  return { failures, declaredCount: declared.size };
}

/** Scope-guard anchor: the separate, out-of-scope public_exec defect population. */
async function fetchPublicExecCount() {
  const rows = await q(`
    select count(*)::int as public_exec_count
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('public', p.oid, 'EXECUTE')
  `);
  return rows[0].public_exec_count;
}

/** Scope-guard assertion logic, PURE — testable via --self-test. */
export function scopeGuardUnchanged(baselineCount, verifyCount) {
  if (baselineCount === verifyCount) return null;
  return `SCOPE_CREEP: public_exec_count changed from ${baselineCount} to ${verifyCount} — this acceptance script must not claim to fix the separate PUBLIC-axis defect (see database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql:16-28); investigate before treating this as progress.`;
}

async function runBaseline() {
  const defaclRows = await fetchDefaclRows();
  const { failures: axis2Failures, declaredCount } = await axis2Check();
  const publicExecCount = await fetchPublicExecCount();
  const baseline = {
    captured_at: new Date(0).toISOString(), // placeholder; real timestamp stamped by caller post-run if needed
    defacl_rows: defaclRows,
    axis1_pre_apply_failures: axis1Compliant(defaclRows), // EXPECTED non-empty pre-apply (proves the probe can see the defect)
    axis2_pre_apply_failures: axis2Failures,
    manifest_declared_count: declaredCount,
    public_exec_count: publicExecCount,
  };
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log('\n--- BASELINE (pre-apply) ---');
  console.log(JSON.stringify(baseline, null, 2));
  console.log(`\nAXIS-1 baseline: ${baseline.axis1_pre_apply_failures.length > 0 ? 'shows exposure (expected pre-apply)' : 'WARNING — already clean; a clean baseline voids the verify run\'s meaning'}`);
  console.log(`Written: ${BASELINE_PATH}`);
}

async function runVerify() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`No baseline found at ${BASELINE_PATH} — run --baseline first. The baseline is not optional.`);
    process.exitCode = 2;
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const defaclRows = await fetchDefaclRows();
  const axis1Failures = axis1Compliant(defaclRows);
  const { failures: axis2Failures } = await axis2Check();
  const publicExecCount = await fetchPublicExecCount();
  const scopeGuardFailure = scopeGuardUnchanged(baseline.public_exec_count, publicExecCount);

  console.log('\n--- VERIFY (post-apply) ---');
  console.log(`AXIS-1 (default-ACL, future functions): ${axis1Failures.length === 0 ? 'PASS' : 'FAIL'}`);
  axis1Failures.forEach((f) => console.log(`  - ${f}`));
  console.log(`AXIS-2 (existing-surface completeness): ${axis2Failures.length === 0 ? 'PASS' : 'FAIL'}`);
  axis2Failures.forEach((f) => console.log(`  - ${f}`));
  console.log(`SCOPE GUARD (public_exec_count unchanged, baseline=${baseline.public_exec_count}, now=${publicExecCount}): ${scopeGuardFailure ? 'FAIL' : 'PASS'}`);
  if (scopeGuardFailure) console.log(`  - ${scopeGuardFailure}`);

  const anyFail = axis1Failures.length > 0 || axis2Failures.length > 0 || !!scopeGuardFailure;
  console.log(`\n=== VERIFY RESULT: ${anyFail ? 'FAIL' : 'PASS'} ===`);
  if (anyFail) process.exitCode = 1;
}

function runSelfTest() {
  console.log('\n--- SELF-TEST (fixture-only, zero DB dependency) ---');
  let ok = true;

  // AXIS-1 logic: pre-apply fixture (by-name grants present) must fail; post-apply fixture must pass.
  const preApplyFixture = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}' },
  ];
  const postApplyFixture = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,service_role=X/supabase_admin}' },
  ];
  const preFailures = axis1Compliant(preApplyFixture);
  const postFailures = axis1Compliant(postApplyFixture);
  // 2 roles x 2 grantees (anon, authenticated) each still named pre-apply = 4 expected failures.
  const axis1Ok = preFailures.length === 4 && postFailures.length === 0;
  console.log(`AXIS-1 fixture logic: ${axis1Ok ? 'PASS' : 'FAIL'} (pre-apply correctly flagged ${preFailures.length}/4, post-apply correctly clean: ${postFailures.length === 0})`);
  ok = ok && axis1Ok;

  // AXIS-2 logic: reuse evaluateBucketCompliance/findUndeclaredExposures directly against a
  // synthetic snapshot, including a mutation test (FR-5).
  const declared = new Map([['public.fn_keep_example()', 'C'], ['public.fn_revoke_example()', 'A']]);
  const compliantSnapshot = new Map([
    ['public.fn_keep_example()', { anon_exec: true, auth_exec: true, public_exec: false }],
    ['public.fn_revoke_example()', { anon_exec: false, auth_exec: false, public_exec: false }],
  ]);
  const compliantFailures = [...declared].flatMap(([sig, bucket]) => evaluateBucketCompliance(sig, bucket, compliantSnapshot.get(sig)));
  const compliantOk = compliantFailures.length === 0;
  console.log(`AXIS-2 compliant-fixture logic: ${compliantOk ? 'PASS' : 'FAIL'}`);
  ok = ok && compliantOk;

  // Mutation: fn_revoke_example (Bucket A) regains anon_exec — must be caught.
  const mutatedSnapshot = new Map(compliantSnapshot);
  mutatedSnapshot.set('public.fn_revoke_example()', { anon_exec: true, auth_exec: false, public_exec: false });
  const mutatedFailures = [...declared].flatMap(([sig, bucket]) => evaluateBucketCompliance(sig, bucket, mutatedSnapshot.get(sig)));
  const mutationCaught = mutatedFailures.length === 1 && mutatedFailures[0].includes('fn_revoke_example');
  console.log(`AXIS-2 mutation test (undeclared regression must be caught): ${mutationCaught ? 'PASS' : 'FAIL'}`);
  ok = ok && mutationCaught;

  // Completeness gate: an exposed signature absent from `declared` must be reported.
  const exposed = ['public.fn_keep_example()', 'public.fn_undeclared_example()'];
  const undeclaredFound = findUndeclaredExposures(exposed, declared);
  const completenessOk = undeclaredFound.length === 1 && undeclaredFound[0] === 'public.fn_undeclared_example()';
  console.log(`AXIS-2 completeness-gate fixture logic: ${completenessOk ? 'PASS' : 'FAIL'}`);
  ok = ok && completenessOk;

  // Scope guard: unchanged count passes, changed count fails.
  const guardPass = scopeGuardUnchanged(636, 636) === null;
  const guardFail = scopeGuardUnchanged(636, 620) !== null;
  const guardOk = guardPass && guardFail;
  console.log(`SCOPE GUARD fixture logic: ${guardOk ? 'PASS' : 'FAIL'}`);
  ok = ok && guardOk;

  console.log(`\n=== SELF-TEST RESULT: ${ok ? 'PASS' : 'FAIL'} ===`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  try {
    if (MODE === 'baseline') await runBaseline();
    else if (MODE === 'verify') await runVerify();
    else runSelfTest();
  } catch (e) {
    console.error('ACCEPTANCE SCRIPT ERROR:', e.message);
    process.exitCode = 1;
  }
})();
