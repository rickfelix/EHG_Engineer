/**
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001 — PLAN evidence.
 * Resolve the DB half of the chairman-privilege surface by MEASUREMENT.
 * Read-only: SELECT against pg catalogs only.
 *
 * Measures the CLIENT-WRITABLE half by BOTH spellings, because the prior
 * zero was a substring false negative: 'user_metadata' is NOT a substring
 * of 'raw_user_meta_data' (underscore between meta and data).
 */
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const CONN = process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL;
  if (!CONN) { console.log('NO_CONN: neither DATABASE_URL nor SUPABASE_POOLER_URL set'); process.exit(2); }
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const out = (t) => console.log('\n===== ' + t + ' =====');

  // 1. fn_is_chairman — every overload, with body and security mode
  out('1. fn_is_chairman overloads (pg_proc)');
  const fn = await client.query(`
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_is_chairman'
    ORDER BY n.nspname, args;`);
  console.log('overload count =', fn.rowCount);
  fn.rows.forEach(r => {
    console.log(`-- ${r.nspname}.${r.proname}(${r.args})  SECURITY ${r.security_definer ? 'DEFINER' : 'INVOKER'}`);
    console.log(r.def);
  });

  // 2. Population + both spellings, on one total (measure the population)
  out('2. Policy population by metadata idiom');
  const pop = await client.query(`
    SELECT
      count(*) AS total_policies,
      count(*) FILTER (WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%raw_user_meta_data%') AS raw_user_meta_data,
      count(*) FILTER (WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%user_metadata%')      AS user_metadata_literal,
      count(*) FILTER (WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%raw_app_meta_data%')  AS raw_app_meta_data,
      count(*) FILTER (WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%app_metadata%')       AS app_metadata_literal
    FROM pg_policies;`);
  console.log(JSON.stringify(pop.rows[0], null, 1));

  // 3. Every policy touching the CLIENT-WRITABLE half — the actual defect set
  out('3. Policies referencing the CLIENT-WRITABLE half (raw_user_meta_data OR user_metadata)');
  const bad = await client.query(`
    SELECT schemaname, tablename, policyname, roles::text AS roles, cmd,
           COALESCE(qual,'(none)') AS using_qual,
           COALESCE(with_check,'(none)') AS with_check
    FROM pg_policies
    WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%raw_user_meta_data%'
       OR COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%user_metadata%'
    ORDER BY schemaname, tablename, policyname;`);
  console.log('MATCHING POLICY COUNT =', bad.rowCount);
  bad.rows.forEach(r => console.log(JSON.stringify(r, null, 1)));

  // 4. The two named-as-unresolved tables — ABSENT is the predicted result
  out('4. agent_configs / prompt_templates — do the tables and any policies exist?');
  const named = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
           (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname='public') AS policy_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('agent_configs','prompt_templates');`);
  console.log('rows =', named.rowCount);
  named.rows.forEach(r => console.log(JSON.stringify(r)));
  const namedPol = await client.query(`
    SELECT tablename, policyname, cmd, COALESCE(qual,'(none)') AS using_qual
    FROM pg_policies WHERE schemaname='public' AND tablename IN ('agent_configs','prompt_templates');`);
  console.log('their policy count =', namedPol.rowCount);
  namedPol.rows.forEach(r => console.log(JSON.stringify(r)));

  // 5. Any OTHER function whose body reads the client-writable half
  out('5. Other functions reading raw_user_meta_data');
  const fns = await client.query(`
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND pg_get_functiondef(p.oid) ILIKE '%raw_user_meta_data%'
    ORDER BY n.nspname, p.proname;`);
  console.log('count =', fns.rowCount);
  fns.rows.forEach(r => console.log(`${r.nspname}.${r.proname}(${r.args}) SECURITY ${r.security_definer?'DEFINER':'INVOKER'}`));

  await client.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
