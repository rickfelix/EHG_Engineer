import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const con = await c.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid='public.feedback'::regclass AND contype='c'
  ORDER BY conname`);
console.log('=== feedback CHECK constraints ===');
for (const r of con.rows) console.log(`${r.conname}: ${r.def}\n`);

const live = await c.query(`SELECT pg_get_viewdef('public.chairman_all_decision_signals', true) AS d`);
const flag = live.rows[0].d.split('UNION ALL').find(b => b.includes("'flag_review'"));
console.log('=== LIVE flag_review WHERE ===');
console.log(flag.slice(flag.lastIndexOf('WHERE')));

const rel = await c.query(`SELECT reloptions FROM pg_class WHERE oid='public.chairman_all_decision_signals'::regclass`);
console.log('=== live reloptions ===', rel.rows[0].reloptions);

const pop = await c.query(`
  SELECT
    count(*) FILTER (WHERE snoozed_until IS NOT NULL) AS any_snoozed_whole_table,
    count(*) FILTER (WHERE snoozed_until > now()) AS future_snoozed_whole_table
  FROM feedback`);
console.log('=== whole-table snoozed_until ===', pop.rows[0]);

const elig = await c.query(`
  SELECT count(*) AS eligible,
         count(*) FILTER (WHERE snoozed_until > now()) AS would_be_excluded
  FROM feedback f
  WHERE f.severity::text = ANY(ARRAY['critical','high'])
    AND f.resolved_at IS NULL
    AND COALESCE(f.status,'new')::text <> ALL(ARRAY['resolved','wont_fix','in_progress','duplicate','invalid'])`);
console.log('=== flag_review branch population ===', elig.rows[0]);

const st = await c.query(`SELECT status, count(*) FROM feedback GROUP BY status ORDER BY 2 DESC`);
console.log('=== distinct feedback.status values in use ===');
console.log(st.rows.map(r => `${r.status}=${r.count}`).join(', '));

// does the view text already contain the clause?
console.log('=== live view ALREADY has snoozed_until clause? ===', live.rows[0].d.includes('snoozed_until'));

await c.end();
