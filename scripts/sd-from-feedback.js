#!/usr/bin/env node

/**
 * Feedback-to-SD Automation Script
 *
 * Converts triaged feedback items into Strategic Directives.
 * Maps feedback types to appropriate SD types and ensures
 * all required fields are populated.
 *
 * Created as part of SD-UAT-WORKFLOW-001 - UAT-to-SD Workflow Process Improvements
 *
 * Usage:
 *   npm run sd:from-feedback
 *   node scripts/sd-from-feedback.js
 *   node scripts/sd-from-feedback.js --parent SD-PARENT-001
 *
 * @module scripts/sd-from-feedback
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import readline from 'readline';
// SD-LEO-SDKEY-001: Centralized SD key generation
import { generateSDKey } from './modules/sd-key-generator.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Feedback type to SD type mapping
const FEEDBACK_TYPE_MAP = {
  issue: 'bugfix',
  enhancement: 'feature'
};

// Priority mapping (feedback P0-P3 to SD priority)
const PRIORITY_MAP = {
  P0: 'critical',
  P1: 'high',
  P2: 'medium',
  P3: 'low'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    parent: null,
    all: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--parent':
      case '-p':
        parsed.parent = args[++i];
        break;
      case '--all':
      case '-a':
        parsed.all = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

/**
 * Display help message
 */
function showHelp() {
  console.log(`
Feedback-to-SD Automation Script
================================

Converts triaged feedback items into Strategic Directives.

Usage:
  npm run sd:from-feedback [options]
  node scripts/sd-from-feedback.js [options]

Options:
  --parent, -p <sd_key>   Parent SD key for child SDs
  --all, -a               Include all open feedback (not just triaged)
  --help, -h              Show this help

Workflow:
  1. Shows list of triaged/open feedback items
  2. You select items to convert (or 'all')
  3. Script creates SDs with appropriate types:
     - issue → bugfix SD (requires smoke_test_steps)
     - enhancement → feature SD (requires smoke_test_steps)
  4. Links SDs to feedback items in feedback_sd_map

Examples:
  npm run sd:from-feedback
  npm run sd:from-feedback -- --parent SD-ORCH-001
`);
}

/**
 * Create readline interface
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Fetch open feedback items
 */
async function fetchFeedbackItems(includeAll = false) {
  let query = supabase
    .from('feedback')
    .select('id, type, title, description, priority, status, source_type, created_at')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (includeAll) {
    query = query.not('status', 'in', '(closed,resolved,rejected)');
  } else {
    query = query.in('status', ['open', 'triaged']);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    throw new Error(`Failed to fetch feedback: ${error.message}`);
  }

  return data || [];
}

/**
 * Display feedback items in table format
 */
function displayFeedbackTable(items) {
  console.log('\n' + '─'.repeat(100));
  console.log(`│ ${'#'.padEnd(3)} │ ${'ID'.padEnd(10)} │ ${'Type'.padEnd(12)} │ ${'Priority'.padEnd(8)} │ ${'Status'.padEnd(10)} │ Title`);
  console.log('─'.repeat(100));

  items.forEach((item, index) => {
    const num = (index + 1).toString().padEnd(3);
    const id = (item.id || '-').substring(0, 10).padEnd(10);
    const type = (item.type || '-').padEnd(12);
    const priority = (item.priority || '-').padEnd(8);
    const status = (item.status || '-').padEnd(10);
    const title = (item.title || '-').substring(0, 40);
    console.log(`│ ${num} │ ${id} │ ${type} │ ${priority} │ ${status} │ ${title}`);
  });

  console.log('─'.repeat(100));
  console.log(`Total: ${items.length} item(s)\n`);
}

/**
 * Generate SD key from feedback
 * SD-LEO-SDKEY-001: Uses centralized SDKeyGenerator for consistent naming
 */
async function generateSdKey(feedback) {
  const type = feedback.type === 'issue' ? 'bugfix' : 'feature';

  // Use centralized SDKeyGenerator for consistent naming across all SD sources
  return generateSDKey({
    source: 'FEEDBACK',
    type,
    title: feedback.title || 'Untitled Feedback'
  });
}

/**
 * Generate default smoke test steps from feedback
 */
function generateDefaultSmokeTestSteps(feedback) {
  const steps = [
    {
      step_number: 1,
      instruction: `Navigate to the affected area: ${feedback.title}`,
      expected_outcome: 'Page loads without errors'
    },
    {
      step_number: 2,
      instruction: `Verify the ${feedback.type === 'issue' ? 'fix' : 'feature'} works as expected`,
      expected_outcome: `${feedback.type === 'issue' ? 'Error no longer occurs' : 'Feature functions correctly'}`
    }
  ];

  return steps;
}

/**
 * Resolve parent SD
 */
async function resolveParentSd(parentKey) {
  if (!parentKey) return null;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .eq('sd_key', parentKey)
    .single();

  if (error || !data) {
    throw new Error(`Parent SD not found: ${parentKey}`);
  }

  return data;
}

/**
 * Create SD from feedback item
 */
async function createSdFromFeedback(feedback, parentId = null) {
  const sdType = FEEDBACK_TYPE_MAP[feedback.type] || 'bugfix';
  const priority = PRIORITY_MAP[feedback.priority] || 'medium';
  // SD-LEO-SDKEY-001: Use centralized async key generator
  const sdKey = await generateSdKey(feedback);

  const sdData = {
    id: randomUUID(),
    sd_key: sdKey,
    title: feedback.title,
    description: feedback.description || feedback.title,
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}. Original ID: ${feedback.id}`,
    sd_type: sdType,
    status: 'draft',
    priority: priority,
    category: sdType.charAt(0).toUpperCase() + sdType.slice(1),
    success_criteria: JSON.stringify([`${feedback.title} - verified complete`]),
    target_application: 'EHG_Engineer',
    smoke_test_steps: JSON.stringify(generateDefaultSmokeTestSteps(feedback))
  };

  if (parentId) {
    sdData.parent_sd_id = parentId;
    sdData.metadata = JSON.stringify({
      contract_governed: true,
      contract_parent_chain: [parentId],
      source_feedback_id: feedback.id
    });
  } else {
    sdData.metadata = JSON.stringify({
      source_feedback_id: feedback.id
    });
  }

  // Insert SD
  const { data: created, error: createError } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, sd_type')
    .single();

  if (createError) {
    throw new Error(`Failed to create SD: ${createError.message}`);
  }

  // Link feedback to SD via feedback_sd_map (if table exists)
  try {
    await supabase
      .from('feedback_sd_map')
      .insert({
        feedback_id: feedback.id,
        sd_id: created.id
      });
  } catch (_mapError) {
    // Table might not exist, ignore
  }

  // Update feedback status to 'in_progress'
  await supabase
    .from('feedback')
    .update({ status: 'in_progress' })
    .eq('id', feedback.id);

  return created;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('\n📋 Feedback-to-SD Automation');
  console.log('=' .repeat(50));

  // Resolve parent SD if provided
  let parentSd = null;
  if (args.parent) {
    try {
      parentSd = await resolveParentSd(args.parent);
      console.log(`\n📎 Parent SD: ${parentSd.sd_key} - ${parentSd.title}`);
    } catch (error) {
      console.error(`\n❌ ${error.message}`);
      process.exit(1);
    }
  }

  // Fetch feedback items
  console.log('\n🔍 Fetching feedback items...');
  const items = await fetchFeedbackItems(args.all);

  if (items.length === 0) {
    console.log('\n✅ No feedback items to process.');
    console.log('   Use --all flag to include all open items (not just triaged).');
    process.exit(0);
  }

  // Display items
  displayFeedbackTable(items);

  // Get user selection
  const rl = createReadline();

  console.log('Enter numbers to select (comma-separated), "all" for all, or "q" to quit:');
  const selection = await prompt(rl, '> ');

  if (selection.toLowerCase() === 'q') {
    console.log('\n👋 Cancelled.');
    rl.close();
    process.exit(0);
  }

  // Parse selection
  let selectedIndices = [];
  if (selection.toLowerCase() === 'all') {
    selectedIndices = items.map((_, i) => i);
  } else {
    selectedIndices = selection
      .split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < items.length);
  }

  if (selectedIndices.length === 0) {
    console.log('\n⚠️  No valid items selected.');
    rl.close();
    process.exit(0);
  }

  const selectedItems = selectedIndices.map(i => items[i]);
  console.log(`\n📝 Creating ${selectedItems.length} SD(s)...`);

  rl.close();

  // Create SDs
  const results = {
    success: [],
    failed: []
  };

  for (const item of selectedItems) {
    try {
      const created = await createSdFromFeedback(item, parentSd?.id);
      results.success.push(created);
      console.log(`   ✅ ${created.sd_key} - ${created.title.substring(0, 40)}`);
    } catch (error) {
      results.failed.push({ item, error: error.message });
      console.log(`   ❌ ${item.title.substring(0, 40)} - ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log(`✅ Created: ${results.success.length}`);
  if (results.failed.length > 0) {
    console.log(`❌ Failed: ${results.failed.length}`);
  }

  if (results.success.length > 0) {
    console.log('\n📝 Next Steps:');
    console.log('   For each created SD, run LEAD-TO-PLAN handoff:');
    results.success.slice(0, 3).forEach(sd => {
      console.log(`   node scripts/handoff.js execute LEAD-TO-PLAN ${sd.sd_key}`);
    });
    if (results.success.length > 3) {
      console.log(`   ... and ${results.success.length - 3} more`);
    }
  }
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
});
