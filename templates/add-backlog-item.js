#!/usr/bin/env node

/**
 * Universal Backlog Item Template
 * Replaces SD-specific backlog item scripts
 * Usage: node templates/add-backlog-item.js [SD-ID] [--force]
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

class UniversalBacklogItemCreator {
  constructor() {
    this.sdId = null;
    this.sd = null;
  }

  async createBacklogItem(sdId, itemData = {}, options = {}) {
    console.log(chalk.blue.bold(`\n📦 Universal Backlog Item Creator for ${sdId}\n`));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // 1. Validate SD exists
      const { data: sd, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found`);
      }

      this.sd = sd;
      this.sdId = sdId;

      console.log(chalk.green(`✅ Found SD: ${sd.title}`));
      console.log(`   Status: ${sd.status}`);
      console.log(`   Priority: ${sd.priority}`);

      // 2. Check for existing backlog items linked to this SD
      const { data: existingItems, error: mapError } = await supabase
        .from('sd_backlog_map')
        .select('*')
        .eq('sd_id', sdId);

      console.log(chalk.cyan(`\n📊 Existing backlog items: ${existingItems?.length || 0}`));

      // 3. Create backlog item with defaults
      const backlogItem = this.buildBacklogItem(itemData);

      // 4. Add to sd_backlog_map
      console.log(chalk.cyan('\n📝 Creating backlog item in sd_backlog_map...'));

      const { data: createdItem, error: createError } = await supabase
        .from('sd_backlog_map')
        .insert(backlogItem)
        .select()
        .single();

      if (createError) {
        console.log(chalk.red('❌ Error creating backlog item:'));
        console.log(createError.message);

        // Show the structure we tried to insert for debugging
        console.log(chalk.yellow('\n⚠️  Attempted to insert with structure:'));
        console.log(Object.keys(backlogItem));

        throw createError;
      }

      console.log(chalk.green('✅ Backlog item created successfully!'));
      console.log(`   ID: ${createdItem.backlog_id}`);
      console.log(`   Title: ${createdItem.backlog_title}`);
      console.log(`   Priority: ${createdItem.priority}`);

      // 5. Update SD metadata to increment backlog count
      await this.updateSDBacklogCount(sdId, (existingItems?.length || 0) + 1);

      console.log(chalk.cyan('\n✨ Backlog item creation complete!'));

      return createdItem;

    } catch (error) {
      console.error(chalk.red('❌ Error creating backlog item:'), error.message);
      throw error;
    }
  }

  buildBacklogItem(data) {
    const now = new Date().toISOString();

    // Generate unique ID
    const backlogId = data.backlog_id || `BACKLOG-${this.sdId}-${Date.now()}`;

    // Generate UUID for import_run_id
    const uuid = crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });

    return {
      sd_id: this.sdId,
      backlog_id: backlogId,
      backlog_title: data.title || '[Backlog Item Title]',
      description_raw: data.description || 'Backlog item created from template',
      item_description: data.item_description || data.description || 'To be defined',
      my_comments: data.comments || '',
      priority: data.priority || this.sd.priority || 'medium',
      stage_number: data.stage_number || 1,
      phase: data.phase || 'planning',
      new_module: data.new_module || false,
      extras: data.extras || {},
      import_run_id: uuid,
      present_in_latest_import: true,
      item_type: 'story',  // Fixed value required by constraint
      parent_id: data.parent_id || null,
      sequence_no: data.sequence_no || 1,

      // Story fields
      story_key: data.story_key || null,
      story_title: data.story_title || null,
      story_description: data.story_description || null,

      // Verification fields
      verification_status: 'not_run',  // Fixed value required by constraint
      verification_source: null,  // Database shows null is common
      last_verified_at: now,
      coverage_pct: data.coverage_pct || 0,
      test_file_path: data.test_file_path || null,
      acceptance_criteria: data.acceptance_criteria || [],

      // Import tracking
      story_import_run_id: null,

      // Completion tracking
      completion_status: 'NOT_STARTED',
      completed_by_sd: null,
      completed_by_prd: null,
      completion_date: null,
      completion_reference: null,
      utilized_from_sd: this.sdId,
      completion_notes: null
    };
  }

  async updateSDBacklogCount(sdId, newCount) {
    try {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('metadata, total_items, h_count, m_count, l_count')
        .eq('id', sdId)
        .single();

      const metadata = sd?.metadata || {};
      metadata.total_backlog_items = newCount;
      metadata.has_backlog = true;
      metadata.last_backlog_update = new Date().toISOString();

      // Also update the counts that strategic-loaders.js looks for
      const priority = this.sd.priority || 'medium';
      let h_count = sd?.h_count || 0;
      let m_count = sd?.m_count || 0;
      let l_count = sd?.l_count || 0;

      // Increment based on priority
      if (priority === 'critical' || priority === 'high') {
        h_count = newCount;
      } else if (priority === 'medium') {
        m_count = newCount;
      } else {
        l_count = newCount;
      }

      await supabase
        .from('strategic_directives_v2')
        .update({
          metadata,
          total_items: newCount,
          h_count,
          m_count,
          l_count,
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      console.log(chalk.green(`✅ Updated SD backlog count: ${newCount}`));
      console.log(`   High: ${h_count}, Medium: ${m_count}, Low: ${l_count}`);
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Could not update SD backlog count'), error.message);
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(chalk.yellow('\nUsage: node templates/add-backlog-item.js [SD-ID] [options]'));
    console.log('\nOptions:');
    console.log('  --title "Item Title"        Set backlog item title');
    console.log('  --description "Description" Set item description');
    console.log('  --priority HIGH|MEDIUM|LOW  Set priority');
    console.log('\nExample:');
    console.log('  node templates/add-backlog-item.js SD-008 --title "Fix authentication" --priority HIGH');
    process.exit(1);
  }

  const sdId = args[0];

  // Parse options
  const options = {};
  const itemData = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      itemData.title = args[++i];
    } else if (args[i] === '--description' && args[i + 1]) {
      itemData.description = args[++i];
    } else if (args[i] === '--priority' && args[i + 1]) {
      itemData.priority = args[++i].toLowerCase();
    } else if (args[i] === '--force') {
      options.force = true;
    }
  }

  const creator = new UniversalBacklogItemCreator();

  try {
    await creator.createBacklogItem(sdId, itemData, options);
    console.log(chalk.green('\n✅ Success!'));
  } catch (error) {
    console.error(chalk.red('\n❌ Failed:'), error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { UniversalBacklogItemCreator };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}