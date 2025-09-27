#!/usr/bin/env node

import LEOProtocolOrchestrator from './leo-protocol-orchestrator.js';
import chalk from 'chalk';

const orchestrator = new LEOProtocolOrchestrator();

// Test PRD generation for SD-008
async function testPRDGeneration() {
  try {
    console.log(chalk.blue('\n🧪 Testing PRD generation for SD-008 (Consolidated SD)...'));

    // Get SD details
    const { data: sd } = await orchestrator.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-008')
      .single();

    if (!sd) {
      throw new Error('SD-008 not found');
    }

    console.log(chalk.green(`\n✅ Found SD: ${sd.title}`));
    console.log(`   Status: ${sd.status}`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   Item Count (metadata): ${sd.metadata?.item_count || 'N/A'}`);

    // Generate PRD
    console.log(chalk.cyan('\n🔄 Generating PRD...'));
    const prd = await orchestrator.generatePRD(sd);

    // Parse and display PRD content
    const content = JSON.parse(prd.content);

    console.log(chalk.green('\n✅ PRD Generated Successfully:'));
    console.log(`   Title: ${prd.title}`);
    console.log(`   ID: ${prd.id}`);
    console.log(`   Is Consolidated: ${prd.metadata.is_consolidated}`);
    console.log(`   Backlog Items in Metadata: ${prd.metadata.backlog_items?.length || 0}`);

    console.log(chalk.cyan(`\n📋 User Stories Generated: ${content.user_stories.length}`));

    // Show first few stories
    console.log(chalk.yellow('\n📝 Sample User Stories:'));
    content.user_stories.slice(0, 5).forEach(story => {
      console.log(`\n   ${story.id}: ${story.title}`);
      console.log(`   Priority: ${story.priority}`);
      if (story.metadata?.backlog_id) {
        console.log(`   Backlog ID: ${story.metadata.backlog_id}`);
        console.log(`   Stage: ${story.metadata.stage}`);
        console.log(`   Category: ${story.metadata.category}`);
      }
      console.log(`   Acceptance Criteria: ${story.acceptance_criteria.length} items`);
    });

    // Check backlog evidence
    if (content.backlog_evidence) {
      console.log(chalk.green('\n✅ Backlog Evidence Included:'));
      const ids = Object.keys(content.backlog_evidence);
      console.log(`   Evidence for ${ids.length} items`);
      console.log(`   Backlog IDs: ${ids.join(', ')}`);

      // Show sample evidence
      const firstId = ids[0];
      if (firstId) {
        const evidence = content.backlog_evidence[firstId];
        console.log(chalk.yellow(`\n📄 Sample Evidence (${firstId}):`));
        console.log(`   Title: ${evidence.title}`);
        console.log(`   Priority: ${evidence.priority}`);
        console.log(`   Category: ${evidence.category}`);
        console.log(`   Description: ${evidence.description.substring(0, 100)}...`);
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No backlog evidence found'));
    }

    // Validation
    console.log(chalk.cyan('\n✔️  Validation:'));
    const expectedCount = sd.metadata?.item_count || 10;
    const actualCount = content.user_stories.length;
    if (actualCount === expectedCount) {
      console.log(chalk.green(`   ✅ Story count matches: ${actualCount} === ${expectedCount}`));
    } else {
      console.log(chalk.red(`   ❌ Story count mismatch: ${actualCount} !== ${expectedCount}`));
    }

    // Check priority mapping
    const priorityCount = {};
    content.user_stories.forEach(story => {
      priorityCount[story.priority] = (priorityCount[story.priority] || 0) + 1;
    });
    console.log(`   Priority Distribution:`, priorityCount);

    console.log(chalk.green('\n✅ Test completed successfully!'));

  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error.message);
    console.error(error);
  }
}

// Run test
testPRDGeneration().then(() => process.exit(0)).catch(() => process.exit(1));