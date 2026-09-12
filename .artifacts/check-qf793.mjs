import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('quick_fixes').select('*').eq('id', 'QF-20260911-793').maybeSingle();
if (error) console.error('ERR', error.message);
console.log(JSON.stringify(data, null, 2));
