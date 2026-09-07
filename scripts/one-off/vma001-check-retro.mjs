import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const { data, error } = await supabase.from('retrospectives').select('*').eq('id', 'af093997-5019-4f82-9def-4a88ce8f818f').single();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
