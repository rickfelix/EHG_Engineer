import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('user_stories').select('*').eq('sd_id','27eabc85-1de3-44e2-9b3b-8cb5eb87264b');
console.log('ERR', error?.message);
for (const r of data||[]) console.log(JSON.stringify({title:r.title, status:r.status, validation_status:r.validation_status, e2e_test_path: r.e2e_test_path, result:r.result}));
