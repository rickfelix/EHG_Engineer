import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .update({ phase: 'PLAN' })
  .eq('id', '47629374-e1a6-4262-b0ba-80117185bb92')
  .select('id,sd_id,sub_agent_code,phase,verdict,confidence,created_at')
  .single();
console.log('FINAL ROW:', JSON.stringify(data), 'err:', error?.message);
