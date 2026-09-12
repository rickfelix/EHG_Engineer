import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const d = await c.query(`SELECT pg_get_userbyid(defaclrole) role, n.nspname schema, defaclobjtype objtype, defaclacl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE defaclobjtype='f'`);
  console.log('=== ALTER DEFAULT PRIVILEGES for FUNCTIONS ===');
  console.log(d.rows.length ? JSON.stringify(d.rows,null,1) : '(none -- new functions get the PG default: EXECUTE to PUBLIC)');
  // sanity: how many public non-trigger functions exist at all, and how many are anon-callable?
  const a = await c.query(`SELECT count(*) total,
      count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')) anon_callable,
      count(*) FILTER (WHERE p.proacl IS NULL) default_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype <> 'trigger'::regtype`);
  console.table(a.rows);
} finally { await c.end(); }
