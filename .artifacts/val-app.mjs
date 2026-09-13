import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} }); await c.connect();
let r = await c.query(`select sd_key, target_application from strategic_directives_v2 where sd_key='SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001'`);
console.log('SD target_application:', JSON.stringify(r.rows));
r = await c.query(`select name, local_path from applications order by name`);
console.log('applications:'); r.rows.forEach(x=>console.log(' ', x.name, '=>', x.local_path));
await c.end();
