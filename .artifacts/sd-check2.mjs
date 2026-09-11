import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

const { data: handoffs, error: hErr } = await supabase.from('sd_phase_handoffs').select('*').eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf').order('created_at', { ascending: true });
if (hErr) console.error(hErr);
console.log(JSON.stringify(handoffs?.map(h => ({id: h.id, type: h.handoff_type, status: h.status, created_at: h.created_at, score: h.gate_score || h.score || h.validation_score})), null, 2));

// try both sd_id forms for sub_agent_execution_results
const { data: sars1 } = await supabase.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, created_at, sd_id').eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf');
console.log('by uuid:', JSON.stringify(sars1, null, 2));
const { data: sars2 } = await supabase.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, created_at, sd_id').eq('sd_id', 'SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001');
console.log('by key:', JSON.stringify(sars2, null, 2));
