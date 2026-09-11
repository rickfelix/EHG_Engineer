import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
const db = await createSupabaseServiceClient('engineer', {verbose:false});
const { data, error } = await db.from('product_requirements_v2')
  .select('id, sd_id, title, status, created_at, content')
  .eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf')
  .order('created_at', { ascending: false });
if (error) { console.error(error); process.exit(1); }
console.log('count:', data.length);
for (const r of data) {
  console.log('---', r.id, r.title, r.status, r.created_at);
}
process.exit(0);
