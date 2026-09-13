import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(url, key);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('sd_id','fbbf9a6d-e079-4c22-9189-88336aae9a16');
if (error) { console.error('ERR', error); process.exit(1); }
console.log('rows:', data.length);
fs.writeFileSync(process.argv[2], JSON.stringify(data, null, 2));
console.log('columns:', Object.keys(data[0]||{}).join(', '));
console.log('updated_at:', data[0]?.updated_at, 'id:', data[0]?.id);
