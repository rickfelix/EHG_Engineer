#!/usr/bin/env node

/**
 * Generate User Stories for SD-VISION-V2-003
 *
 * Generates comprehensive user stories based on the PRD functional requirements:
 * 1. Venture State Machine
 * 2. Stage State Machine
 * 3. Task Dispatch System
 * 4. Event Bus System
 * 5. Token Budget Enforcement
 * 6. Feedback Dependency Graph
 * 7. Pivot Engine
 * 8. Assumption Propagation
 * 9. Graceful Degradation
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

async function main() {
  console.log('\n🚀 Generating User Stories for SD-VISION-V2-003');
  console.log('═'.repeat(70));

  const supabase = await createSupabaseServiceClient();

  const sdId = 'SD-VISION-V2-003';
  const prdId = 'PRD-SD-VISION-V2-003';

  console.log(`SD ID: ${sdId}`);
  console.log(`PRD ID: ${prdId}`);
  console.log('');

  const result = await autoTriggerStories(supabase, sdId, prdId, {
    skipIfExists: false,
    notifyOnSkip: true,
    logExecution: true
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📊 Generation Results');
  console.log('═'.repeat(70));
  console.log(`Generated: ${result.generated_count || 0} user stories`);
  console.log(`Executed: ${result.executed ? 'Yes' : 'No'}`);

  if (result.errors && result.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    result.errors.forEach(err => console.log(`   - ${err}`));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('✅ User story generation complete!');
  console.log('═'.repeat(70));
}

main().catch(console.error);
