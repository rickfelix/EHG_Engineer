import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, created_at, metadata').eq('id', '0c5edb96-11dd-40df-b81e-84fe6f20c65e').maybeSingle();
if (error) console.error('ERR', error.message);
console.log(JSON.stringify(data, null, 2));

const { data: sd } = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, parent_sd_id').eq('id', '8667b9ad-02b4-4bfa-b908-6d3882697e0b').maybeSingle();
console.log('SD:', JSON.stringify(sd, null, 2));
