#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkE2EStatus() {
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('id, title, validation_status, e2e_test_status')
    .eq('sd_id', 'SD-RETRO-ENHANCE-001')
    .order('priority');

  console.log('User Stories E2E Test Status:\n');
  userStories.forEach(us => {
    const validIcon = us.validation_status === 'validated' ? '✅' : '❌';
    const e2eIcon = us.e2e_test_status === 'passing' ? '✅' : '❌';
    console.log(`${validIcon} ${e2eIcon} ${us.title}`);
    console.log(`   validation_status: ${us.validation_status}`);
    console.log(`   e2e_test_status: ${us.e2e_test_status || 'null'}\n`);
  });

  const bothPassing = userStories.filter(us => 
    us.validation_status === 'validated' && us.e2e_test_status === 'passing'
  );

  console.log(`\nBug Analysis:`);
  console.log(`Total user stories: ${userStories.length}`);
  console.log(`validation_status = 'validated': ${userStories.filter(us => us.validation_status === 'validated').length}`);
  console.log(`e2e_test_status = 'passing': ${userStories.filter(us => us.e2e_test_status === 'passing').length}`);
  console.log(`BOTH conditions met: ${bothPassing.length}`);
  console.log(`\n❌ RPC function requires BOTH conditions, but only validation_status is set!`);
}

checkE2EStatus().catch(console.error);
