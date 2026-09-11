import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: one } = await sb.from('quick_fixes').select('*').limit(1);
console.log('COLUMNS:', one && one[0] ? Object.keys(one[0]).join(', ') : 'none');
