import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
if (!url) { console.error('NO DB URL in env'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const trg = await c.query(`SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid='public.feedback'::regclass AND NOT tgisinternal ORDER BY tgname`);
console.log('=== LIVE TRIGGERS ===');
for (const r of trg.rows) console.log(`\n-- ${r.tgname} (tgenabled=${r.tgenabled}) hasWHEN=${/WHEN \(/.test(r.def)}\n${r.def.slice(0,900)}`);
const con = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.feedback'::regclass AND contype='c' ORDER BY conname`);
console.log('\n=== CHECK CONSTRAINTS ===');
for (const r of con.rows) console.log(`${r.conname}: ${r.def}`);
const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback' AND column_name IN ('snoozed_at','snoozed_by','snooze_reason','snoozed_until') ORDER BY column_name`);
console.log('\n=== SNOOZE COLUMNS PRESENT ===', cols.rows.map(r=>r.column_name).join(', ') || '(none)');
const rowcount = await c.query(`SELECT count(*) FILTER (WHERE status='snoozed') AS snoozed_rows, count(*) FILTER (WHERE snoozed_until IS NOT NULL) AS has_snoozed_until, count(*) AS total FROM public.feedback`);
console.log('=== ROW CENSUS ===', JSON.stringify(rowcount.rows[0]));
await c.end();
