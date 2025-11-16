import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data } = await supabase
  .from('strategic_directives_v2')
  .select('id, parent_sd_id')
  .not('parent_sd_id', 'is', null)
  .limit(5);

console.log('Child SDs with parent_sd_id:');
data.forEach(d => {
  console.log(`  ${d.id} -> parent: ${d.parent_sd_id}`);
});
