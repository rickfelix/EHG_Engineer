#!/usr/bin/env node

/**
 * Generate User Stories for SD-ARTIFACT-INTEGRATION-001
 *
 * Uses the auto-trigger-stories module to generate user stories
 * from PRD functional requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-ARTIFACT-INTEGRATION-001';
const PRD_ID = 'PRD-SD-ARTIFACT-INTEGRATION-001';

async function main() {
  console.log('\n🚀 User Story Auto-Generation');
  console.log('═'.repeat(70));
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}\n`);

  try {
    const result = await autoTriggerStories(supabase, SD_ID, PRD_ID, {
      skipIfExists: false,  // Generate even if stories exist (will skip duplicates)
      notifyOnSkip: true,
      logExecution: true
    });

    console.log('\n' + '═'.repeat(70));
    console.log('📊 Generation Summary');
    console.log('═'.repeat(70));
    console.log(`\n${SD_ID}:`);
    console.log(`   Generated: ${result.generated_count || 0} user stories`);
    console.log(`   Executed: ${result.executed ? 'Yes' : 'No'}`);
    console.log(`   Skipped: ${result.skipped ? 'Yes' : 'No'}`);

    if (result.skipped) {
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Existing Stories: ${result.existing_stories}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ User story generation complete!\n');
    console.log('📝 Next steps:');
    console.log('1. Verify user stories in database');
    console.log('2. Run PLAN→EXEC handoff: node scripts/handoff.js execute PLAN-TO-EXEC SD-ARTIFACT-INTEGRATION-001');
    console.log('═'.repeat(70));

    return result;
  } catch (error) {
    console.error('\n❌ Error generating user stories:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
