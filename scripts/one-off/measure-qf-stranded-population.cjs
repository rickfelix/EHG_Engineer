require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const now = (await c.query('SELECT now() AT TIME ZONE \'utc\' AS t')).rows[0].t.toISOString();
  const r = (await c.query(`SELECT
      count(*) FILTER (WHERE status='in_progress' AND claiming_session_id IS NULL AND pr_url IS NULL AND commit_sha IS NULL) AS stranded,
      count(*) FILTER (WHERE status='in_progress' AND (pr_url IS NOT NULL OR commit_sha IS NOT NULL)) AS merge_witnessed,
      count(*) FILTER (WHERE status='in_progress') AS in_progress_total,
      count(*) FILTER (WHERE status='open') AS open_claimable
    FROM public.quick_fixes`)).rows[0];
  console.log(`[${process.argv[2] || 'MEASURE'}] measured_at_utc=${now}`);
  console.log(`  stranded_signature = ${r.stranded}`);
  console.log(`  merge_witnessed    = ${r.merge_witnessed}  (deliberate carve-out, never reopened)`);
  console.log(`  in_progress_total  = ${r.in_progress_total}`);
  console.log(`  open_claimable     = ${r.open_claimable}`);
  await c.end();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
