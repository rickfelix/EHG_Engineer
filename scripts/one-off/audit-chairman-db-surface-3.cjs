/**
 * SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001 — PLAN evidence, part 3.
 * THE LOCKOUT QUESTION: fn_is_chairman() currently reads raw_user_meta_data.
 * If we flip it to raw_app_meta_data, does the LEGITIMATE chairman survive?
 * Aggregate counts only — no emails/PII dumped beyond role values.
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

  out('A. auth.users population by which half carries a role');
  const pop = await client.query(`
    SELECT
      count(*)                                                                   AS total_users,
      count(*) FILTER (WHERE raw_user_meta_data ? 'role')                        AS has_user_meta_role,
      count(*) FILTER (WHERE raw_app_meta_data  ? 'role')                        AS has_app_meta_role,
      count(*) FILTER (WHERE raw_user_meta_data->>'role' IN ('chairman','admin','owner')) AS privileged_via_user_meta,
      count(*) FILTER (WHERE raw_app_meta_data ->>'role' IN ('chairman','admin','owner')) AS privileged_via_app_meta,
      count(*) FILTER (WHERE raw_user_meta_data->'roles' @> '"chairman"'::jsonb) AS chairman_via_user_meta_roles_array
    FROM auth.users;`);
  console.log(JSON.stringify(pop.rows[0], null, 1));

  out('B. THE FIX-SAFETY SET — who is chairman TODAY and would they survive the flip?');
  const who = await client.query(`
    SELECT
      left(u.id::text, 8) || '…'                       AS user_prefix,
      split_part(u.email, '@', 2)                      AS email_domain,
      u.raw_user_meta_data->>'role'                    AS user_meta_role,
      u.raw_app_meta_data ->>'role'                    AS app_meta_role,
      (u.raw_app_meta_data->>'role' IN ('chairman','admin','owner')) AS survives_flip,
      u.email_confirmed_at IS NOT NULL                 AS email_confirmed,
      u.last_sign_in_at
    FROM auth.users u
    WHERE u.raw_user_meta_data->>'role' IN ('chairman','admin','owner')
       OR u.raw_app_meta_data ->>'role' IN ('chairman','admin','owner')
       OR u.raw_user_meta_data->'roles' @> '"chairman"'::jsonb
    ORDER BY u.last_sign_in_at NULLS LAST;`);
  console.log('privileged account count =', who.rowCount);
  who.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  out('C. Total auth.users + how many are merely authenticated (the attacker pool)');
  const pool = await client.query(`
    SELECT count(*) AS total, count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed
    FROM auth.users;`);
  console.log(JSON.stringify(pool.rows[0]));

  out('D. The SAFE sibling already in the DB: public.is_chairman_role');
  const def = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_chairman_role' AND p.prokind='f';`);
  def.rows.forEach(r => console.log(r.def));

  out('E. Who consumes is_chairman_role (is the safe one actually wired?)');
  const c1 = await client.query(`
    SELECT count(*) AS policy_consumers FROM pg_policies
    WHERE COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%is_chairman_role%';`);
  console.log(JSON.stringify(c1.rows[0]));

  await client.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
