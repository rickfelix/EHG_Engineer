#!/usr/bin/env node
/**
 * Recurrence guard for SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001.
 *
 * Root cause: CREATE OR REPLACE FUNCTION silently DROPS prior EXECUTE grants, so a
 * routine function redefinition can re-break chairman/venture RPCs with HTTP 403 in
 * the EHG app. This guard re-detects that drift.
 *
 * What it does:
 *   1. Collects the RPC names the EHG app calls (greps `<ehg>/src` for supabase.rpc('name')
 *      when the app source is available; otherwise uses the committed fallback list below).
 *   2. For each name that EXISTS in the public schema, asserts
 *      has_function_privilege('authenticated', <oid>, 'EXECUTE') for every overload.
 *   3. Names absent from the schema are reported as WARNINGS (a separate missing-function
 *      concern), not grant failures.
 *
 * Exit codes: 0 = all app-called existing RPCs have authenticated EXECUTE; 1 = at least
 * one is missing the grant (drift — re-assert grants after the offending CREATE OR REPLACE).
 *
 * Convention reminder: after any CREATE OR REPLACE FUNCTION on an app-called RPC,
 * re-assert `GRANT EXECUTE ON FUNCTION <sig> TO authenticated;` in the same migration.
 *
 * Env: EHG_APP_SRC (path to the ehg app `src/`, default ../ehg/src relative to repo root).
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Service-role-only by design — never expected to have an authenticated grant.
const EXCLUDE = new Set(['master_reset_portfolio']);

// Committed fallback (the app-called RPCs as of the audit) used when the ehg app
// source tree is not checked out (e.g. CI without the sibling repo).
const FALLBACK_RPCS = [
  'advance_venture_stage', 'advance_venture_to_stage', 'approve_chairman_decision',
  'bootstrap_venture_workflow', 'can_auto_advance', 'create_eva_conversation',
  'delete_venture', 'eva_circuit_allows_request', 'export_blueprint_review',
  'fn_is_chairman', 'get_conversation_messages', 'get_daily_briefing',
  'get_eva_conversations', 'get_gate_decision_status', 'kill_venture',
  'log_stage_advance_override', 'park_venture_decision', 'record_eva_failure',
  'record_eva_success', 'reject_chairman_decision', 'reset_eva_circuit',
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

function collectRpcNames() {
  const srcDir = process.env.EHG_APP_SRC || path.resolve(REPO_ROOT, '..', 'ehg', 'src');
  if (!fs.existsSync(srcDir)) {
    console.log(`[guard] ehg app src not found at ${srcDir} — using committed fallback list (${FALLBACK_RPCS.length}).`);
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

const names = [...collectRpcNames()].filter((n) => !EXCLUDE.has(n)).sort();
const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(
  `SELECT p.proname, p.oid::regprocedure::text AS sig,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY($1)`,
  [names]
);
await client.end();

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
  console.error(`\n❌ ${missingGrant.length} app-called RPC(s) MISSING authenticated EXECUTE (grant drift — likely a CREATE OR REPLACE dropped it):`);
  for (const s of missingGrant) console.error(`   - ${s}`);
  console.error('\nFix: GRANT EXECUTE ON FUNCTION <sig> TO authenticated; (re-assert after the offending CREATE OR REPLACE).');
  process.exit(1);
}

console.log(`\n✅ All ${names.length - missingFromSchema.length} app-called RPC(s) present in public have authenticated EXECUTE.`);
process.exit(0);
