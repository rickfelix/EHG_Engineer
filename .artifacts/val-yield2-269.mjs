import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const probe = async (label, q) => { const { count, error } = await q; console.log(label.padEnd(46), error ? 'ERR '+error.message : count); };
await probe('TOTAL session_coordination rows:', s.from('session_coordination').select('id',{count:'exact',head:true}));
await probe("payload->>kind = 'coordinator_request':", s.from('session_coordination').select('id',{count:'exact',head:true}).eq('payload->>kind','coordinator_request'));
await probe("payload->>kind = 'fence_notice':", s.from('session_coordination').select('id',{count:'exact',head:true}).eq('payload->>kind','fence_notice'));
await probe("payload->>topic = 'ruling':", s.from('session_coordination').select('id',{count:'exact',head:true}).eq('payload->>topic','ruling'));
await probe("payload->>urgency NOT NULL:", s.from('session_coordination').select('id',{count:'exact',head:true}).not('payload->>urgency','is',null));
// the canary ruling cited in the SD
const { data: canary } = await s.from('session_coordination').select('id,created_at,payload,subject').eq('id','9c8b3a8a-0000-0000-0000-000000000000').maybeSingle();
const { data: c2 } = await s.from('session_coordination').select('id,created_at,subject,payload').ilike('id','9c8b3a8a%').limit(1);
console.log('canary 9c8b3a8a present:', c2 && c2.length ? 'YES payload.urgency='+JSON.stringify(c2[0].payload?.urgency) : 'not found by prefix');
