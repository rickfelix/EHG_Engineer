import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, validation_mode, created_at, metadata')
  .eq('id','437b172c-a843-4584-a684-4e88406b503a').maybeSingle();
console.log('readback err:', error ? error.message : 'none');
console.log('id:', data?.id);
console.log('code/phase/verdict/conf:', data?.sub_agent_code, '|', data?.phase, '|', data?.verdict, '|', data?.confidence);
console.log('metadata.repo_path:', data?.metadata?.repo_path);
console.log('metadata.executed_from_cwd:', data?.metadata?.executed_from_cwd);
console.log('metadata.repo_resolved:', data?.metadata?.repo_resolved);
console.log('fr_verdicts:', JSON.stringify(data?.metadata?.fr_verdicts));
