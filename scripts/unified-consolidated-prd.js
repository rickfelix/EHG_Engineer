#!/usr/bin/env node
/**
 * Unified Consolidated Strategic Directive PRD Generator
 * Ensures consistent PRD creation for consolidated SDs with proper JSON format
 */

import { createClient } from '@supabase/supabase-js';
import { program } from 'commander';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { validatePRDContent } from './prd-format-validator.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

program
  .argument('<sd-id>', 'Strategic Directive ID (e.g., SD-022)')
  .option('--force', 'Overwrite existing PRD')
  .option('--validate-only', 'Only validate existing PRD without creating new one')
  .parse();

const sdId = program.args[0];
const options = program.opts();

/**
 * Fetch Strategic Directive and its backlog items
 */
async function fetchSDWithBacklog(sdId) {
  console.log(chalk.blue(`🔍 Fetching SD ${sdId} and backlog items...`));

  // Get the Strategic Directive
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    throw new Error(`Strategic Directive ${sdId} not found: ${sdError?.message}`);
  }

  console.log(chalk.green(`✅ Found SD: ${sd.title}`));
  console.log(`   Status: ${sd.status}`);
  console.log(`   Priority: ${sd.priority}`);

  // Check if it's consolidated
  const isConsolidated = sd.title?.toLowerCase().includes('consolidated') ||
                        sd.metadata?.is_consolidated;

  if (!isConsolidated) {
    console.log(chalk.yellow(`⚠️  Warning: ${sdId} may not be a consolidated SD`));
  }

  // Fetch backlog items for consolidated SDs
  let backlogItems = [];
  if (isConsolidated) {
    const { data: items, error: _itemsError } = await supabase
      .from('consolidated_backlog_v3')
      .select('*')
      .eq('sd_id', sdId)
      .order('priority_score', { ascending: false });

    if (items) {
      backlogItems = items;
      console.log(chalk.cyan(`📋 Found ${items.length} backlog items`));
    }
  }

  return { sd, backlogItems, isConsolidated };
}

/**
 * Generate user stories from backlog items
 */
function generateUserStories(sdId, backlogItems) {
  const priorityMap = {
    'Very High': 'CRITICAL',
    'High': 'HIGH',
    'Medium': 'MEDIUM',
    'Low': 'LOW',
    'Very Low': 'LOW'
  };

  return backlogItems.slice(0, 10).map((item, index) => {
    const storyId = `US-${sdId}-${String(index + 1).padStart(3, '0')}`;
    const priority = priorityMap[item.priority] || 'MEDIUM';

    // Generate acceptance criteria based on item description
    const acceptanceCriteria = [
      `Implement ${item.backlog_title.toLowerCase()}`,
      'Integrate with existing EHG platform architecture',
      'Ensure scalable and maintainable code structure',
      'Add comprehensive test coverage',
      'Document implementation approach'
    ];

    // Add specific criteria based on category
    if (item.extras?.Category) {
      const category = item.extras.Category;
      if (category.includes('Intelligence') || category.includes('Research')) {
        acceptanceCriteria.push('Implement data collection and analysis features');
      }
      if (category.includes('Platform') || category.includes('Architecture')) {
        acceptanceCriteria.push('Ensure system performance and reliability');
      }
      if (category.includes('Integration')) {
        acceptanceCriteria.push('Validate API integrations and data flows');
      }
    }

    return {
      id: storyId,
      title: item.backlog_title,
      description: item.description_raw || item.extras?.Description_1 ||
                  `Implement ${item.backlog_title} as part of the consolidated strategic directive.`,
      priority: priority,
      backlog_id: item.backlog_id?.toString(),
      category: item.extras?.Category || 'General',
      stage: item.stage_number || null,
      acceptance_criteria: acceptanceCriteria.slice(0, 5), // Limit to 5 criteria
      metadata: {
        backlog_id: item.backlog_id,
        original_priority: item.priority,
        category: item.extras?.Category,
        stage_number: item.stage_number
      }
    };
  });
}

/**
 * Create properly formatted JSON PRD content
 */
function createPRDContent(sd, backlogItems, userStories) {
  const priorityDistribution = userStories.reduce((acc, story) => {
    acc[story.priority] = (acc[story.priority] || 0) + 1;
    return acc;
  }, {});

  return {
    id: `PRD-${sd.id}`,
    title: sd.title,
    strategic_directive_id: sd.id,
    is_consolidated: true,
    backlog_items: backlogItems.length,
    priority_distribution: priorityDistribution,
    user_stories: userStories,
    metadata: {
      sd_status: sd.status,
      sd_priority: sd.priority,
      generation_timestamp: new Date().toISOString(),
      backlog_evidence: backlogItems.map(item => ({
        backlog_id: item.backlog_id,
        title: item.backlog_title,
        priority: item.priority,
        category: item.extras?.Category
      }))
    },
    implementation_notes: {
      target_application: '../ehg/',
      framework: 'Vite + React + Shadcn + TypeScript',
      database: 'liapbndqlqxdcgpwntbv (Supabase)',
      github_repo: 'https://github.com/rickfelix/ehg.git'
    }
  };
}

/**
 * Main PRD generation function
 */
async function generateConsolidatedPRD(sdId, force = false) {
  try {
    // Check if PRD already exists
    const { data: existingPRD } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId)
      .single();

    if (existingPRD && !force) {
      console.log(chalk.yellow(`⚠️  PRD already exists for ${sdId}`));
      console.log(chalk.cyan('   Use --force to overwrite or --validate-only to check format'));
      return existingPRD;
    }

    // Fetch SD and backlog data
    const { sd, backlogItems, isConsolidated: _isConsolidated } = await fetchSDWithBacklog(sdId);

    // Generate user stories
    const userStories = generateUserStories(sdId, backlogItems);
    console.log(chalk.cyan(`📝 Generated ${userStories.length} user stories`));

    // Create PRD content
    const prdContent = createPRDContent(sd, backlogItems, userStories);
    const contentString = JSON.stringify(prdContent, null, 2);

    // Validate the content
    const validation = validatePRDContent(contentString, `PRD-${sdId}`);
    if (!validation.success) {
      console.log(chalk.red('❌ Generated PRD failed validation:'));
      validation.errors.forEach(error => console.log(chalk.red(`   • ${error}`)));
      throw new Error('PRD validation failed');
    }

    console.log(chalk.green('✅ PRD content validation passed'));

    // Save or update PRD
    const prdData = {
      id: `PRD-${sdId}`,
      directive_id: sdId,
      title: sd.title,
      status: 'planning',
      category: 'consolidated',
      priority: sd.priority || 'high',
      executive_summary: `Consolidated strategic directive PRD for ${sd.title} with ${backlogItems.length} backlog items.`,
      content: contentString,
      metadata: {
        is_consolidated: true,
        backlog_items: backlogItems.length,
        user_stories_count: userStories.length
      },
      created_by: 'UNIFIED_WORKFLOW',
      updated_at: new Date().toISOString()
    };

    let result;
    if (existingPRD && force) {
      // Update existing PRD
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prdData)
        .eq('directive_id', sdId)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(chalk.green(`✅ Updated existing PRD for ${sdId}`));
    } else {
      // Create new PRD
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert(prdData)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(chalk.green(`✅ Created new PRD for ${sdId}`));
    }

    // Display summary
    console.log(chalk.cyan('\n📊 PRD Summary:'));
    console.log(`   ID: ${result.id}`);
    console.log(`   User Stories: ${userStories.length}`);
    console.log(`   Backlog Items: ${backlogItems.length}`);
    console.log('   Priority Distribution:', priorityDistribution);

    return result;

  } catch (_error) {
    console.error(chalk.red('❌ Error generating consolidated PRD:'), error.message);
    throw error;
  }
}

/**
 * Validate existing PRD
 */
async function validateExistingPRD(sdId) {
  console.log(chalk.blue(`🔍 Validating existing PRD for ${sdId}...`));

  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sdId)
    .single();

  if (error || !prd) {
    console.log(chalk.red(`❌ No PRD found for ${sdId}`));
    return false;
  }

  const validation = validatePRDContent(prd.content, prd.id);

  if (validation.success) {
    console.log(chalk.green(`✅ PRD ${prd.id} is valid`));
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('⚠️  Warnings:'));
      validation.warnings.forEach(warning => console.log(chalk.yellow(`   • ${warning}`)));
    }
  } else {
    console.log(chalk.red(`❌ PRD ${prd.id} is invalid`));
    validation.errors.forEach(error => console.log(chalk.red(`   • ${error}`)));
  }

  return validation.success;
}

// Main execution
async function main() {
  try {
    if (options.validateOnly) {
      await validateExistingPRD(sdId);
    } else {
      await generateConsolidatedPRD(sdId, options.force);
    }
  } catch (_error) {
    console.error(chalk.red('Script failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}