import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: all, error } = await sb.from('ventures').select('*').limit(50);
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('ventures cols:', Object.keys(all[0]||{}).join(','));
console.log('--- all venture names ---');
for (const r of all) console.log(r.id, '|', r.name, '| stage=', r.current_lifecycle_stage, '| mode=', r.launch_mode);
