#!/usr/bin/env node

/**
 * Generate User Stories from PRDs using Auto-Trigger
 *
 * Uses the fixed auto-trigger-stories module to generate user stories
 * from PRD functional requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function generateUserStories(sdId, prdId) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Generating User Stories: ${sdId}`);
  console.log('═'.repeat(70));

  const result = await autoTriggerStories(supabase, sdId, prdId, {
    skipIfExists: false,  // Generate even if stories exist (will skip duplicates)
    notifyOnSkip: true,
    logExecution: true
  });

  return result;
}

async function main() {
  console.log('\n🚀 User Story Auto-Generation');
  console.log('═'.repeat(70));
  console.log('Using fixed auto-trigger-stories module\n');

  // Generate for SD-CICD-WORKFLOW-FIX
  const result1 = await generateUserStories(
    'SD-CICD-WORKFLOW-FIX',
    'PRD-SD-CICD-WORKFLOW-FIX'
  );

  // Generate for SD-VWC-A11Y-002
  const result2 = await generateUserStories(
    'SD-VWC-A11Y-002',
    'PRD-SD-VWC-A11Y-002'
  );

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 Generation Summary');
  console.log('═'.repeat(70));
  console.log(`\nSD-CICD-WORKFLOW-FIX:`);
  console.log(`   Generated: ${result1.generated_count || 0} user stories`);
  console.log(`   Executed: ${result1.executed ? 'Yes' : 'No'}`);

  console.log(`\nSD-VWC-A11Y-002:`);
  console.log(`   Generated: ${result2.generated_count || 0} user stories`);
  console.log(`   Executed: ${result2.executed ? 'Yes' : 'No'}`);

  console.log('\n' + '═'.repeat(70));
  console.log('✅ User story generation complete!\n');
  console.log('📝 Next steps:');
  console.log('1. Verify user stories in database');
  console.log('2. Retry PLAN→EXEC handoffs');
  console.log('3. Begin EXEC phase implementation');
  console.log('═'.repeat(70));
}

main().catch(console.error);
