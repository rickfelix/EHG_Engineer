import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const w = await s.from('withheld_promotion_markers').select('*').limit(1);
console.log('non-head select:', w.error ? 'ABSENT -> '+w.error.message : 'EXISTS rows='+JSON.stringify(w.data));
