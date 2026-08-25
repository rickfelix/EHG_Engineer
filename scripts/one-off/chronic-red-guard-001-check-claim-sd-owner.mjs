#!/usr/bin/env node
/**
 * SEC-3 follow-up check: claim_sd is SECURITY DEFINER. If its owner role bypasses RLS
 * (superuser or rolbypassrls), then the UPDATE it performs on strategic_directives_v2 --
 * and the claim_eligibility_observe trigger that fires from it -- runs under a role RLS
 * cannot restrict, regardless of RLS-enable on claim_rejects. Verified live, not assumed.
 */
import 'dotenv/config';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });
  const { rows } = await client.query(`
    SELECT p.proname,
           r.rolname AS owner_role,
           r.rolsuper AS owner_is_superuser,
           r.rolbypassrls AS owner_bypasses_rls,
           p.prosecdef AS is_security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' AND p.proname IN ('claim_sd', 'claim_eligibility_observe')
  `);
  console.log(JSON.stringify(rows, null, 2));

  const { rows: roleRows } = await client.query(`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname IN ('service_role', 'authenticated', 'anon', 'postgres')
  `);
  console.log(JSON.stringify(roleRows, null, 2));

  const { rows: rlsRows } = await client.query(`
    SELECT c.relname, c.relrowsecurity,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('scope_completion_chain', 'claim_rejects')
  `);
  console.log(JSON.stringify(rlsRows, null, 2));

  await client.end();
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
