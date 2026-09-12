import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// 1. Does the sensemaking view exist and expose status/metadata/snoozed_until?
const v = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='v_feedback_with_sensemaking' AND column_name IN ('status','metadata','snoozed_until','severity','resolved_at') ORDER BY column_name`);
console.log('=== v_feedback_with_sensemaking exposes:', v.rows.map(r=>r.column_name).join(', ') || '(VIEW MISSING)');

// 2. assist-engine loadInboxItems filter: does status='backlog' pass through TODAY?
const a = await c.query(`
SELECT count(*) AS backlog_rows_visible_to_assist
FROM public.v_feedback_with_sensemaking
WHERE status NOT IN ('resolved','wont_fix','shipped','snoozed','invalid')
  AND status='backlog'`);
console.log('=== assist-engine loadInboxItems would ALREADY return backlog rows:', JSON.stringify(a.rows[0]));

// 3. chairman queue view: live definition of the feedback arm
const cv = await c.query(`SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name IN ('chairman_all_decision_signals','chairman_unified_decisions','chairman_pending_decisions')`);
console.log('=== chairman views present:', cv.rows.map(r=>r.table_name).join(', ') || '(none)');
if (cv.rows.length) {
  const def = await c.query(`SELECT pg_get_viewdef('public.chairman_all_decision_signals'::regclass, true) AS d`).catch(()=>({rows:[]}));
  if (def.rows.length) {
    const d = def.rows[0].d;
    const idx = d.indexOf('feedback');
    console.log('=== chairman_all_decision_signals feedback arm (excerpt) ===');
    console.log(d.slice(Math.max(0, idx-1400), idx+700));
  }
}
await c.end();
