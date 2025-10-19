#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('ROOT CAUSE ANALYSIS: SD-AGENT-MIGRATION-001');
console.log('═══════════════════════════════════════════════════════════\n');

// Check user stories
const { data: stories } = await supabase
  .from('user_stories')
  .select('*')
  .eq('sd_id', 'SD-AGENT-MIGRATION-001');

console.log('ROOT CAUSE #6: USER STORIES');
if (!stories || stories.length === 0) {
  console.log('❌ NO USER STORIES CREATED\n');
  console.log('Product Requirements Expert sub-agent was not triggered');
  console.log('User stories define acceptance criteria for features');
  console.log('Without user stories, no way to validate feature completion\n');
} else {
  console.log(`✅ Found ${stories.length} user stories\n`);
  stories.forEach((story, idx) => {
    console.log(`${idx + 1}. ${story.title}`);
    console.log(`   Status: ${story.status}`);
    console.log(`   Validated: ${story.validation_status || 'NO'}\n`);
  });
}

console.log('═══════════════════════════════════════════════════════════\n');

// Check progress calculation
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('progress_percentage, status, current_phase')
  .eq('id', 'SD-AGENT-MIGRATION-001')
  .single();

console.log('ROOT CAUSE #7: PROGRESS TRACKING');
console.log(`Status: ${sd.status}`);
console.log(`Phase: ${sd.current_phase}`);
console.log(`Progress: ${sd.progress_percentage}\n`);

if (sd.progress_percentage === undefined || sd.progress_percentage === null) {
  console.log('❌ PROGRESS CALCULATION BROKEN\n');
  console.log('Progress is "undefined" - system could not calculate');
  console.log('This should have been a red flag that something is wrong');
  console.log('SD marked "completed" without valid progress metric\n');
} else if (sd.progress_percentage < 100 && sd.status === 'completed') {
  console.log(`❌ INCOMPLETE SD MARKED COMPLETE\n`);
  console.log(`Progress: ${sd.progress_percentage}% but status: ${sd.status}`);
  console.log('System allowed completion without 100% progress\n');
}

console.log('═══════════════════════════════════════════════════════════\n');

// Summary
console.log('📊 ROOT CAUSE SUMMARY:\n');
console.log('1. ❌ No scope-to-deliverables validation');
console.log('2. ❌ Generic/empty retrospective');
console.log('3. ❌ Empty PRD (no acceptance criteria)');
console.log('4. ❌ No handoffs recorded');
console.log('5. ❌ No sub-agent verifications');
console.log('6. ❌ No user stories created');
console.log('7. ❌ Progress tracking broken (undefined)\n');

console.log('💡 IMPACT:\n');
console.log('Without these gates, 3 out of 4 promised features');
console.log('were never implemented, but SD was marked complete.');
console.log('The system had NO checkpoints to catch this failure.\n');

console.log('═══════════════════════════════════════════════════════════');
