import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`
SELECT
  count(*) FILTER (WHERE status IN ('new','triaged') AND severity IN ('critical','high') AND resolved_at IS NULL) AS snoozeable_rows_that_would_stay_in_chairman_queue,
  count(*) FILTER (WHERE status IN ('new','triaged')) AS snoozeable_rows_total,
  count(*) FILTER (WHERE status='backlog') AS backlog_now,
  count(*) FILTER (WHERE status='backlog' AND severity IN ('critical','high') AND resolved_at IS NULL) AS backlog_in_chairman_queue_now
FROM public.feedback`);
console.log('=== BLAST RADIUS ===');
console.log(JSON.stringify(r.rows[0], null, 2));
await c.end();
