import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`SELECT sd_key, status, current_phase, metadata FROM strategic_directives_v2 WHERE sd_key='SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-B'`);
const md = r.rows[0].metadata||{};
console.log('== B metadata (searching for cancel/reason/close) ==');
for (const [k,v] of Object.entries(md)) {
  const s = typeof v==='string'?v:JSON.stringify(v);
  if (/cancel|reason|close|dup|supersed|note|status/i.test(k) || /cancel|supersed|already fixed|no code change|duplicate/i.test(s)) {
    console.log(` ${k}: ${String(s).slice(0,900)}`);
  }
}
// any feedback row / QF referencing B cancellation
const fb = await c.query(`SELECT id, title, status, LEFT(description,400) d FROM feedback WHERE title ILIKE '%AUDIT-FIX-FEEDBACK-001-B%' OR description ILIKE '%AUDIT-FIX-FEEDBACK-001-B%' ORDER BY created_at DESC LIMIT 5`);
console.log('\n== feedback rows mentioning B ==');
fb.rows.forEach(x=>console.log(` ${x.status} | ${String(x.title).slice(0,120)}\n   ${x.d}`));
await c.end();
