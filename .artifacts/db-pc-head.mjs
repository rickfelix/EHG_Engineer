import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r1 = await c.query(`select column_name, data_type, is_nullable, column_default
 from information_schema.columns where table_schema='public' and table_name='plan_critiques' order by ordinal_position`);
console.log('COLUMNS:'); r1.rows.forEach(r=>console.log(` ${r.column_name} | ${r.data_type} | null=${r.is_nullable} | def=${r.column_default||'-'}`));
const r2 = await c.query(`select c.relrowsecurity rls_enabled, c.relforcerowsecurity rls_forced, c.reltuples::bigint est
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='plan_critiques'`);
console.log('\nRLS:', JSON.stringify(r2.rows));
const r3 = await c.query(`select policyname, cmd, roles::text, coalesce(qual,'-') qual, coalesce(with_check,'-') wc from pg_policies where schemaname='public' and tablename='plan_critiques' order by policyname`);
console.log('\nPOLICIES (all):'); r3.rows.forEach(r=>console.log(` ${r.policyname} | ${r.cmd} | ${r.roles} | USING=${r.qual} | CHECK=${r.wc}`));
await c.end();
