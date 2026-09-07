import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('retrospectives').select('*').eq('id', '8fa57b2f-ed34-4da1-ba23-331b0535a769').single();
console.log(JSON.stringify(data, null, 2));
console.log(error);
