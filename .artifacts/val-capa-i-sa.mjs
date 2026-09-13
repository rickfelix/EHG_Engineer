import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('ventures').select('metadata').eq('id','50763b6a-1fad-4e1e-b2fc-296a1d66ebf9').single();
const sa = data.metadata?.synthetic_actor;
console.log('synthetic_actor present:', !!sa);
console.log(JSON.stringify(sa, null, 1));
