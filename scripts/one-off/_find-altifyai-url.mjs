import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('ventures').select('*').ilike('name', '%altify%').limit(1);
if (error) { console.error(error); process.exit(1); }
const s = JSON.stringify(data[0]);
const urls = [...s.matchAll(/https?:\/\/[^"\\]+/g)].map(m => m[0]);
console.log([...new Set(urls)]);
