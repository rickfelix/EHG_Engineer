import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results')
  .select('phase, sub_agent_code, created_at, source')
  .in('phase', ['EXEC-TO-PLAN','EXEC_TO_PLAN'])
  .order('created_at', { ascending: false }).limit(20);
console.log('Recent rows with EXEC-TO-PLAN-ish phase:');
for (const r of data||[]) console.log(' ', r.created_at, '|', r.phase, '|', r.sub_agent_code, '| source=', r.source);
// phase-start anchor for our SD
const { data: h } = await s.from('sd_phase_handoffs')
  .select('to_phase, status, accepted_at, created_at')
  .eq('sd_id','7b8be04e-1f2b-431c-b33d-4574013a94e5')
  .order('created_at',{ascending:false}).limit(10);
console.log('\nsd_phase_handoffs for this SD:');
for (const r of h||[]) console.log(' ', r.created_at, '| to_phase=', r.to_phase, '| status=', r.status, '| accepted_at=', r.accepted_at);
