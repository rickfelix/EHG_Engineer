import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('recursion_events')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error.message);
} else if (data && data.length > 0) {
  console.log('recursion_events columns:', Object.keys(data[0]));
} else {
  console.log('No recursion events found. Checking empty insert...');
  const { error: err2 } = await supabase
    .from('recursion_events')
    .insert({});
  console.log('Schema:', err2?.message || 'Table exists but empty');
}
