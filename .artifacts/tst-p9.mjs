import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`select conname, contype, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.feedback'::regclass and contype='c' order by conname`);
for (const x of r.rows) console.log('-', x.conname, '::', x.d.slice(0,260));
const cols = await c.query(`select column_name, is_nullable, column_default from information_schema.columns where table_name='feedback' and column_name in ('resolution_sd_id','strategic_directive_id','quick_fix_id','rubric_score','quality_assessment','archived_at','resolved_at','updated_at','error_hash')`);
console.log('\nCOLS:', JSON.stringify(cols.rows));
await c.end();
