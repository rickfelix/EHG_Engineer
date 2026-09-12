import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`select tgname, pg_get_triggerdef(oid) d from pg_trigger where tgrelid='public.feedback'::regclass and not tgisinternal and tgname in ('trg_log_feedback_resolution_violation','trigger_update_feedback_updated_at')`);
for (const row of r.rows) console.log(row.tgname, '=>', row.d);
const f = await c.query(`select prosrc from pg_proc where proname = 'log_feedback_resolution_violation'`);
console.log('\n--- fn src (first 1500) ---\n', (f.rows[0]?.prosrc||'NOT FOUND').slice(0,1500));
await c.end();
