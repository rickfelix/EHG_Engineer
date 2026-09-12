import 'dotenv/config';
import pg from 'pg';
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) { console.log('NO PG URL in env; keys:', Object.keys(process.env).filter(k=>/POOLER|DATABASE_URL|DB_URL/.test(k)).join(',')); process.exit(0); }
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const idx = await c.query(`select indexname from pg_indexes where tablename='feedback' and indexname in ('idx_feedback_venture_error_hash','idx_feedback_error_capture_hash','idx_feedback_telemetry_dedup')`);
console.log('partial unique indexes found:', idx.rows.map(r=>r.indexname).join(', ') || 'NONE');
const ck = await c.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.feedback'::regclass and conname like '%status%'`);
console.log('status check:', JSON.stringify(ck.rows));
const trg = await c.query(`select tgname, tgenabled from pg_trigger where tgrelid='public.feedback'::regclass and not tgisinternal`);
console.log('triggers:', JSON.stringify(trg.rows));
await c.end();
