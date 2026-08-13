// Acceptance script for 20260812_venture_operating_burn_tenant_predicate.sql
// SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001 FR-2.
//
// SCOPE, stated plainly (prospective TESTING finding T-3, evidence row
// 651bb0f4-960e-4ff5-be5b-19b523c5aed4): this is CATALOG + STAGED-SOURCE-TEXT verification only.
// It is NOT a live row-level allow/deny behavioural probe. public.venture_operating_burn holds 0
// rows at authoring time -- any such probe would pass identically under the leaking policy or the
// fixed one, which is worse than no test at all because it would look like evidence. Do not
// extend this script into a row-level probe without first seeding real rows and re-deriving a
// genuine baseline/verify discriminator (see the 20260803_bound_anon_ingress_source_type_qualifier
// _acceptance.mjs precedent for what that class of test looks like once there is real data).
//
// Two checks, both pre-apply-safe (read-only against the catalog; static against the file):
//   1. BASELINE — read the LIVE policy via the pooler (never REST; PostgREST cannot see
//      pg_policies). Prints the current, still-unfixed predicate.
//   2. STAGED-TEXT LINT — binds directly to the lint module's exported lintSql(), NOT the lint
//      CLI. The CLI's --diff and --all modes both scan only database/migrations/ and are blind to
//      database/chairman-gated/ (verified empirically during PLAN-phase TESTING: --diff scanned 0
//      files here; --all still flagged the untouched historical migration instead). Binding to
//      lintSql() directly sidesteps that blind spot AND avoids a live-vs-staged string-equality
//      tautology (Postgres normalizes stored predicate text -- e.g. adds ::text casts -- so a byte
//      comparison between staged source and a post-apply catalog value would false-fail).
//
// Usage: node <this file>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { lintSql } from '../../scripts/lint/rls-anon-tenant-predicate-lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STAGED_FILE = join(HERE, '20260812_venture_operating_burn_tenant_predicate.sql');
const POLICY_NAME = 'venture_operating_burn_auth_read';
const TABLE = 'venture_operating_burn';

let exitCode = 0;

console.log('=== 1. BASELINE — live catalog state via the pooler ===');
const client = await createDatabaseClient('engineer', { verify: false });
try {
  const { rows } = await client.query(
    `SELECT policyname, permissive, roles, cmd, qual
       FROM pg_policies WHERE tablename = $1 AND policyname = $2`,
    [TABLE, POLICY_NAME]
  );
  if (rows.length === 0) {
    console.log(`  ⚠ Policy ${POLICY_NAME} not found on ${TABLE} — cannot read a baseline.`);
    exitCode = 1;
  } else {
    const p = rows[0];
    console.log(`  policy=${p.policyname} permissive=${p.permissive} roles=${p.roles} cmd=${p.cmd}`);
    console.log(`  live qual: ${p.qual}`);
    if (p.qual === 'true') {
      console.log('  → Matches the known pre-fix state (USING (true)). Expected before apply.');
    } else if (String(p.qual).includes('fn_user_has_venture_access')) {
      console.log('  → Already carries the fixed predicate — the migration has apparently already been applied.');
    } else {
      console.log('  → Unexpected qual — neither the known pre-fix state nor the intended fix. Investigate before proceeding.');
      exitCode = 1;
    }
  }
} finally {
  await client.end();
}

console.log('\n=== 2. STAGED-TEXT LINT — lintSql() bound directly, not the CLI ===');
const stagedSql = readFileSync(STAGED_FILE, 'utf8');
const violations = lintSql(stagedSql, STAGED_FILE);
if (violations.length === 0) {
  console.log('  ✅ lintSql() found zero violations in the staged file — no unconditional_anon_select / unbound_tenant_predicate.');
} else {
  console.log(`  ❌ lintSql() flagged ${violations.length} violation(s) in the staged file:`);
  for (const v of violations) {
    console.log(`     [${v.violationClass}] ${v.policyName} on ${v.table}: ${v.message}`);
  }
  exitCode = 1;
}

console.log(`\n=== ${exitCode === 0 ? 'PASS' : 'FAIL'} ===`);
process.exitCode = exitCode;
