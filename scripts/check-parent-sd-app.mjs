import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data } = await supabase
  .from('strategic_directives_v2')
  .select('id, target_application, category, sd_type')
  .eq('id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .single();

console.log('Parent SD:', data);
