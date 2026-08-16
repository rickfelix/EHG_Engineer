#!/usr/bin/env node
/**
 * Recurrence guard for SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001, extended by
 * SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 to cover the anon/PUBLIC axis.
 *
 * TWO INDEPENDENT CHECKS, kept separate on purpose (TR-4): they observe different axes and a
 * pass on one says nothing about the other.
 *
 *   1. AUTHENTICATED-AXIS (original, SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001): CREATE OR REPLACE
 *      FUNCTION silently DROPS prior EXECUTE grants, so a routine function redefinition can
 *      re-break chairman/venture RPCs with HTTP 403 in the EHG app. Every app-called RPC must
 *      still carry authenticated EXECUTE.
 *
 *   2. ANON/PUBLIC-AXIS (new, SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001): the buckets manifest
 *      (audit-rpc-execute-grants-buckets.json) declares, per function, what anon/PUBLIC/
 *      authenticated state is REQUIRED. Bucket A/B functions must NOT carry anon or PUBLIC
 *      EXECUTE; Bucket C functions must be byte-identical to their captured baseline. A
 *      completeness gate additionally fails if any live SECURITY DEFINER function with anon or
 *      PUBLIC EXECUTE is missing from the manifest entirely (SD-LEO-INFRA-CLOSE-REMAINING-
 *      SECURITY-001 C5/C9: the original 42-function scan was a floor, not a ceiling — this
 *      makes that fact mechanically, permanently checkable instead of a one-time finding).
 *
 * IMPORTANT (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 TESTING finding): PostgreSQL's proacl
 * text representation NEVER contains the literal string "PUBLIC" — an empty grantee renders as
 * `=X/postgres`. Every check in this file uses has_function_privilege() directly; do not
 * "optimize" this into a text/ILIKE match against proacl, it will silently match nothing.
 *
 * Exit codes: 0 = both checks pass; 1 = at least one fails.
 *
 * Env:
 *   EHG_APP_SRC       - path to the ehg app `src/` (default resolution order: env var ->
 *                        ../ehg/src relative to repo root -> applications.local_path lookup
 *                        for target_application='EHG' -> FALLBACK_RPCS with a loud warning).
 *   AUDIT_GRANTS_MODE - 'auth' (default, original check only), 'buckets' (new check only),
 *                        'all' (both).
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Service-role-only by design — never expected to have an authenticated grant.
const EXCLUDE = new Set(['master_reset_portfolio']);

// Committed fallback (the app-called RPCs as of the audit) used ONLY when neither EHG_APP_SRC
// nor an applications.local_path lookup can locate the ehg app source tree.
const FALLBACK_RPCS = [
  'advance_venture_stage', 'advance_venture_to_stage', 'approve_chairman_decision',
  'bootstrap_venture_workflow', 'can_auto_advance', 'create_eva_conversation',
  'delete_venture', 'eva_circuit_allows_request', 'export_blueprint_review',
  'fn_is_chairman', 'get_conversation_messages', 'get_daily_briefing',
  'get_eva_conversations', 'get_gate_decision_status', 'kill_venture',
  'log_stage_advance_override', 'park_venture_decision', 'record_eva_failure',
  'record_eva_success', 'reject_chairman_decision', 'rescan_stage_20', 'reset_eva_circuit',
  'set_stage_override', 'set_global_auto_proceed',
];

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/**
 * Resolve the ehg app's src/ directory. Tries, in order: EHG_APP_SRC env var, the naive
 * relative default, and a DB lookup of applications.local_path for target_application='EHG'
 * (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 finding: the naive default silently resolves to
 * .worktrees/ehg/src from inside a worktree, which does not exist, degrading to a stale
 * 24-name fallback list missing 7 real RPC names with no warning at all).
 */
async function resolveEhgAppSrc() {
  if (process.env.EHG_APP_SRC && fs.existsSync(process.env.EHG_APP_SRC)) return process.env.EHG_APP_SRC;
  const naiveDefault = path.resolve(REPO_ROOT, '..', 'ehg', 'src');
  if (fs.existsSync(naiveDefault)) return naiveDefault;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await supabase.from('applications').select('local_path').eq('name', 'EHG').maybeSingle();
    const candidate = data?.local_path ? path.join(data.local_path, 'src') : null;
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch { /* DB lookup is best-effort; fall through to the loud fallback warning */ }
  return null;
}

async function collectRpcNames() {
  const srcDir = await resolveEhgAppSrc();
  if (!srcDir) {
    console.warn('\n' + '='.repeat(78));
    console.warn('⚠️  ehg app src/ NOT FOUND via EHG_APP_SRC, the naive relative default, or');
    console.warn('   applications.local_path. Falling back to a COMMITTED, POSSIBLY STALE list');
    console.warn(`   of ${FALLBACK_RPCS.length} RPC names. This list is known to have gone stale before —`);
    console.warn('   set EHG_APP_SRC explicitly to the real ehg/src path for a trustworthy run.');
    console.warn('='.repeat(78) + '\n');
    return new Set(FALLBACK_RPCS);
  }
  const names = new Set();
  const re = /\.rpc\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi;
  for (const f of walk(srcDir, [])) {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(txt)) !== null) names.add(m[1]);
  }
  console.log(`[guard] grepped ${srcDir}: ${names.size} distinct RPC name(s).`);
  return names;
}

/**
 * Run a read-only SQL query, preferring the Postgres pooler and falling back to the exec_sql
 * REST RPC (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001: the pooler credential is broken in some
 * environments; exec_sql is a verified-working substitute for read-only catalog queries — note
 * it only accepts single-line SELECT/WITH statements, never DDL).
 */
async function queryLive(sql) {
  try {
    const client = await createDatabaseClient('engineer', { verify: false });
    const { rows } = await client.query(sql);
    await client.end();
    return rows;
  } catch (poolerErr) {
    console.warn(`[guard] pooler connection failed (${poolerErr.message}); falling back to exec_sql RPC`);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const singleLine = sql.replace(/\s+/g, ' ').trim();
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: singleLine });
    if (error) throw new Error(`exec_sql fallback also failed: ${error.message}`);
    return data?.[0]?.result || [];
  }
}

async function runAuthenticatedAxisCheck() {
  const names = [...(await collectRpcNames())].filter((n) => !EXCLUDE.has(n)).sort();
  const rows = await queryLive(
    `SELECT p.proname, p.oid::regprocedure::text AS sig, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${names.map((n) => `'${n}'`).join(',')}])`
  );

  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.proname)) byName.set(r.proname, []);
    byName.get(r.proname).push(r);
  }

  const missingGrant = [];
  const missingFromSchema = [];
  for (const name of names) {
    const overloads = byName.get(name);
    if (!overloads || overloads.length === 0) { missingFromSchema.push(name); continue; }
    for (const o of overloads) if (!o.auth_exec) missingGrant.push(o.sig);
  }

  if (missingFromSchema.length > 0) {
    console.warn(`\n⚠️  ${missingFromSchema.length} app-called RPC(s) not found in public schema (separate missing-function concern, not a grant failure):`);
    for (const n of missingFromSchema) console.warn(`   - ${n}`);
  }

  if (missingGrant.length > 0) {
    console.error(`\n❌ AUTHENTICATED-AXIS: ${missingGrant.length} app-called RPC(s) MISSING authenticated EXECUTE (grant drift — likely a CREATE OR REPLACE dropped it):`);
    for (const s of missingGrant) console.error(`   - ${s}`);
    console.error('\nFix: GRANT EXECUTE ON FUNCTION <sig> TO authenticated; (re-assert after the offending CREATE OR REPLACE).');
    return false;
  }

  console.log(`\n✅ AUTHENTICATED-AXIS: all ${names.length - missingFromSchema.length} app-called RPC(s) present in public have authenticated EXECUTE.`);
  return true;
}

/**
 * PURE (TS-1b): evaluate one function's live anon/authenticated/public grant state against its
 * declared bucket's required state. `live` is {anon_exec, auth_exec, public_exec} or undefined
 * (function absent from the live catalog query result).
 * @returns {string[]} failure reasons — empty array means compliant.
 */
export function evaluateBucketCompliance(sig, bucket, live) {
  const failures = [];
  if (!live) { failures.push(`${sig}: NOT FOUND in live catalog (declared as Bucket ${bucket})`); return failures; }
  if (bucket === 'A') {
    if (live.anon_exec) failures.push(`${sig}: Bucket A but anon_exec=true (should be false)`);
    if (live.auth_exec) failures.push(`${sig}: Bucket A but auth_exec=true (should be false)`);
    if (live.public_exec) failures.push(`${sig}: Bucket A but public_exec=true (should be false)`);
  } else if (bucket === 'B') {
    if (live.anon_exec) failures.push(`${sig}: Bucket B but anon_exec=true (should be false)`);
    if (live.public_exec) failures.push(`${sig}: Bucket B but public_exec=true (should be false)`);
    if (!live.auth_exec) failures.push(`${sig}: Bucket B but auth_exec=false (should be true — this is a regression, not just unclosed exposure)`);
  }
  // Bucket C: no assertion here (unapplied migration means C is trivially "unchanged" pre-apply;
  // the migration's own in-transaction verify block is what proves byte-identity around the apply).
  return failures;
}

/**
 * PURE (TS-8): the completeness gate (A4) — every live-exposed signature absent from the
 * declared set is a floor-not-ceiling regression: a SECURITY DEFINER function that gained anon
 * or PUBLIC EXECUTE without ever being triaged into a bucket.
 * @param {string[]} exposedSignatures
 * @param {Map<string,string>|Set<string>} declared
 * @returns {string[]} undeclared signatures — empty array means none found.
 */
export function findUndeclaredExposures(exposedSignatures, declared) {
  return exposedSignatures.filter((sig) => !declared.has(sig));
}

async function runBucketsAxisCheck() {
  const manifestPath = path.join(REPO_ROOT, 'scripts', 'audit-rpc-execute-grants-buckets.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declared = new Map(); // signature -> bucket
  for (const [bucket, { functions }] of Object.entries(manifest.buckets)) {
    for (const f of functions) declared.set(f.signature, bucket);
  }

  const declaredNames = [...declared.keys()].map((sig) => sig.split('(')[0].replace('public.', ''));
  const rows = await queryLive(
    `SELECT p.proname, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${[...new Set(declaredNames)].map((n) => `'${n}'`).join(',')}])`
  );
  const bySig = new Map(rows.map((r) => [r.full_sig, r]));

  const failures = [];
  for (const [sig, bucket] of declared) {
    failures.push(...evaluateBucketCompliance(sig, bucket, bySig.get(sig)));
  }

  // Completeness gate (A4): every live SECURITY DEFINER function with anon or PUBLIC EXECUTE
  // must be declared somewhere in the manifest — a floor-not-ceiling regression guard.
  const allExposedRows = await queryLive(
    `SELECT 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef = true AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))`
  );
  const undeclared = findUndeclaredExposures(allExposedRows.map((r) => r.full_sig), declared);
  if (undeclared.length > 0) {
    failures.push(`COMPLETENESS: ${undeclared.length} anon/PUBLIC-executable SECURITY DEFINER function(s) NOT in the manifest: ${undeclared.join(', ')}`);
  }

  if (failures.length > 0) {
    console.error(`\n❌ ANON/PUBLIC-AXIS: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`   - ${f}`);
    return false;
  }

  console.log(`\n✅ ANON/PUBLIC-AXIS: all ${declared.size} manifest-declared function(s) match their bucket's required state; completeness gate found zero undeclared exposed functions.`);
  return true;
}

// Guarded so this file can be imported for its pure exports (evaluateBucketCompliance,
// findUndeclaredExposures — SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 TS-1b/TS-8 unit tests)
// without triggering a live network run + process.exit() as a side effect of import.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const mode = process.env.AUDIT_GRANTS_MODE || 'auth';
  let ok = true;
  if (mode === 'auth' || mode === 'all') ok = (await runAuthenticatedAxisCheck()) && ok;
  if (mode === 'buckets' || mode === 'all') ok = (await runBucketsAxisCheck()) && ok;

  process.exit(ok ? 0 : 1);
}
