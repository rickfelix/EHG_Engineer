import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.SUPABASE_POOLER_URL;
if (!url) { console.log('NO POOLER URL'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const tables = ['feedback','session_coordination','issue_patterns','retrospectives','chairman_decisions','merge_witness_telemetry','sms_relay_staging','sms_outbound_obligations','sub_agent_execution_results','strategic_directives_v2','coordination_events','codebase_health_snapshots','pattern_occurrences'];
console.log('=== TABLE EXISTENCE ===');
const ex = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [tables]);
const found = new Set(ex.rows.map(r=>r.table_name));
for (const t of tables) console.log(`${found.has(t)?'EXISTS  ':'MISSING '} ${t}`);

console.log('\n=== chairman decision capture-ish tables ===');
const cd = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%chairman%' OR table_name ILIKE '%captur%') ORDER BY 1`);
console.log(cd.rows.map(r=>r.table_name).join('\n'));

console.log('\n=== feedback.category COLUMN ===');
const col = await c.query(`SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback' AND column_name IN ('category','id','status','source','title','description','severity','created_at','metadata') ORDER BY column_name`);
console.table(col.rows);

console.log('\n=== ALL CHECK/CONSTRAINTS on feedback ===');
const con = await c.query(`
  SELECT conname, contype, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conrelid = 'public.feedback'::regclass ORDER BY contype, conname`);
for (const r of con.rows) console.log(`[${r.contype}] ${r.conname}\n    ${r.def}`);

console.log('\n=== Is feedback.category an ENUM type? ===');
const en = await c.query(`
  SELECT t.typname, e.enumlabel FROM pg_type t
  JOIN pg_enum e ON e.enumtypid=t.oid
  WHERE t.typname IN (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback' AND column_name='category')
  ORDER BY e.enumsortorder`);
console.log(en.rows.length ? JSON.stringify(en.rows) : 'NOT AN ENUM (no pg_enum labels)');

console.log('\n=== TRIGGERS on feedback (could reject categories) ===');
const tg = await c.query(`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid='public.feedback'::regclass AND NOT tgisinternal`);
for (const r of tg.rows) console.log(`${r.tgname}: ${r.def.slice(0,300)}`);
if (!tg.rows.length) console.log('none');

console.log('\n=== feedback NOT NULL columns without default (insert requirements) ===');
const req = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback' AND is_nullable='NO' AND column_default IS NULL ORDER BY ordinal_position`);
console.table(req.rows);

console.log('\n=== DISTINCT feedback.category live values (top 40 by count) ===');
const dv = await c.query(`SELECT category, count(*) AS n FROM public.feedback GROUP BY 1 ORDER BY n DESC LIMIT 40`);
console.table(dv.rows);

console.log('\n=== any existing solomon_trend* rows? ===');
const st = await c.query(`SELECT category, count(*) FROM public.feedback WHERE category ILIKE '%trend%' OR category ILIKE 'solomon%' GROUP BY 1`);
console.table(st.rows);

await c.end();
