import dotenv from 'dotenv'; import pg from 'pg';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL }); await c.connect();
const q = async (l,s)=>{try{const r=await c.query(s);console.log(`\n### ${l}\n`+JSON.stringify(r.rows,null,1));}catch(e){console.log(`\n### ${l}\nERR ${e.message}`);}};
await q('anon-readable (telegram) rows that are SNOOZEABLE via /inbox (i.e. visible in the view + not terminal)', `
 SELECT count(*) AS telegram_snoozeable
 FROM public.v_feedback_with_sensemaking
 WHERE source_type='telegram'
   AND status NOT IN ('resolved','wont_fix','shipped','snoozed','invalid')`);
await q('total telegram rows in feedback', `SELECT count(*) FROM public.feedback WHERE source_type='telegram'`);
await c.end();
