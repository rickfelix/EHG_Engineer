import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const ids = await c.query(`SELECT id, sd_key FROM strategic_directives_v2 WHERE parent_sd_id='f651ec94-852d-4727-8146-5d39cd00c476' AND sd_key IN ('SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-B','SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G')`);
const map = Object.fromEntries(ids.rows.map(r=>[r.id, r.sd_key]));
for (const [id, key] of Object.entries(map)) {
  console.log(`\n########## ${key} ##########`);
  const h = await c.query(`SELECT from_phase, to_phase, status, created_at, LEFT(COALESCE(executive_summary,''),1100) AS summ FROM sd_phase_handoffs WHERE sd_id=$1 ORDER BY created_at DESC LIMIT 3`, [id]);
  h.rows.forEach(x=>console.log(`-- HANDOFF ${x.from_phase}->${x.to_phase} (${x.status}) ${x.created_at.toISOString()}\n${x.summ}\n`));
  const rt = await c.query(`SELECT LEFT(COALESCE(what_went_well::text,''),500) AS w, LEFT(COALESCE(key_learnings::text,''),900) AS k FROM retrospectives WHERE sd_id=$1 ORDER BY created_at DESC LIMIT 1`, [id]);
  rt.rows.forEach(x=>console.log(`-- RETRO learnings: ${x.k}`));
}
await c.end();
