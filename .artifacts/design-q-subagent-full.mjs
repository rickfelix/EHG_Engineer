import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
const db = await createSupabaseServiceClient('engineer', {verbose:false});
const codes = process.argv.slice(2);
const { data, error } = await db.from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf')
  .in('sub_agent_code', codes)
  .order('created_at', { ascending: false });
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  console.log('=====', r.sub_agent_code, r.phase, r.created_at, r.verdict);
  console.log(JSON.stringify(r, null, 2));
}
process.exit(0);
