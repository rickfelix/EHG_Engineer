import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,source,invocation_id,phase,verdict,session_id:metadata->>session_id,content_hash:metadata->>content_hash')
  .eq('id','8057d0a8-5556-4866-a7b6-9610c1b0bd6b').maybeSingle();
console.log('PROVENANCE QUARTET on the VALIDATION row:');
console.log('  source       :', data?.source ?? 'NULL');
console.log('  invocation_id:', data?.invocation_id ?? 'NULL');
console.log('  session_id   :', data?.session_id ?? 'NULL');
console.log('  content_hash :', data?.content_hash ?? 'NULL');
const ok = ['source','invocation_id','session_id','content_hash'].filter(k=>!data?.[k]);
console.log('  => missing:', ok.length? ok.join(', ') : 'NONE (provenance complete)');
console.log('  verdict:', data?.verdict, '| phase:', data?.phase);
