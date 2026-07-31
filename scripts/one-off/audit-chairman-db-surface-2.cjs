/**
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001 — PLAN evidence, part 2.
 * Part 1 section 5 failed: pg_get_functiondef() errors on aggregates.
 * Filter to prokind='f' (normal functions) and 'p' (procedures).
 * Read-only.
 */
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const CONN = process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL;
  if (!CONN) { console.log('NO_CONN'); process.exit(2); }
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const out = (t) => console.log('\n===== ' + t + ' =====');

  out('5. Functions whose body reads the CLIENT-WRITABLE half (raw_user_meta_data)');
  const fns = await client.query(`
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind IN ('f','p')
      AND pg_get_functiondef(p.oid) ILIKE '%raw_user_meta_data%'
    ORDER BY n.nspname, p.proname;`);
  console.log('count =', fns.rowCount);
  fns.rows.forEach(r => console.log(`  ${r.nspname}.${r.proname}(${r.args}) SECURITY ${r.security_definer?'DEFINER':'INVOKER'}`));

  out('5b. CONTROL — functions reading the SAFE half (raw_app_meta_data)');
  const safe = await client.query(`
    SELECT n.nspname, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind IN ('f','p')
      AND pg_get_functiondef(p.oid) ILIKE '%raw_app_meta_data%'
    ORDER BY 1,2;`);
  console.log('count =', safe.rowCount);
  safe.rows.forEach(r => console.log(`  ${r.nspname}.${r.proname}`));

  out('6. CONSUMERS of fn_is_chairman — policies whose expression calls it');
  const pol = await client.query(`
    SELECT schemaname, tablename, policyname, roles::text AS roles, cmd
    FROM pg_policies
    WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%fn_is_chairman%'
    ORDER BY 1,2,3;`);
  console.log('policy consumers =', pol.rowCount);
  pol.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  const fnc = await client.query(`
    SELECT n.nspname, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind IN ('f','p') AND p.proname <> 'fn_is_chairman'
      AND pg_get_functiondef(p.oid) ILIKE '%fn_is_chairman%'
    ORDER BY 1,2;`);
  console.log('function consumers =', fnc.rowCount);
  fnc.rows.forEach(r => console.log(`  ${r.nspname}.${r.proname}`));

  out('7. archetype_benchmarks — is it actually exposed? grants + rowcount');
  const g = await client.query(`
    SELECT c.relrowsecurity AS rls_enabled,
           has_table_privilege('anon','public.archetype_benchmarks','SELECT') AS anon_select,
           has_table_privilege('anon','public.archetype_benchmarks','UPDATE') AS anon_update,
           has_table_privilege('authenticated','public.archetype_benchmarks','SELECT') AS auth_select,
           has_table_privilege('authenticated','public.archetype_benchmarks','UPDATE') AS auth_update,
           has_table_privilege('authenticated','public.archetype_benchmarks','DELETE') AS auth_delete
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='archetype_benchmarks';`);
  g.rows.forEach(r => console.log(JSON.stringify(r, null, 1)));
  const all = await client.query(`
    SELECT policyname, roles::text AS roles, cmd, COALESCE(qual,'(none)') AS using_qual
    FROM pg_policies WHERE schemaname='public' AND tablename='archetype_benchmarks' ORDER BY policyname;`);
  console.log('ALL policies on archetype_benchmarks =', all.rowCount);
  all.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  await client.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
