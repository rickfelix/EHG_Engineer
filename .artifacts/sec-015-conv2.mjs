import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='SD-LEARN-FIX-ADDRESS-PAT-LES-015';
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('sd_id', SD).order('created_at', { ascending: false }).range(0, 19);
console.log('ERR:', error?.message||'none', '| rows:', data?.length);
if (data?.length) console.log('COLUMNS:', Object.keys(data[0]).join(', '));
for (const r of (data||[])) {
  console.log(`\n- ${r.sub_agent_code} | phase=${r.phase} | status=${r.status} | verdict=${r.verdict||r.results?.verdict} | conf=${r.confidence_score} | ${r.created_at}`);
  console.log('  metadata:', JSON.stringify(r.metadata)?.slice(0,400));
}
