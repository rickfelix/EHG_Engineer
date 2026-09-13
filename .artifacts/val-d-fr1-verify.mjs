import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const q = async (label, sql) => {
  try { const { rows } = await c.query(sql); console.log('\n### '+label); console.log(JSON.stringify(rows, null, 1).slice(0, 2500)); }
  catch(e){ console.log('\n### '+label+' ERROR: '+e.message); }
};
await q('A. table exists', `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='venture_experience_review_runs'`);
await q('B. columns', `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='venture_experience_review_runs' ORDER BY ordinal_position`);
await q('C. category check', `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='venture_quality_findings_finding_category_check'`);
await q('D. stage15 gates', `SELECT stage_number, name, metadata->'gates' AS gates FROM venture_stages WHERE stage_number=15`);
await q('E. FR-2 run row', `SELECT * FROM venture_experience_review_runs WHERE id='ed63effe-2f20-4157-b6a1-40044b2271e5'`);
await q('F. all runs', `SELECT id, venture_id FROM venture_experience_review_runs LIMIT 10`);
await c.end();
