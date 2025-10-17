import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const tables = ['leo_protocols', 'leo_protocol_sections', 'leo_sub_agents', 'leo_handoff_templates'];

console.log('Checking LEO Protocol Tables:\n');

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*').limit(1);

  if (error) {
    console.log(`❌ ${table}: Does not exist`);
    console.log(`   Error: ${error.message}\n`);
  } else {
    console.log(`✅ ${table}: Exists`);
    if (data && data[0]) {
      console.log(`   Columns: ${Object.keys(data[0]).join(', ')}\n`);
    } else {
      console.log(`   No data yet\n`);
    }
  }
}
