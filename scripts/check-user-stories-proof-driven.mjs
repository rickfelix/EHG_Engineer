import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROOF-DRIVEN-1758340937844';

console.log('Checking SD:', SD_ID);
console.log('');

// Check PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('prd_id, title, user_stories_generated')
  .eq('directive_id', SD_ID)
  .maybeSingle();

console.log('PRD:', prd ? prd.prd_id : 'Not found');
if (prd) {
  console.log('Title:', prd.title);
  console.log('User Stories Generated:', prd.user_stories_generated);
}
console.log('');

// Check user stories
const { data: userStories } = await supabase
  .from('user_stories')
  .select('story_id, title, status, e2e_test_mapped')
  .eq('sd_id', SD_ID);

console.log('User Stories Count:', userStories?.length || 0);
if (userStories && userStories.length > 0) {
  userStories.forEach(s => {
    console.log(`  ${s.story_id}: ${s.title}`);
    console.log(`    Status: ${s.status}, E2E Mapped: ${s.e2e_test_mapped}`);
  });
} else {
  console.log('  No user stories found');
  console.log('  This is expected for documentation/process SDs');
}
