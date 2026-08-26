import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const p = await s.from('creative_assets').select('id,storage_path').limit(1);
console.log('RAW ERROR OBJECT:', JSON.stringify(p.error, null, 1));
// Authoritative: information_schema via pg
