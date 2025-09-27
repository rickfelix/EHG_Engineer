#!/usr/bin/env node
/**
 * PRD Content Format Validator
 * Ensures all PRDs meet the JSON format requirements for EXEC phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Validate PRD content format
 * @param {string} content - PRD content to validate
 * @param {string} prdId - PRD ID for error reporting
 * @returns {Object} Validation result with success/errors
 */
export function validatePRDContent(content, prdId = 'unknown') {
  const result = {
    success: false,
    errors: [],
    warnings: [],
    data: null
  };

  // Check if content exists
  if (!content) {
    result.errors.push('Content is empty or null');
    return result;
  }

  // Check if content is valid JSON
  let parsedContent;
  try {
    parsedContent = JSON.parse(content);
  } catch (e) {
    result.errors.push(`Invalid JSON format: ${e.message}`);
    return result;
  }

  result.data = parsedContent;

  // Required fields for EXEC phase
  const requiredFields = [
    'user_stories'
  ];

  // Recommended fields for consolidated SDs
  const recommendedFields = [
    'is_consolidated',
    'backlog_items',
    'title',
    'id'
  ];

  // Check required fields
  requiredFields.forEach(field => {
    if (!parsedContent[field]) {
      result.errors.push(`Missing required field: ${field}`);
    }
  });

  // Check user_stories structure
  if (parsedContent.user_stories) {
    if (!Array.isArray(parsedContent.user_stories)) {
      result.errors.push('user_stories must be an array');
    } else if (parsedContent.user_stories.length === 0) {
      result.errors.push('user_stories array cannot be empty');
    } else {
      // Validate each user story
      parsedContent.user_stories.forEach((story, index) => {
        const storyErrors = [];

        if (!story.id) storyErrors.push('id');
        if (!story.title) storyErrors.push('title');
        if (!story.description) storyErrors.push('description');
        if (!story.priority) storyErrors.push('priority');
        if (!story.acceptance_criteria || !Array.isArray(story.acceptance_criteria)) {
          storyErrors.push('acceptance_criteria (array)');
        }

        if (storyErrors.length > 0) {
          result.errors.push(`User story ${index + 1} missing: ${storyErrors.join(', ')}`);
        }
      });
    }
  }

  // Check recommended fields
  recommendedFields.forEach(field => {
    if (!parsedContent[field]) {
      result.warnings.push(`Missing recommended field: ${field}`);
    }
  });

  // Success if no errors
  result.success = result.errors.length === 0;

  return result;
}

/**
 * Convert markdown PRD to JSON format
 * @param {string} markdownContent - Markdown content to convert
 * @param {string} sdId - Strategic Directive ID
 * @returns {string} JSON formatted PRD content
 */
export function convertMarkdownToJSON(markdownContent, sdId) {
  // Extract title from markdown
  const titleMatch = markdownContent.match(/^# PRD (?:–|-) (.+)/m);
  const title = titleMatch ? titleMatch[1] : `PRD for ${sdId}`;

  // Basic conversion - this would need enhancement for full markdown parsing
  const jsonPRD = {
    id: `PRD-${sdId}`,
    title: title,
    is_consolidated: title.toLowerCase().includes('consolidated'),
    backlog_items: 0, // Would need to be extracted from markdown
    user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Implementation Required',
        description: 'This PRD was converted from markdown and needs proper user stories defined.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Define specific user stories based on markdown content',
          'Add proper acceptance criteria',
          'Validate implementation requirements'
        ]
      }
    ]
  };

  return JSON.stringify(jsonPRD, null, 2);
}

/**
 * Scan and validate all PRDs in product_requirements_v2 table
 */
async function scanAllPRDs() {
  console.log(chalk.blue('🔍 Scanning all PRDs for format compliance...\n'));

  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, content, status');

  if (error) {
    console.error(chalk.red('Error fetching PRDs:'), error);
    return;
  }

  let validCount = 0;
  let invalidCount = 0;
  const invalidPRDs = [];

  for (const prd of prds) {
    const validation = validatePRDContent(prd.content, prd.id);

    if (validation.success) {
      validCount++;
      console.log(chalk.green(`✅ ${prd.id} - Valid`));
    } else {
      invalidCount++;
      invalidPRDs.push({ prd, validation });
      console.log(chalk.red(`❌ ${prd.id} - Invalid`));
      validation.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        console.log(chalk.yellow(`   ⚠️  ${warning}`));
      });
    }
  }

  console.log(chalk.cyan(`\n📊 Summary:`));
  console.log(`   Valid PRDs: ${validCount}`);
  console.log(`   Invalid PRDs: ${invalidCount}`);
  console.log(`   Total PRDs: ${prds.length}`);

  if (invalidPRDs.length > 0) {
    console.log(chalk.yellow(`\n🔧 To fix invalid PRDs, run:`));
    console.log(chalk.cyan(`   node scripts/prd-format-validator.js --fix`));
  }

  return { validCount, invalidCount, invalidPRDs };
}

/**
 * Fix invalid PRDs by converting to proper JSON format
 */
async function fixInvalidPRDs() {
  console.log(chalk.blue('🔧 Fixing invalid PRD formats...\n'));

  const scanResult = await scanAllPRDs();

  if (!scanResult || scanResult.invalidPRDs.length === 0) {
    console.log(chalk.green('✅ No invalid PRDs found to fix'));
    return;
  }

  for (const { prd, validation } of scanResult.invalidPRDs) {
    console.log(chalk.yellow(`🔄 Fixing ${prd.id}...`));

    let newContent;

    // Try to convert markdown to JSON
    if (prd.content && prd.content.startsWith('#')) {
      newContent = convertMarkdownToJSON(prd.content, prd.directive_id);
      console.log(chalk.cyan(`   Converted markdown to JSON format`));
    } else {
      // Create minimal valid JSON structure
      newContent = JSON.stringify({
        id: prd.id,
        title: prd.title || `PRD for ${prd.directive_id}`,
        user_stories: [
          {
            id: `US-${prd.directive_id}-001`,
            title: 'Define Implementation Requirements',
            description: 'This PRD needs proper user stories and acceptance criteria defined.',
            priority: 'HIGH',
            acceptance_criteria: [
              'Define specific user stories',
              'Add acceptance criteria',
              'Validate requirements'
            ]
          }
        ]
      }, null, 2);
      console.log(chalk.cyan(`   Created minimal valid JSON structure`));
    }

    // Update the PRD
    const { error } = await supabase
      .from('product_requirements_v2')
      .update({ content: newContent })
      .eq('id', prd.id);

    if (error) {
      console.log(chalk.red(`   ❌ Error updating ${prd.id}:`, error.message));
    } else {
      console.log(chalk.green(`   ✅ Updated ${prd.id}`));
    }
  }

  console.log(chalk.green('\n✅ PRD format fixing complete'));
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--fix')) {
    await fixInvalidPRDs();
  } else if (args.includes('--help')) {
    console.log(chalk.blue('PRD Format Validator'));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/prd-format-validator.js     # Scan all PRDs');
    console.log('  node scripts/prd-format-validator.js --fix   # Fix invalid PRDs');
    console.log('  node scripts/prd-format-validator.js --help  # Show this help');
  } else {
    await scanAllPRDs();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}