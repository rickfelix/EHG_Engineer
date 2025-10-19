import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROOF-DRIVEN-1758340937844';

console.log('📋 User Stories for', SD_ID);
console.log('═'.repeat(70));
console.log('');

const { data: userStories, error } = await supabase
  .from('user_stories')
  .select('id, title, status, validation_status, e2e_test_status')
  .eq('sd_id', SD_ID)
  .order('id');

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log(`Found ${userStories.length} user stories:`);
console.log('');

userStories.forEach((story, i) => {
  console.log(`${i + 1}. ${story.id}`);
  console.log(`   Title: ${story.title}`);
  console.log(`   Status: ${story.status}`);
  console.log(`   Validation Status: ${story.validation_status || 'NULL'}`);
  console.log(`   E2E Test Status: ${story.e2e_test_status || 'NULL'}`);
  console.log('');
});

console.log('═'.repeat(70));
console.log('');

const needValidation = userStories.filter(s => s.validation_status !== 'validated');

if (needValidation.length > 0) {
  console.log(`❌ ${needValidation.length} user stories need validation:`);
  needValidation.forEach(s => {
    console.log(`   • ${s.id}: validation_status = ${s.validation_status || 'NULL'}`);
  });
  console.log('');
  console.log('ACTION REQUIRED:');
  console.log('Update validation_status to "validated" for these user stories');
  console.log('OR delete them if they were created by mistake');
} else {
  console.log('✅ All user stories are validated');
}
