import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('venture_resources').select('*').eq('venture_id','50763b6a-1fad-4e1e-b2fc-296a1d66ebf9');
if (error) { console.log('ERR', error.message); process.exit(0); }
console.log('rows:', data.length);
for (const r of data) console.log(JSON.stringify({resource_type:r.resource_type, resource_identifier:r.resource_identifier, resource_url:r.resource_url, status:r.status}));
