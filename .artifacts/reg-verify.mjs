import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, verdict, confidence, phase, sub_agent_code, metadata, warnings, detailed_analysis, created_at, updated_at')
  .eq('id', 'f70a280f-39a9-432d-ac51-07a7c55d7bfa').single();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('READBACK verdict=' + data.verdict + ' conf=' + data.confidence + ' phase=' + data.phase + ' code=' + data.sub_agent_code);
console.log('partial=' + data.metadata.partial + ' repo_path=' + data.metadata.repo_path);
console.log('warnings=' + data.warnings.length + ' detailed_len=' + data.detailed_analysis.length + ' runs=' + JSON.stringify(data.metadata.test_runs.map(r=>r.tests_passed)));
console.log('updated_after_insert=' + (data.updated_at > data.created_at));
