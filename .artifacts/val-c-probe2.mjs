import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
for (const fn of ['log_feedback_resolution_violation']) {
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname=$1`, [fn]);
  console.log(`=== ${fn} ===\n${(r.rows[0]?.prosrc||'(not found)').slice(0,1500)}`);
}
await c.end();
