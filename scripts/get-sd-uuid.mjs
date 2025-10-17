import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const sdId = process.argv[2] || 'SD-AGENT-MIGRATION-001';

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title')
  .eq('sd_key', sdId)
  .single();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('SD UUID:', data.id);
console.log('SD Key:', data.sd_key);
console.log('Title:', data.title);
