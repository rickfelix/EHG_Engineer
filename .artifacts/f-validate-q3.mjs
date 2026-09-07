import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='quick_fixes' ORDER BY ordinal_position`);
console.log('quick_fixes columns (' + cols.rows.length + '):');
console.log(cols.rows.map(r=>`${r.column_name}:${r.data_type}`).join(', '));
console.log('\nHAS metadata? ', cols.rows.some(r=>r.column_name==='metadata'));
console.log('HAS claiming_session_id? ', cols.rows.some(r=>r.column_name==='claiming_session_id'));
const fn = await c.query(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='claim_sd'`);
console.log('\nclaim_sd overloads:', JSON.stringify(fn.rows));
const src = await c.query(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='claim_sd' LIMIT 1`);
if (src.rows[0]) {
  const d = src.rows[0].def;
  console.log('\n--- claim_sd def (QF-relevant excerpt) ---');
  const lines = d.split('\n');
  lines.forEach((l,i)=>{ if (/quick_fix|QF-|claiming_session|metadata/i.test(l)) console.log(String(i).padStart(4), l); });
  console.log('--- total def lines:', lines.length);
}
await c.end();
