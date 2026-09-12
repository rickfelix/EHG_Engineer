import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('retrospectives').select('*').eq('retro_type','SD_COMPLETION').order('created_at',{ascending:false}).limit(1);
if (error) console.error(error);
else console.log(Object.keys(data[0]).join('\n'));
