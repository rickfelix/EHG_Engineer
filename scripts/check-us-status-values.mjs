import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data } = await supabase
  .from('user_stories')
  .select('status')
  .limit(10);

if (data && data.length > 0) {
  const unique = [...new Set(data.map(s => s.status))];
  console.log('Valid status values:', unique);
} else {
  console.log('No user stories found. Trying empty insert to get constraint error...');
  const { error } = await supabase
    .from('user_stories')
    .insert({ status: 'invalid_test' });
  console.log(error?.message || 'No helpful error');
}
