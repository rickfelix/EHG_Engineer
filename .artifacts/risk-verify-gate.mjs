import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('v_sub_agent_repo_compliance').select('*').eq('id','e252eef9-9f7a-4180-81bb-d00f8ea470a6');
if (error) console.log('view err:', error.message); else console.log('COMPLIANCE VIEW:', JSON.stringify(data, null, 1));
const { data: all } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,created_at')
  .eq('sd_id','ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5').order('created_at',{ascending:false}).limit(6);
console.log('\nEVIDENCE ROWS FOR SD:'); for(const r of all||[]) console.log('  ', r.created_at, r.sub_agent_code, r.phase, r.verdict);
