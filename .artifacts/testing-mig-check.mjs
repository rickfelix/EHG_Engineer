import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const [t,c] of [['chairman_decisions','override_key'],['quick_fixes','venture_id'],['creative_assets','storage_path']]) {
  const { error } = await sb.from(t).select(c).limit(1);
  console.log(`${t}.${c}: ${error ? 'MISSING' : 'EXISTS'}`);
}
