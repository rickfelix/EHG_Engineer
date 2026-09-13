import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error, count } = await s.from('session_coordination')
  .select('id,created_at,target_session,subject,read_at', { count: 'exact' })
  .eq('payload->>urgency','interrupt').order('created_at',{ascending:false}).limit(10);
console.log('interrupt rows ever written:', error ? 'ERR '+error.message : count);
(data||[]).forEach(r=>console.log(' -', r.id, r.created_at, '| read_at:', r.read_at, '|', (r.subject||'').slice(0,60)));
const { count: anyUrg } = await s.from('session_coordination').select('id',{count:'exact',head:true}).not('payload->>urgency','is',null);
console.log('rows with ANY payload.urgency set:', anyUrg);
const { count: fence } = await s.from('session_coordination').select('id',{count:'exact',head:true}).eq('payload->>kind','fence_notice');
console.log('(control) fence_notice rows ever:', fence);
