import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('user_stories').select('*').eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b');
if (error) console.error('ERR', error);
console.log('COUNT:', data?.length);
for (const u of (data||[])) {
  console.log('\n---', u.story_key, '|', u.status, '|', u.priority);
  console.log('TITLE:', u.title);
  console.log('AC:', JSON.stringify(u.acceptance_criteria));
  console.log('impl_ctx:', (u.implementation_context||'').slice(0,600));
  const extra = Object.keys(u).filter(k=>!['story_key','status','priority','title','acceptance_criteria','implementation_context','sd_id','id','created_at','updated_at'].includes(k));
  for (const k of extra) { if (u[k]!==null && u[k]!=='' && JSON.stringify(u[k])!=='[]' && JSON.stringify(u[k])!=='{}') console.log(`  ${k}:`, JSON.stringify(u[k]).slice(0,300)); }
}
