import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('retrospectives').select('*').eq('id', '77a5dcd2-ad3f-477d-9fbe-9a53c009b4f4').single();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
