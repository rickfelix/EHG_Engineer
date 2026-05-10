import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('validation_mode').not('validation_mode', 'is', null).limit(100);
const modes = new Set((data||[]).map(r => r.validation_mode));
console.log('validation_mode existing values:', [...modes]);
