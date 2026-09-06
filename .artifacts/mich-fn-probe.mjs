import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`SELECT p.proname, pg_get_functiondef(p.oid) def, p.prosecdef, array_to_string(p.proacl,' | ') acl
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('update_updated_at_column','update_updated_at','set_updated_at')`);
r.rows.forEach(x=>{console.log('---',x.proname,'secdef=',x.prosecdef,'acl=',x.acl);console.log(x.def);});
// how many tables use it
const t = await c.query(`SELECT tgname, c.relname FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_proc p ON p.oid=tg.tgfoid WHERE p.proname='update_updated_at_column' AND NOT tg.tgisinternal LIMIT 8`);
console.log('=== sample triggers on update_updated_at_column:', t.rowCount); console.log(t.rows.slice(0,8));
await c.end();
