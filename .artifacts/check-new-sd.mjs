import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, claiming_session_id, updated_at').eq('id', '61447e07-e054-42ab-884c-4b98a69b6557').maybeSingle();
console.log(JSON.stringify(data, null, 2));
