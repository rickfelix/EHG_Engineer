#!/usr/bin/env node

/**
 * Test Cross-SD Backlog Utilization
 * Demonstrates how PLAN agents can utilize backlog items from other SDs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { CrossSDBacklogManager } from './cross-sd-backlog-manager.js';
import chalk from 'chalk';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testCrossSDUtilization() {
  console.log(chalk.cyan('\n🎯 CROSS-SD BACKLOG UTILIZATION TEST'));
  console.log(chalk.cyan('═'.repeat(60)));

  const manager = new CrossSDBacklogManager('PLAN');

  // Scenario: SD-011 (GTM Core) wants to use SD-040's feasibility study
  console.log(chalk.yellow('\n📖 Scenario:'));
  console.log('SD-011 (GTM Core) needs the feasibility study from SD-040');
  console.log('Instead of duplicating work, SD-011 will request to utilize it\n');

  // Set context as PLAN agent working on SD-011
  manager.setContext('SD-011', 'PRD-SD-011');

  // Step 1: Search for GTM feasibility items across all SDs
  console.log(chalk.blue('\n1️⃣  Searching for GTM feasibility items...'));
  const feasibilityItems = await manager.searchBacklogItems('feasibility', {
    excludeCompleted: true
  });

  // Step 2: Check if SD-040's feasibility item is completed
  const sd040Item = feasibilityItems.find(i => i.sd_id === 'SD-040');
  if (sd040Item) {
    console.log(chalk.blue('\n2️⃣  Checking completion status of SD-040 feasibility item...'));
    const completion = await manager.checkIfCompleted(sd040Item.backlog_id);

    if (!completion) {
      // Step 3: Request to utilize the item
      console.log(chalk.blue('\n3️⃣  Requesting cross-SD utilization...'));
      const requestId = await manager.requestUtilization(
        'SD-040',
        sd040Item.backlog_id,
        'IMPLEMENT',
        'SD-011 needs GTM feasibility study as prerequisite for core GTM implementation. Will implement on behalf of SD-040 and share results.'
      );

      if (requestId) {
        console.log(chalk.green(`✅ Request created: ${requestId}`));

        // Step 4: Simulate implementation and mark as completed
        console.log(chalk.blue('\n4️⃣  Simulating implementation...'));
        console.log(chalk.gray('   [PLAN agent implements feasibility study]'));
        console.log(chalk.gray('   [Creates documentation and analysis]'));
        console.log(chalk.gray('   [Runs validation checks]'));

        // Mark item as completed
        const completionId = await manager.markCompleted(
          sd040Item.backlog_id,
          'SD-040',
          'SHARED',
          {
            implementation: 'Feasibility study completed',
            location: '/docs/gtm-feasibility-study.md',
            findings: {
              feasible: true,
              requirements: ['LLM API', 'Marketing APIs', 'Analytics'],
              estimated_effort: '3 sprints'
            }
          }
        );

        if (completionId) {
          console.log(chalk.green(`✅ Item marked as completed: ${completionId}`));
          console.log(chalk.green('✅ SD-040 has been notified of completion'));
        }
      }
    } else {
      console.log(chalk.yellow('⚠️  Item already completed, can reference existing work'));
    }
  }

  // Step 5: Find similar items to avoid duplication
  console.log(chalk.blue('\n5️⃣  Checking for similar items to prevent duplication...'));

  // Get a GTM item from SD-011
  const { data: sd011Items } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, backlog_title')
    .eq('sd_id', 'SD-011')
    .limit(1);

  if (sd011Items && sd011Items.length > 0) {
    const similar = await manager.findSimilarItems(sd011Items[0].backlog_id, 40);

    if (similar.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${similar.length} similar items that might be duplicates`));
      console.log(chalk.yellow('Recommendation: Consider consolidating or sharing implementation'));
    }
  }

  // Step 6: Generate utilization report
  console.log(chalk.blue('\n6️⃣  Generating utilization report for SD-011...'));
  await manager.getUtilizationReport();

  // Demonstrate approval workflow (for LEAD)
  console.log(chalk.magenta('\n7️⃣  LEAD Agent: Checking pending requests...'));
  const pendingRequests = await manager.getPendingRequests();

  if (pendingRequests.length > 0) {
    console.log(chalk.magenta(`\n👤 LEAD: Approving first pending request...`));
    await manager.approveUtilization(pendingRequests[0].id, 'LEAD');
  }

  console.log(chalk.green('\n✅ Cross-SD Utilization Test Complete!'));

  // Summary
  console.log(chalk.cyan('\n📊 BENEFITS DEMONSTRATED:'));
  console.log('✅ Prevented duplicate implementation of feasibility study');
  console.log('✅ SD-040 gets credit for completed item');
  console.log('✅ SD-011 can proceed with dependencies met');
  console.log('✅ Both SDs benefit from shared work');
  console.log('✅ Intelligent cross-SD collaboration enabled');

  // Show how this prevents the GTM overlap issue
  console.log(chalk.cyan('\n🎯 GTM OVERLAP SOLUTION:'));
  console.log('Instead of SD-011, SD-040, and SD-042 all implementing GTM independently:');
  console.log('  1. SD-040 completes feasibility (or SD-011 does it for them)');
  console.log('  2. SD-011 implements core GTM using feasibility results');
  console.log('  3. SD-042 enhances existing GTM instead of duplicating');
  console.log('  4. All SDs share components and avoid conflicts');
}

// Run the test
testCrossSDUtilization().catch(error => {
  console.error(chalk.red(`\n❌ Test failed: ${error.message}`));
  process.exit(1);
});