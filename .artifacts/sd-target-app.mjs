import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('strategic_directives_v2').select('target_application').eq('id', 'b0331d11-b360-4fd1-b1e7-6b97676654bf').maybeSingle();
console.log(JSON.stringify(data, null, 2), error);
