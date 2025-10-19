import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from('leo_protocol_sections')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Sample record:');
  console.log(JSON.stringify(data[0], null, 2));
  console.log('\nColumns:', Object.keys(data[0] || {}));
}
