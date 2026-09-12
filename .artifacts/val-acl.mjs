import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  // Does a public plpgsql function created WITHOUT an explicit REVOKE end up anon-callable?
  // Measure on existing comparable functions rather than assuming.
  const q = await c.query(`
    SELECT p.proname, p.prosecdef, p.proacl IS NULL AS acl_is_default,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.proacl IS NULL
      AND p.prorettype <> 'trigger'::regtype
    ORDER BY p.proname LIMIT 8`);
  console.log('=== existing public functions with DEFAULT acl (no REVOKE) ===');
  console.table(q.rows);
  const agg = await c.query(`
    SELECT count(*) total,
           count(*) FILTER (WHERE has_function_privilege('anon', p.oid,'EXECUTE')) anon_callable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.proacl IS NULL AND p.prorettype <> 'trigger'::regtype`);
  console.log('=== aggregate: default-ACL public non-trigger functions ===');
  console.table(agg.rows);
} finally { await c.end(); }
