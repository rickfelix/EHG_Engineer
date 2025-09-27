#!/usr/bin/env node

/**
 * Execute PLAN Phase for SD-008
 * Focused execution following CLAUDE.md consolidated SD guidelines
 */

import LEOProtocolOrchestrator from './leo-protocol-orchestrator.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executePlanPhaseSD008() {
  console.log(chalk.blue.bold('\n🚀 Executing PLAN Phase for SD-008\n'));
  console.log(chalk.cyan('Following CLAUDE.md Consolidated SD Guidelines'));
  console.log(chalk.gray('─'.repeat(60)));

  try {
    // 1. Verify SD-008 status
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-008')
      .single();

    if (sdError || !sd) {
      throw new Error('SD-008 not found');
    }

    console.log(chalk.green('\n✅ Found SD-008:'));
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Current Phase: ${sd.current_phase || 'N/A'}`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   Item Count: ${sd.metadata?.item_count || 0}`);

    // 2. Check if PRD already exists
    const { data: existingPrd } = await supabase
      .from('product_requirements_v2')
      .select('id, title, created_at')
      .eq('directive_id', 'SD-008')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingPrd) {
      console.log(chalk.yellow(`\n⚠️  PRD already exists:`));
      console.log(`   ID: ${existingPrd.id}`);
      console.log(`   Title: ${existingPrd.title}`);
      console.log(`   Created: ${new Date(existingPrd.created_at).toLocaleString()}`);
      console.log(chalk.yellow('\n   Regenerating PRD with latest backlog data...'));
    }

    // 3. Initialize orchestrator
    const orchestrator = new LEOProtocolOrchestrator();

    // 4. Check if this is a consolidated SD
    console.log(chalk.cyan('\n🔍 Checking for consolidated backlog items...'));
    const isConsolidated = await orchestrator.isConsolidatedSD('SD-008');

    if (isConsolidated) {
      console.log(chalk.green('✅ This is a consolidated SD'));

      // Fetch backlog items
      const backlogItems = await orchestrator.fetchBacklogItems('SD-008');
      console.log(chalk.green(`✅ Found ${backlogItems.length} backlog items`));

      // Show summary
      const priorities = {};
      const categories = {};

      backlogItems.forEach(item => {
        priorities[item.priority] = (priorities[item.priority] || 0) + 1;
        const category = item.extras?.Category || 'Uncategorized';
        categories[category] = (categories[category] || 0) + 1;
      });

      console.log(chalk.cyan('\n📊 Backlog Summary:'));
      console.log('   Priorities:', JSON.stringify(priorities, null, 2));
      console.log('   Categories:', JSON.stringify(categories, null, 2));
    }

    // 5. Generate PRD (following consolidated SD process)
    console.log(chalk.cyan('\n📝 Generating PRD with backlog items...'));
    const prd = await orchestrator.generatePRD(sd);

    // 6. Save PRD to database
    const { data: savedPrd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .insert({
        ...prd,
        directive_id: prd.strategic_directive_id
      })
      .select()
      .single();

    if (prdError) {
      // Try update if insert fails
      if (prdError.code === '23505') {
        console.log(chalk.yellow('   PRD exists, updating...'));
        const { data: updatedPrd, error: updateError } = await supabase
          .from('product_requirements_v2')
          .update({
            content: prd.content,
            updated_at: new Date().toISOString(),
            metadata: prd.metadata
          })
          .eq('id', prd.id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        savedPrd = updatedPrd;
      } else {
        throw prdError;
      }
    }

    console.log(chalk.green('\n✅ PRD created successfully:'));
    console.log(`   ID: ${savedPrd.id}`);
    console.log(`   Title: ${savedPrd.title}`);

    // 7. Parse and verify content
    const content = JSON.parse(savedPrd.content);
    console.log(chalk.cyan('\n📋 PRD Contents:'));
    console.log(`   User Stories: ${content.user_stories.length}`);
    console.log(`   Has Backlog Evidence: ${!!content.backlog_evidence}`);
    console.log(`   Is Consolidated: ${content.metadata?.is_consolidated || false}`);

    // 8. Update SD phase
    await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'PLAN_COMPLETE',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-008');

    console.log(chalk.green('\n✅ PLAN Phase Complete!'));
    console.log(chalk.cyan('\nNext Steps:'));
    console.log('1. Review PRD for completeness');
    console.log('2. Create PLAN→EXEC handoff');
    console.log('3. Begin EXEC phase implementation in /mnt/c/_EHG/ehg/');

    return savedPrd;

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  executePlanPhaseSD008()
    .then(() => {
      console.log(chalk.green.bold('\n✨ Done!\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}