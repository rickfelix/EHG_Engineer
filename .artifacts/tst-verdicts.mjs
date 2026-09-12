import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results').select('*').eq('sub_agent_code','TESTING').eq('phase','PLAN').order('created_at',{ascending:false}).limit(3);
console.log('COLUMNS:', data&&data[0]?Object.keys(data[0]).join(', '):'none');
for (const r of data||[]) console.log('\nverdict:', r.verdict, '| status:', r.status, '| conf:', r.confidence_score, '| sd_id:', r.sd_id, '| target_app:', r.target_application, '| meta keys:', Object.keys(r.metadata||{}).join(','));
const { data: vs } = await s.from('sub_agent_execution_results').select('verdict').limit(2000);
console.log('\nDISTINCT verdicts in table:', [...new Set((vs||[]).map(v=>v.verdict))].join(' | '));
