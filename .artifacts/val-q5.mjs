import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify:false });
// Find any existing function that RETURNS a current_setting value -- a readable probe for request.headers
const { rows } = await c.query(`
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_result(p.oid) ret
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%current_setting%'
    AND pg_get_function_identity_arguments(p.oid)=''
  ORDER BY 1 LIMIT 30`);
console.log('=== no-arg funcs using current_setting (PostgREST-callable probes) ===');
for (const r of rows) console.log(` ${r.proname}() -> ${r.ret}`);
// Does the transaction-mode pooler preserve a session-level SET? test on THIS client
await c.query('BEGIN'); await c.query(`SET LOCAL app.actor='txn-local-probe'`);
const a = await c.query(`SELECT current_setting('app.actor',true) v`); console.log('\nSET LOCAL inside txn:', a.rows[0].v);
await c.query('COMMIT');
const b = await c.query(`SELECT current_setting('app.actor',true) v`); console.log('after COMMIT (SET LOCAL gone?):', b.rows[0].v);
await c.end();
