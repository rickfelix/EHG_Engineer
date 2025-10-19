import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-AGENT-ADMIN-002')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('SD Key:', sd.sd_key);
console.log('SD ID:', sd.id);
console.log('Title:', sd.title);
