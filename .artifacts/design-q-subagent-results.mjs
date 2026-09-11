import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
const db = await createSupabaseServiceClient('engineer', {verbose:false});
const { data, error } = await db.from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf')
  .order('created_at', { ascending: false })
  .limit(20);
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  console.log('---', r.sub_agent_code, r.phase, r.created_at, r.verdict || r.status);
}
process.exit(0);
