import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, progress, metadata').eq('id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf').single();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));

const { data: handoffs, error: hErr } = await supabase.from('sd_phase_handoffs').select('id, handoff_type, status, created_at, quality_score').eq('sd_id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf').order('created_at', { ascending: true });
if (hErr) console.error(hErr);
console.log(JSON.stringify(handoffs, null, 2));

const { data: sars, error: sErr } = await supabase.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, created_at').eq('sd_id', 'SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001').order('created_at', { ascending: true });
if (sErr) console.error(sErr);
console.log(JSON.stringify(sars, null, 2));
