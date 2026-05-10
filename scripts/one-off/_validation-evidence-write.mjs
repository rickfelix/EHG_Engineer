import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Inspect schema of sub_agent_execution_results once
console.log('--- sub_agent_execution_results column probe ---');
const { data: probe, error: probeErr } = await sb.from('sub_agent_execution_results').select('*').limit(1);
if (probeErr) console.log('ERROR:', probeErr.message);
else console.log('Columns:', Object.keys(probe?.[0] || {}).join(', '));

// Find canonical sub_agent_code for VALIDATION
console.log('\n--- leo_sub_agents codes ---');
const { data: agents } = await sb.from('leo_sub_agents').select('code, name, active').or('code.ilike.%VALIDATION%,name.ilike.%Systems Analyst%,name.ilike.%Validation%');
console.log(JSON.stringify(agents || [], null, 2));
