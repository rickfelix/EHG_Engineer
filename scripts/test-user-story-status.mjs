import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Testing status values...\n');

for (const status of ['pending']) {  // Just test 'pending' since that's what the working script uses
  const testStory = {
    sd_id: 'SD-TESTING-COVERAGE-001',
    prd_id: 'PRD-SD-TESTING-COVERAGE-001',
    story_key: `TEST-STATUS-${Date.now()}`,
    title: 'Test story',
    user_role: 'test',
    user_want: 'test',
    user_benefit: 'test',
    priority: 'low',
    status: status,
    story_points: 1,
    phase: 1,  // ADD PHASE
    implementation_context: 'This is a test implementation context that provides meaningful guidance for developers implementing this user story. It includes specific technical details, file paths, and implementation patterns to follow.',
    e2e_test_status: 'not_created'  // Explicitly set this
  };

  const { error } = await supabase.from('user_stories').insert([testStory]);
  if (!error) {
    console.log(`  ✅ '${status}' works!`);
    // Delete the test story
    await supabase.from('user_stories').delete().eq('story_key', testStory.story_key);
    break;
  } else {
    console.log(`  ❌ '${status}' failed: ${error.message}`);
    console.log(`     Details: ${error.details}`);
  }
}
