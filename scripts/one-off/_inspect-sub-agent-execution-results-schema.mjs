import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get a recent row to see schema
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(2);

if (error) {
  console.error('Query failed:', error);
  process.exit(1);
}
console.log('Columns:', Object.keys(data[0] || {}));
console.log('Sample row:', JSON.stringify(data[0], null, 2));
