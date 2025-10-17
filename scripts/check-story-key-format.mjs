import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data } = await supabase
  .from('user_stories')
  .select('story_key, sd_id')
  .limit(5);

console.log('Existing story_key formats:');
data.forEach(row => {
  console.log(`Key: ${row.story_key}`);
  console.log(`SD:  ${row.sd_id}`);
  console.log('---');
});
