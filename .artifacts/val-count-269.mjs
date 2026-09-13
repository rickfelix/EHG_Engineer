import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,verdict,phase,created_at')
  .eq('sd_id','71fb0b59-adb5-4c65-88d3-5fe788b062d1').order('created_at',{ascending:false});
console.log('ALL evidence rows for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001:', (data||[]).length);
(data||[]).forEach(r=>console.log('  ', r.sub_agent_code.padEnd(12), r.verdict.padEnd(18), 'phase='+r.phase, r.created_at, r.id));
