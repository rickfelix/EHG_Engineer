#!/usr/bin/env node
/**
 * Investigate PLAN_verification Progress Bug
 *
 * Issue: get_progress_breakdown() reports user_stories_validated: false
 * Despite: All 9 user stories have validation_status = 'validated'
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sdId = 'SD-RETRO-ENHANCE-001';

async function investigate() {
  console.log('🔍 Investigating PLAN_verification Progress Bug\n');

  // 1. Check user stories validation status
  console.log('1️⃣ User Stories Validation Status:');
  const { data: userStories, error: usError } = await supabase
    .from('user_stories')
    .select('id, title, validation_status, priority')
    .eq('sd_id', sdId)
    .order('priority');

  if (usError) {
    console.error('Error fetching user stories:', usError);
    return;
  }

  console.log(`   Total user stories: ${userStories.length}`);
  const validated = userStories.filter(us => us.validation_status === 'validated');
  console.log(`   Validated: ${validated.length}`);
  console.log(`   Not validated: ${userStories.length - validated.length}\n`);

  userStories.forEach(us => {
    const icon = us.validation_status === 'validated' ? '✅' : '❌';
    console.log(`   ${icon} ${us.id}: ${us.validation_status || 'null'}`);
  });

  // 2. Get progress breakdown from RPC function
  console.log('\n2️⃣ Progress Breakdown from RPC:');
  const { data: progressData, error: progError } = await supabase
    .rpc('get_progress_breakdown', { sd_id_param: sdId });

  if (progError) {
    console.error('Error calling get_progress_breakdown:', progError);
    return;
  }

  console.log('   Progress Data:', JSON.stringify(progressData, null, 2));

  // 3. Check PLAN_verification phase specifically
  if (progressData && progressData.phases) {
    const planVerification = progressData.phases.find(p => p.phase_name === 'PLAN_verification');
    if (planVerification) {
      console.log('\n3️⃣ PLAN_verification Phase Details:');
      console.log('   Status:', planVerification.status);
      console.log('   Progress:', planVerification.progress);
      console.log('   Required items:', planVerification.required_items);
      console.log('   Completed items:', planVerification.completed_items);
      console.log('   Missing items:', planVerification.missing_items);
    }
  }

  // 4. Get RPC function definition
  console.log('\n4️⃣ Checking RPC Function Definition:');
  const { data: rpcDef, error: rpcError } = await supabase
    .rpc('exec_sql', {
      sql_query: `
        SELECT pg_get_functiondef(oid) as definition
        FROM pg_proc
        WHERE proname = 'get_progress_breakdown'
      `
    });

  if (rpcError) {
    console.log('   ⚠️  Could not fetch function definition (expected - RLS restriction)');
    console.log('   Will need to check function logic directly in database');
  } else if (rpcDef && rpcDef.length > 0) {
    console.log('   Function definition found');
  }

  // 5. Manual calculation - what SHOULD be the result?
  console.log('\n5️⃣ Manual Calculation:');
  console.log(`   User stories total: ${userStories.length}`);
  console.log(`   User stories validated: ${validated.length}`);
  console.log(`   Should user_stories_validated be TRUE? ${validated.length === userStories.length ? 'YES' : 'NO'}`);

  if (validated.length === userStories.length && userStories.length > 0) {
    console.log('\n✅ CONCLUSION: All user stories ARE validated');
    console.log('   The RPC function has a bug - it should return user_stories_validated: true');
    console.log('   This is blocking PLAN_verification from showing 15/15 progress');
  } else {
    console.log('\n⚠️  Some user stories are not validated');
    userStories.filter(us => us.validation_status !== 'validated').forEach(us => {
      console.log(`   - ${us.id}: ${us.title} (${us.validation_status || 'null'})`);
    });
  }
}

investigate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
