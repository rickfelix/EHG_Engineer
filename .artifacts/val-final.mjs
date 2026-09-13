import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} }); await c.connect();
const q = async (l,s,p=[]) => { try{const r=await c.query(s,p);console.log(`\n=== ${l} (${r.rows.length}) ===`);r.rows.forEach(x=>console.log(JSON.stringify(x).slice(0,400)));}catch(e){console.log(`\n=== ${l} ERR: ${e.message}`);} };
// backlog key convention
await q('sd_backlog_map cols', `select column_name,data_type from information_schema.columns where table_name='sd_backlog_map' and column_name like '%sd%'`);
await q('backlog by UUID', `select count(*) n from sd_backlog_map where sd_id='fbbf9a6d-e079-4c22-9189-88336aae9a16'`);
await q('backlog by sd_key', `select count(*) n from sd_backlog_map where sd_id='SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001'`);
// comparison: do OTHER recent draft LEO-INFRA SDs carry backlog rows? (is 0 normal here?)
await q('backlog counts for 8 recent SDs', `select s.sd_key, s.status, (select count(*) from sd_backlog_map m where m.sd_id=s.id::text or m.sd_id=s.sd_key) n from strategic_directives_v2 s where s.sd_key like 'SD-LEO-INFRA-%' order by s.created_at desc limit 8`);
// prior art claim
await q('compliance_experiment table exists?', `select table_name from information_schema.tables where table_schema='public' and table_name ilike '%compliance_experiment%'`);
await q('any total_score/rating generated', `select table_name,column_name,is_generated from information_schema.columns where column_name in ('total_score','rating') and is_generated='ALWAYS'`);
// does uat_test_runs have a control_pack column anywhere / other tables
await q('control_pack as a real column anywhere', `select table_name,column_name from information_schema.columns where column_name ilike '%control_pack%'`);
// sms_status_staging = the provider receipt detail?
await q('sms_status_staging cols', `select column_name,data_type from information_schema.columns where table_name='sms_status_staging' order by ordinal_position`);
await q('receipts for the 6f1931a5 provider msg', `select count(*) n from sms_status_staging where provider_message_id='SM31b5b9df811e41d16eed6736c0eb9c30'`);
await c.end();
