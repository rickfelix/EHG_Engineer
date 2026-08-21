import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Recent TESTING evidence rows: what phase values are actually used?
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, sd_id, created_at')
  .eq('sub_agent_code','TESTING')
  .order('created_at', { ascending: false })
  .limit(40);
if (error) { console.log('ERR', error.message); process.exit(1); }
const counts = {};
for (const r of data) counts[r.phase] = (counts[r.phase]||0)+1;
console.log('phase histogram (last 40 TESTING rows):', counts);
console.log('--- sample rows ---');
for (const r of data.slice(0,12)) console.log(r.created_at, '|', r.phase, '|', r.verdict, '|', r.sd_id);

// Existing rows for THIS sd
const { data: mine } = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at, sd_id')
  .in('sd_id', ['7b8be04e-1f2b-431c-b33d-4574013a94e5','SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001'])
  .order('created_at', { ascending: false }).limit(25);
console.log('--- THIS SD rows ---');
for (const r of mine||[]) console.log(r.created_at, '|', r.sub_agent_code, '|', r.phase, '|', r.verdict, '|', r.sd_id);
