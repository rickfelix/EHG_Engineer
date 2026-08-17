// Behavioural acceptance for
// database/chairman-gated/20260816_defacl_anon_auth_axis.sql
// (SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001, FR-4).
//
// ── REWORK (QF-20260817-193, re-staged for ceremony N+2) ──────────────────────────────────────
// Ceremony N+1 measured the paired UP/DOWN files' original `FOR ROLE supabase_admin` clause
// unapplyable (permission denied — supabase_admin is Supabase-platform-reserved, no customer
// credential is a member of it; see the UP file's own REWORK section). Both files now touch
// postgres only. This script's TARGET_ROLES narrowed to match, but still queries and asserts on
// supabase_admin's row explicitly (see fetchDefaclRows() and supabaseAdminAclUnchanged() below) —
// as an expected-UNCHANGED case, not a dropped one — so the guard cannot go blind to it.
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
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { evaluateBucketCompliance, findUndeclaredExposures } from '../../scripts/audit-rpc-execute-grants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(REPO_ROOT, '.artifacts', 'defacl-anon-auth-axis-baseline.json');

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : process.argv.includes('--self-test') ? 'self-test'
           : process.argv.includes('--hash') ? 'hash'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify | --self-test | --hash   (the baseline is not optional for --verify)');
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

// REWORK (QF-20260817-193): postgres only. The paired UP migration no longer touches
// supabase_admin's default-ACL (unapplyable from any credential this house's ceremony process
// can hold — see the UP file's own REWORK section). TARGET_ROLES now drives axis1Compliant's
// pass/fail scope for ONLY the role this migration actually changes.
const TARGET_ROLES = ['postgres'];

/** AXIS-1: read pg_default_acl for BOTH postgres and supabase_admin, schema public, objtype='f'
 *  — deliberately still both, even though TARGET_ROLES narrowed to postgres-only above. This
 *  script must not go blind to supabase_admin just because this migration no longer touches it:
 *  fetchDefaclRows() stays two-role so supabaseAdminAclUnchanged() below has real baseline/verify
 *  data to compare, catching a future regression (e.g. someone silently re-adding the unapplyable
 *  FOR ROLE supabase_admin clause and it somehow applying) that a postgres-only query could not
 *  see at all. */
async function fetchDefaclRows() {
  const rows = await q(`
    select r.rolname as creator_role, d.defaclacl::text as raw_acl
      from pg_default_acl d join pg_roles r on r.oid = d.defaclrole
      left join pg_namespace n on n.oid = d.defaclnamespace
     where d.defaclobjtype = 'f' and n.nspname = 'public' and r.rolname = ANY(ARRAY['postgres','supabase_admin'])
  `);
  return rows;
}

/** TS-4 (FR-3): a stable, order-independent fingerprint of the defacl state this migration
 *  touches. Run before UP, after UP, and after DOWN — before-UP and after-DOWN must match
 *  exactly; before-UP and after-UP (no DOWN) must differ. PURE — takes rows, no DB. */
export function defaclHash(rowsByRole) {
  const sorted = [...rowsByRole]
    .map((r) => `${r.creator_role}=${r.raw_acl ?? 'NULL'}`)
    .sort()
    .join('|');
  return createHash('sha256').update(sorted).digest('hex');
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

/** REWORK (QF-20260817-193): explicit expected-UNCHANGED check for supabase_admin, PURE —
 *  testable via --self-test. This migration deliberately does not touch supabase_admin's
 *  default-ACL, so its raw_acl at verify time must be byte-identical to baseline — not merely
 *  "not asserted on" (which is what dropping it from TARGET_ROLES alone would silently produce).
 *  A future edit that reintroduces `FOR ROLE supabase_admin` and somehow gets applied (e.g. a
 *  ceremony running under a different, more-privileged identity) would change this value and be
 *  caught here, even though TARGET_ROLES no longer drives a pass/fail check on it directly. */
export function supabaseAdminAclUnchanged(baselineRows, verifyRows) {
  const before = baselineRows.find((r) => r.creator_role === 'supabase_admin')?.raw_acl ?? null;
  const after = verifyRows.find((r) => r.creator_role === 'supabase_admin')?.raw_acl ?? null;
  if (before === after) return null;
  return `SCOPE_CREEP: supabase_admin's pg_default_acl changed from ${JSON.stringify(before)} to ${JSON.stringify(after)} — this migration does not touch supabase_admin (unapplyable from any credential this ceremony process can hold); investigate before treating this as progress or an unrelated coincidence.`;
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

/** --hash: prints the current defaclHash. Run this three times around a real (or fixture-driven
 *  local) apply/rollback cycle: before UP, after UP, after DOWN. before-UP must equal after-DOWN;
 *  before-UP must differ from after-UP. This is what actually PROVES the DOWN file is an exact
 *  inverse rather than merely plausible-looking — the exact class of bug (DOWN re-granting PUBLIC
 *  when the true baseline never had it) that SECURITY sub-agent review caught by manual read,
 *  which this mode exists to catch mechanically on any future edit. */
async function runHash() {
  const defaclRows = await fetchDefaclRows();
  const hash = defaclHash(defaclRows);
  console.log('\n--- HASH (run before UP, after UP, and after DOWN; compare the three) ---');
  console.log(JSON.stringify({ hash, defacl_rows: defaclRows }, null, 2));
}

async function runBaseline() {
  const defaclRows = await fetchDefaclRows();
  const { failures: axis2Failures, declaredCount } = await axis2Check();
  const publicExecCount = await fetchPublicExecCount();
  const baseline = {
    captured_at: new Date().toISOString(),
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
  const supabaseAdminFailure = supabaseAdminAclUnchanged(baseline.defacl_rows, defaclRows);

  console.log('\n--- VERIFY (post-apply) ---');
  console.log(`AXIS-1 (default-ACL, future functions, postgres only): ${axis1Failures.length === 0 ? 'PASS' : 'FAIL'}`);
  axis1Failures.forEach((f) => console.log(`  - ${f}`));
  console.log(`AXIS-2 (existing-surface completeness): ${axis2Failures.length === 0 ? 'PASS' : 'FAIL'}`);
  axis2Failures.forEach((f) => console.log(`  - ${f}`));
  console.log(`SCOPE GUARD (public_exec_count unchanged, baseline=${baseline.public_exec_count}, now=${publicExecCount}): ${scopeGuardFailure ? 'FAIL' : 'PASS'}`);
  if (scopeGuardFailure) console.log(`  - ${scopeGuardFailure}`);
  console.log(`SUPABASE_ADMIN UNCHANGED (out-of-scope role, must not drift): ${supabaseAdminFailure ? 'FAIL' : 'PASS'}`);
  if (supabaseAdminFailure) console.log(`  - ${supabaseAdminFailure}`);

  const anyFail = axis1Failures.length > 0 || axis2Failures.length > 0 || !!scopeGuardFailure || !!supabaseAdminFailure;
  console.log(`\n=== VERIFY RESULT: ${anyFail ? 'FAIL' : 'PASS'} ===`);
  if (anyFail) process.exitCode = 1;
}

function runSelfTest() {
  console.log('\n--- SELF-TEST (fixture-only, zero DB dependency) ---');
  let ok = true;

  // AXIS-1 logic: pre-apply fixture (by-name grants present) must fail for postgres; post-apply
  // fixture must pass. supabase_admin's row is DELIBERATELY still present in both fixtures (QF-
  // 20260817-193: "keep supabase_admin rows in fixtures ONLY as explicit expected-UNCHANGED
  // cases") -- it must NOT contribute to axis1Compliant's failure count either way now that
  // TARGET_ROLES is postgres-only, proving the narrowing actually took effect rather than being
  // silently ignored by a stale ARRAY reference elsewhere.
  const preApplyFixture = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}' },
  ];
  const postApplyFixture = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}' },
  ];
  const preFailures = axis1Compliant(preApplyFixture);
  const postFailures = axis1Compliant(postApplyFixture);
  // TARGET_ROLES=['postgres'] only: 1 role x 2 grantees (anon, authenticated) still named
  // pre-apply = 2 expected failures. supabase_admin's row is present in both fixtures but
  // contributes 0 either way -- it is asserted separately by supabaseAdminAclUnchanged below.
  const axis1Ok = preFailures.length === 2 && postFailures.length === 0;
  console.log(`AXIS-1 fixture logic: ${axis1Ok ? 'PASS' : 'FAIL'} (pre-apply correctly flagged ${preFailures.length}/2 for postgres, supabase_admin correctly not scored, post-apply correctly clean: ${postFailures.length === 0})`);
  ok = ok && axis1Ok;

  // REWORK (QF-20260817-193): supabase_admin's row must be asserted UNCHANGED, not merely
  // unscored. postApplyFixture above keeps supabase_admin identical to preApplyFixture (this
  // migration never touches it) -- that must PASS. A fixture where it drifted must FAIL.
  const supabaseAdminUnchangedOk = supabaseAdminAclUnchanged(preApplyFixture, postApplyFixture) === null;
  const supabaseAdminDriftedFixture = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,service_role=X/supabase_admin}' }, // anon/authenticated dropped -- should never happen, must be caught
  ];
  const supabaseAdminDriftCaught = supabaseAdminAclUnchanged(preApplyFixture, supabaseAdminDriftedFixture) !== null;
  const supabaseAdminOk = supabaseAdminUnchangedOk && supabaseAdminDriftCaught;
  console.log(`SUPABASE_ADMIN unchanged-assertion fixture logic: ${supabaseAdminOk ? 'PASS' : 'FAIL'} (unchanged correctly passes: ${supabaseAdminUnchangedOk}, drift correctly caught: ${supabaseAdminDriftCaught})`);
  ok = ok && supabaseAdminOk;

  // TS-4 (FR-3): hash must differ pre-UP vs post-UP, and match pre-UP vs post-DOWN (the correctly
  // corrected DOWN fixture, i.e. GRANT anon/authenticated only, no PUBLIC).
  const postDownFixtureCorrected = [
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}' },
  ];
  const postDownFixtureWrong = [ // simulates the bug the SECURITY review caught: DOWN re-grants PUBLIC too
    { creator_role: 'postgres', raw_acl: '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,=X/postgres}' },
    { creator_role: 'supabase_admin', raw_acl: '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,=X/supabase_admin}' },
  ];
  const preHash = defaclHash(preApplyFixture);
  const postUpHash = defaclHash(postApplyFixture);
  const postDownCorrectHash = defaclHash(postDownFixtureCorrected);
  const postDownWrongHash = defaclHash(postDownFixtureWrong);
  const hashOk = preHash !== postUpHash && preHash === postDownCorrectHash && preHash !== postDownWrongHash;
  console.log(`TS-4 hash round-trip fixture logic: ${hashOk ? 'PASS' : 'FAIL'} (pre!=postUP: ${preHash !== postUpHash}, pre==postDOWN-correct: ${preHash === postDownCorrectHash}, pre!=postDOWN-wrong: ${preHash !== postDownWrongHash})`);
  ok = ok && hashOk;

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
    else if (MODE === 'hash') await runHash();
    else runSelfTest();
  } catch (e) {
    console.error('ACCEPTANCE SCRIPT ERROR:', e.message);
    process.exitCode = 1;
  }
})();
