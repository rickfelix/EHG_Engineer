import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} }); await c.connect();
const q = async (l,s,p=[]) => { try{const r=await c.query(s,p);console.log(`\n=== ${l} (${r.rows.length}) ===`);r.rows.forEach(x=>console.log(JSON.stringify(x).slice(0,400)));}catch(e){console.log(`\n=== ${l} ERR: ${e.message}`);} };
await q('sms_status_staging total rows + drained', `select count(*) total, count(drained_at) drained, min(received_at) oldest, max(received_at) newest from sms_status_staging`);
await q('any 30007 anywhere in staging', `select provider_message_id,message_status,received_at,drained_at from sms_status_staging order by received_at desc limit 10`);
await q('does any table hold carrier error codes', `select table_name,column_name from information_schema.columns where column_name ilike '%error_code%' or column_name ilike '%carrier%' limit 20`);
await c.end();
