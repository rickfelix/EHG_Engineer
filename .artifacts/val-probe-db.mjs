import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const s = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SQL = `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.prosecdef`;
const candidates = ['exec_sql','exec_raw_sql','exec_readonly_sql','execute_sql','query','sql'];
const params = [{query: SQL},{sql: SQL},{sql_query: SQL},{query_text: SQL},{statement: SQL},{p_sql: SQL}];
for (const fn of candidates) {
  for (const p of params) {
    try {
      const { data, error } = await s.rpc(fn, p);
      if (!error) { console.log(`✅ WORKS: rpc('${fn}', ${JSON.stringify(Object.keys(p))}) ->`, JSON.stringify(data).slice(0,300)); process.exit(0); }
      const m = error.message || '';
      if (!/Could not find the function|does not exist|schema cache/i.test(m)) console.log(`~ ${fn}(${Object.keys(p)}): ${m.slice(0,140)}`);
    } catch (e) { console.log(`x ${fn}: ${String(e.message).slice(0,100)}`); }
  }
}
console.log('--- no SQL-exec RPC wrapper reachable over PostgREST ---');
