import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data } = await supabase
  .from('user_stories')
  .select('story_key, sd_id')
  .limit(20);

if (data && data.length > 0) {
  console.log('Existing story_key formats:');
  data.forEach(s => console.log('  ' + s.story_key + ' (SD: ' + s.sd_id + ')'));
} else {
  console.log('No user stories found');
}
