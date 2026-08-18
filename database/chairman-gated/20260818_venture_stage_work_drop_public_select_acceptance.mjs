// Acceptance script for 20260818_venture_stage_work_drop_public_select.sql
// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (FR-4/TR-3).
//
// Two independent checks:
//   1. CATALOG — live pg_policy + information_schema.role_table_grants via the pooler (never
//      REST; PostgREST cannot see pg_policies). Structural proof.
//   2. BEHAVIORAL — a REAL anon-key Supabase client attempts a genuine SELECT against
//      venture_stage_work. venture_stage_work holds 546 rows at authoring time (unlike the
//      venture_operating_burn precedent's 0-row table), so this is NOT fixture-blind: baseline
//      MUST return real rows (proving the leak is real, not merely catalog-theoretical), and
//      verify MUST return zero rows / a denial. A catalog-only check proves the policy text
//      changed; this proves the actual external-facing API behavior changed.
//
// Usage:
//   node <this file> --baseline   (BEFORE apply — check 2 MUST show real rows, or the baseline
//                                   is not meaningful)
//   node <this file> --verify     (AFTER apply — check 2 MUST show zero rows / denial)
import { createClient } from '@supabase/supabase-js';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const mode = process.argv.includes('--verify') ? 'verify' : 'baseline';
const TABLE = 'venture_stage_work';
let exitCode = 0;

console.log(`=== Mode: ${mode.toUpperCase()} ===\n`);

console.log('=== 1. CATALOG — live policy + grant state via the pooler ===');
const client = await createDatabaseClient('engineer', { verify: false });
try {
  const { rows: policies } = await client.query(
    `SELECT p.polname, p.polcmd, p.polpermissive,
            pg_get_expr(p.polqual, p.polrelid, true) AS using_expr,
            (SELECT array_agg(r.rolname) FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = $1 AND c.relnamespace = 'public'::regnamespace
      ORDER BY p.polname`,
    [TABLE]
  );
  console.log('  Live policies:', JSON.stringify(policies, null, 2));

  const modifyPolicy = policies.find((p) => p.polname === 'venture_stage_work_modify');
  const selectPolicy = policies.find((p) => p.polname === 'venture_stage_work_select_policy');

  if (mode === 'baseline') {
    if (!modifyPolicy) {
      console.log('  ⚠ venture_stage_work_modify not found — the migration may have already been applied.');
    } else if (modifyPolicy.using_expr === 'true' && modifyPolicy.roles === null) {
      console.log('  → Matches the known pre-fix state (PUBLIC, USING(true)). Expected before apply.');
    } else {
      console.log('  → venture_stage_work_modify exists but does not match the expected pre-fix shape — investigate.');
      exitCode = 1;
    }
  } else {
    if (modifyPolicy) {
      console.log('  ❌ venture_stage_work_modify still exists after apply — the DROP did not take.');
      exitCode = 1;
    } else {
      console.log('  ✅ venture_stage_work_modify is gone.');
    }
  }
  if (!selectPolicy || !String(selectPolicy.using_expr).includes('fn_user_has_venture_access')) {
    console.log('  ❌ venture_stage_work_select_policy is missing or no longer references fn_user_has_venture_access — this fix must not touch it.');
    exitCode = 1;
  } else {
    console.log('  ✅ venture_stage_work_select_policy untouched, still references fn_user_has_venture_access.');
  }

  const { rows: grants } = await client.query(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name=$1 AND grantee='anon'`,
    [TABLE]
  );
  const grantSet = grants.map((g) => g.privilege_type);
  console.log('  anon table-level grants:', grantSet.length ? grantSet.join(', ') : '(none)');
  if (mode === 'verify') {
    const stillGranted = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].filter((p) => grantSet.includes(p));
    if (stillGranted.length > 0) {
      console.log(`  ❌ anon still holds: ${stillGranted.join(', ')}`);
      exitCode = 1;
    } else {
      console.log('  ✅ anon holds none of SELECT/INSERT/UPDATE/DELETE/TRUNCATE.');
    }
  }
} finally {
  await client.end();
}

console.log('\n=== 2. BEHAVIORAL — real anon-key client, real SELECT ===');
const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
const { data, error, status } = await anonClient.from(TABLE).select('id', { count: 'exact', head: false }).limit(5);
if (error) {
  console.log(`  Query error (status ${status}): ${error.message}`);
} else {
  console.log(`  Rows returned to an UNAUTHENTICATED anon-key client: ${data.length} (sample of up to 5)`);
}

if (mode === 'baseline') {
  if (!error && data.length > 0) {
    console.log('  → Confirmed: the leak is REAL, not catalog-theoretical — an anonymous caller can read real venture_stage_work rows today.');
  } else {
    console.log('  ⚠ Expected the anon client to return real rows pre-fix (546 rows exist) but it did not — baseline is not meaningful as constructed. Investigate before treating a later verify PASS as proof of anything.');
    exitCode = 1;
  }
} else {
  if (!error && data.length > 0) {
    console.log('  ❌ anon-key client STILL reads real rows after the fix — the leak is not closed.');
    exitCode = 1;
  } else {
    console.log('  ✅ anon-key client reads zero rows post-fix — the leak is closed for real, not just in the catalog.');
  }
}

console.log(`\n=== ${exitCode === 0 ? 'PASS' : 'FAIL'} (mode=${mode}) ===`);
process.exitCode = exitCode;
