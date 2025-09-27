#!/usr/bin/env node

/**
 * Universal PRD Generator Template
 * Replaces all SD-specific PRD generation scripts
 * Usage: node templates/generate-prd.js [SD-ID] [--force]
 */

import LEOProtocolOrchestrator from '../scripts/leo-protocol-orchestrator.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class UniversalPRDGenerator {
  constructor() {
    this.orchestrator = new LEOProtocolOrchestrator();
  }

  async generatePRD(sdId, options = {}) {
    console.log(chalk.blue.bold(`\n📐 Universal PRD Generator for ${sdId}\n`));
    console.log(chalk.cyan('Following CLAUDE.md consolidated SD guidelines'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // 1. Get SD details
      const { data: sd, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found`);
      }

      console.log(chalk.green(`\n✅ Found SD: ${sd.title}`));
      console.log(`   Status: ${sd.status}`);
      console.log(`   Priority: ${sd.priority}`);
      console.log(`   Current Phase: ${sd.current_phase || 'N/A'}`);

      // 2. Check if PRD already exists
      const { data: existingPrd } = await supabase
        .from('product_requirements_v2')
        .select('id, title, created_at')
        .eq('directive_id', sdId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingPrd && !options.force) {
        console.log(chalk.yellow(`\n⚠️  PRD already exists:`));
        console.log(`   ID: ${existingPrd.id}`);
        console.log(`   Title: ${existingPrd.title}`);
        console.log(`   Created: ${new Date(existingPrd.created_at).toLocaleString()}`);
        console.log(chalk.cyan('\n   Use --force to regenerate'));
        return existingPrd;
      }

      // 3. Check if this is a consolidated SD
      console.log(chalk.cyan('\n🔍 Checking for consolidated backlog items...'));
      const isConsolidated = await this.orchestrator.isConsolidatedSD(sdId);

      if (isConsolidated) {
        console.log(chalk.green('✅ This is a consolidated SD'));

        // Fetch backlog items
        const backlogItems = await this.orchestrator.fetchBacklogItems(sdId);
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
      } else {
        console.log(chalk.yellow('⚠️  Regular SD (no backlog items)'));
      }

      // 4. Generate PRD
      console.log(chalk.cyan('\n📝 Generating PRD...'));
      const prd = await this.orchestrator.generatePRD(sd);

      // 5. Save PRD to database
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

      // 6. Parse and verify content
      const content = JSON.parse(savedPrd.content);
      console.log(chalk.cyan('\n📋 PRD Contents:'));
      console.log(`   User Stories: ${content.user_stories?.length || 0}`);
      console.log(`   Has Backlog Evidence: ${!!content.backlog_evidence}`);
      console.log(`   Is Consolidated: ${content.metadata?.is_consolidated || false}`);

      if (content.user_stories?.length > 0) {
        const priorities = {};
        content.user_stories.forEach(story => {
          priorities[story.priority] = (priorities[story.priority] || 0) + 1;
        });
        console.log(chalk.yellow('\n   Priority Distribution:'));
        Object.entries(priorities).forEach(([p, count]) => {
          console.log(`     ${p}: ${count} stories`);
        });
      }

      console.log(chalk.green('\n✅ PRD Generation Complete!'));
      return savedPrd;

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.error(error);
      process.exit(1);
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new UniversalPRDGenerator();
  const sdId = process.argv[2];
  const force = process.argv.includes('--force');

  if (!sdId) {
    console.error(chalk.red('Usage: node templates/generate-prd.js <SD-ID> [--force]'));
    console.error('Examples:');
    console.error('  node templates/generate-prd.js SD-008');
    console.error('  node templates/generate-prd.js SD-009 --force');
    process.exit(1);
  }

  generator.generatePRD(sdId, { force })
    .then(() => {
      console.log(chalk.green.bold('\n✨ Done!\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}

export default UniversalPRDGenerator;