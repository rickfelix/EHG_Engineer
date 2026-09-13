import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) { console.log('NO DIRECT PG URL in env; keys:', Object.keys(process.env).filter(k=>/SUPABASE|DATABASE|POSTGRES/i.test(k)).join(',')); process.exit(0); }
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql, params=[]) => {
  try { const r = await c.query(sql, params); console.log(`\n=== ${label} (${r.rows.length}) ===`); r.rows.forEach(x=>console.log(JSON.stringify(x))); }
  catch(e){ console.log(`\n=== ${label} ERROR: ${e.message}`); }
};
await q('uat_test_runs columns', `select column_name,data_type,is_generated,generation_expression from information_schema.columns where table_name='uat_test_runs' order by ordinal_position`);
await q('sms_outbound_obligations columns', `select column_name,data_type,is_generated,generation_expression from information_schema.columns where table_name='sms_outbound_obligations' order by ordinal_position`);
await q('ALL *_evaluated/_passed/_verified boolean columns public', `select table_name,column_name,data_type,is_generated,generation_expression from information_schema.columns where table_schema='public' and (column_name like '%\_evaluated' or column_name like '%\_passed' or column_name like '%\_verified') order by table_name,column_name`);
await q('ALL generated columns public', `select table_name,column_name,generation_expression from information_schema.columns where table_schema='public' and is_generated='ALWAYS' order by table_name`);
await c.end();
