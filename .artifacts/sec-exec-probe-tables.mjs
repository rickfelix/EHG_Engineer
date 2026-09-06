import dotenv from 'dotenv'; import path from 'path'; import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await sb.from('michael_credentials').select('identifier').limit(1);
console.log('michael_credentials:', error ? `${error.code}: ${error.message}` : 'PRESENT');
