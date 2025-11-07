#!/usr/bin/env node

/**
 * Generate User Stories for SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Context: PLAN phase - Auto-generate user stories from PRD
 * Uses: auto-trigger-stories module (Product Requirements Expert)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('\n🚀 User Story Auto-Generation');
  console.log('═'.repeat(70));
  console.log('SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('PRD: PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('═'.repeat(70));

  const result = await autoTriggerStories(
    supabase,
    'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001',
    'PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001',
    {
      skipIfExists: false,  // Generate even if stories exist (will skip duplicates)
      notifyOnSkip: true,
      logExecution: true
    }
  );

  console.log('\n' + '═'.repeat(70));
  console.log('📊 Generation Summary');
  console.log('═'.repeat(70));
  console.log(`\nGenerated: ${result.generated_count || 0} user stories`);
  console.log(`Executed: ${result.executed ? 'Yes' : 'No'}`);

  if (result.errors && result.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${result.errors.length}`);
    result.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  }

  console.log('\n' + '═'.repeat(70));
  console.log('✅ User story generation complete!\n');
  console.log('📝 Next steps:');
  console.log('1. Verify user stories in database');
  console.log('2. Apply automated PRD enrichment (v4.3.0)');
  console.log('3. Document testing strategy');
  console.log('4. Create PLAN→EXEC handoff');
  console.log('═'.repeat(70));
}

main().catch(console.error);
