import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id','b9408054-add2-431b-b959-5a9d278ecb3e').single();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('COLUMNS PRESENT:', Object.keys(data).join(', '));
for (const [k,v] of Object.entries(data)) {
  if (k==='metadata') continue;
  const str = v===null?'<null>':(typeof v==='object'?JSON.stringify(v):String(v));
  console.log(`\n--- ${k} (${str.length} chars) ---\n` + str.slice(0,600) + (str.length>600?'...[truncated]':''));
}
console.log('\n=== metadata top-level keys ===');
console.log(Object.keys(data.metadata||{}).join(', '));
console.log('\n=== DOES FINDINGS CONTENT SURVIVE ANYWHERE? ===');
const blob = JSON.stringify(data);
for (const probe of ['TEST-EXEC-1','null-route collision','Reverse Null Flow','FLOW_PERSONA_UNMATCHED','sty-63c41ec0','DB_TIER_BLOCKED']) {
  console.log(' ', probe.padEnd(26), blob.includes(probe) ? 'FOUND' : 'ABSENT');
}
