#!/usr/bin/env node

/**
 * SD Creation Helper Script
 *
 * Creates Strategic Directives with type-aware validation profiles.
 * Ensures all required fields are present based on sd_type.
 *
 * Created as part of SD-UAT-WORKFLOW-001 - UAT-to-SD Workflow Process Improvements
 *
 * Usage:
 *   node scripts/create-sd.js --type bugfix --title "Fix login error"
 *   node scripts/create-sd.js --type feature --title "Add dark mode" --parent SD-PARENT-001
 *   node scripts/create-sd.js --interactive
 *
 * @module scripts/create-sd
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';
// SD-LEO-SDKEY-001: Centralized SD key generation
import { generateSDKey as generateCentralizedSDKey } from './modules/sd-key-generator.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Valid SD types and their requirements
const SD_TYPES = {
  bugfix: {
    requiredFields: ['smoke_test_steps'],
    defaultPriority: 'high',
    description: 'Fix defects/errors',
    subAgents: ['TESTING', 'GITHUB']
  },
  feature: {
    requiredFields: ['smoke_test_steps'],
    defaultPriority: 'medium',
    description: 'New functionality',
    subAgents: ['DESIGN', 'DATABASE', 'TESTING', 'GITHUB']
  },
  refactor: {
    requiredFields: ['intensity_level'],
    defaultPriority: 'medium',
    description: 'Code restructuring',
    subAgents: ['REGRESSION']
  },
  infrastructure: {
    requiredFields: [],
    defaultPriority: 'medium',
    description: 'Build tools, CI/CD, scripts',
    subAgents: []
  },
  documentation: {
    requiredFields: [],
    defaultPriority: 'low',
    description: 'Documentation only',
    subAgents: ['DOCMON']
  },
  orchestrator: {
    requiredFields: [],
    defaultPriority: 'high',
    description: 'Parent SD coordinating children',
    subAgents: []
  },
  security: {
    requiredFields: [],
    defaultPriority: 'high',
    description: 'Security improvements',
    subAgents: ['SECURITY']
  },
  qa: {
    requiredFields: [],
    defaultPriority: 'medium',
    description: 'Testing/quality work',
    subAgents: ['TESTING']
  },
  ux_debt: {
    requiredFields: [],
    defaultPriority: 'low',
    description: 'UX improvements',
    subAgents: ['DESIGN']
  },
  database: {
    requiredFields: [],
    defaultPriority: 'medium',
    description: 'Schema changes, migrations',
    subAgents: ['DATABASE']
  }
};

// Valid status values (for reference - used in help text)
const _VALID_STATUSES = ['draft', 'in_progress', 'active', 'pending_approval', 'completed', 'deferred', 'cancelled'];

// Valid intensity levels for refactor type
const INTENSITY_LEVELS = ['cosmetic', 'minor', 'moderate', 'major', 'critical'];

// Valid priorities (for reference - used in help text)
const _VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    type: null,
    title: null,
    description: null,
    parent: null,
    priority: null,
    interactive: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--type':
      case '-t':
        parsed.type = args[++i];
        break;
      case '--title':
        parsed.title = args[++i];
        break;
      case '--description':
      case '-d':
        parsed.description = args[++i];
        break;
      case '--parent':
      case '-p':
        parsed.parent = args[++i];
        break;
      case '--priority':
        parsed.priority = args[++i];
        break;
      case '--interactive':
      case '-i':
        parsed.interactive = true;
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
SD Creation Helper Script
=========================

Creates Strategic Directives with type-aware validation profiles.

Usage:
  node scripts/create-sd.js [options]

Options:
  --type, -t <type>       SD type (required unless interactive)
  --title <title>         SD title (required unless interactive)
  --description, -d       SD description
  --parent, -p <sd_key>   Parent SD key for child SDs
  --priority              Priority: critical, high, medium, low
  --interactive, -i       Interactive mode (prompts for all fields)
  --help, -h              Show this help

Valid SD Types:
${Object.entries(SD_TYPES).map(([type, info]) => `  ${type.padEnd(15)} - ${info.description}`).join('\n')}

Examples:
  node scripts/create-sd.js --type bugfix --title "Fix login error"
  node scripts/create-sd.js --type feature --title "Add dark mode" --parent SD-PARENT-001
  node scripts/create-sd.js --interactive

Required Fields by Type:
  bugfix/feature  → smoke_test_steps (will prompt)
  refactor        → intensity_level (will prompt)
  other types     → no extra fields required
`);
}

/**
 * Create readline interface for interactive prompts
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
 * Prompt for smoke test steps
 */
async function promptSmokeTestSteps(rl) {
  console.log('\n📋 Smoke Test Steps Required');
  console.log('   (Enter 2-5 steps that verify the fix/feature works)\n');

  const steps = [];
  let stepNumber = 1;
  let addMore = true;

  while (addMore && steps.length < 5) {
    const instruction = await prompt(rl, `Step ${stepNumber} instruction (or empty to finish): `);
    if (!instruction) {
      if (steps.length < 2) {
        console.log('   ⚠️  Minimum 2 steps required');
        continue;
      }
      break;
    }

    const expectedOutcome = await prompt(rl, `Step ${stepNumber} expected outcome: `);
    if (!expectedOutcome) {
      console.log('   ⚠️  Expected outcome is required');
      continue;
    }

    steps.push({
      step_number: stepNumber,
      instruction,
      expected_outcome: expectedOutcome
    });
    stepNumber++;
  }

  return steps;
}

/**
 * Prompt for intensity level
 */
async function promptIntensityLevel(rl) {
  console.log('\n📊 Intensity Level Required');
  console.log('   Options: cosmetic, minor, moderate, major, critical\n');

  while (true) {
    const level = await prompt(rl, 'Intensity level: ');
    if (INTENSITY_LEVELS.includes(level.toLowerCase())) {
      return level.toLowerCase();
    }
    console.log(`   ⚠️  Invalid level. Choose from: ${INTENSITY_LEVELS.join(', ')}`);
  }
}

/**
 * Generate SD key from title
 * SD-LEO-SDKEY-001: Uses centralized SDKeyGenerator for consistent naming
 */
async function generateSdKey(title, type) {
  // Use centralized SDKeyGenerator for consistent naming across all SD sources
  return generateCentralizedSDKey({
    source: 'MANUAL',
    type: type,
    title: title || 'Manual SD'
  });
}

/**
 * Validate and resolve parent SD
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

  // Check parent is in PLAN phase (required for children)
  if (!['in_progress', 'active', 'planning'].includes(data.status)) {
    throw new Error(`Parent SD ${parentKey} must be in PLAN phase (current: ${data.status})`);
  }

  return data.id;
}

/**
 * Create the Strategic Directive
 */
async function createSD(sdData) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, sd_type, status')
    .single();

  if (error) {
    throw new Error(`Failed to create SD: ${error.message}`);
  }

  return data;
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

  console.log('\n🚀 SD Creation Helper');
  console.log('=' .repeat(50));

  let rl;
  let sdType = args.type;
  let title = args.title;
  let description = args.description;
  let parentKey = args.parent;
  let priority = args.priority;

  // Interactive mode or missing required fields
  if (args.interactive || !sdType || !title) {
    rl = createReadline();

    if (!sdType) {
      console.log('\nValid SD Types:');
      Object.entries(SD_TYPES).forEach(([type, info]) => {
        console.log(`  ${type.padEnd(15)} - ${info.description}`);
      });
      while (!sdType || !SD_TYPES[sdType]) {
        sdType = await prompt(rl, '\nSD Type: ');
        if (!SD_TYPES[sdType]) {
          console.log(`   ⚠️  Invalid type. Choose from: ${Object.keys(SD_TYPES).join(', ')}`);
        }
      }
    }

    if (!title) {
      title = await prompt(rl, 'Title: ');
      if (!title) {
        console.error('❌ Title is required');
        process.exit(1);
      }
    }

    if (!description) {
      description = await prompt(rl, 'Description (optional): ');
    }

    if (!parentKey) {
      parentKey = await prompt(rl, 'Parent SD key (optional, e.g., SD-PARENT-001): ');
    }

    if (!priority) {
      console.log(`\nPriority (default: ${SD_TYPES[sdType].defaultPriority})`);
      priority = await prompt(rl, 'Priority [critical/high/medium/low]: ') || SD_TYPES[sdType].defaultPriority;
    }
  }

  // Validate SD type
  if (!SD_TYPES[sdType]) {
    console.error(`❌ Invalid SD type: ${sdType}`);
    console.error(`   Valid types: ${Object.keys(SD_TYPES).join(', ')}`);
    process.exit(1);
  }

  const typeConfig = SD_TYPES[sdType];

  // Initialize SD data
  // SD-LEO-SDKEY-001: Use centralized async key generator
  // SD-LEO-FIX-CREATION-COLUMN-MAPPING-001: id=human-readable key per schema
  const sdKey = await generateSdKey(title, sdType);
  const sdData = {
    id: sdKey,  // Human-readable key (per schema: id=VARCHAR for main identifier)
    sd_key: sdKey,  // Same for backward compatibility
    title: title,
    description: description || title,
    rationale: `Created via create-sd.js helper script. Type: ${sdType}.`,
    sd_type: sdType,
    status: 'draft',
    priority: priority || typeConfig.defaultPriority,
    category: sdType.charAt(0).toUpperCase() + sdType.slice(1),
    success_criteria: JSON.stringify([`${title} - verified complete`]),
    target_application: 'EHG_Engineer'
  };

  // Handle type-specific required fields
  if (!rl) {
    rl = createReadline();
  }

  if (typeConfig.requiredFields.includes('smoke_test_steps')) {
    console.log('\n📋 This SD type requires smoke_test_steps');
    const steps = await promptSmokeTestSteps(rl);
    sdData.smoke_test_steps = JSON.stringify(steps);
  }

  if (typeConfig.requiredFields.includes('intensity_level')) {
    console.log('\n📊 This SD type requires intensity_level');
    sdData.intensity_level = await promptIntensityLevel(rl);
  }

  // Resolve parent SD if provided
  if (parentKey) {
    try {
      const parentId = await resolveParentSd(parentKey);
      sdData.parent_sd_id = parentId;
      sdData.metadata = JSON.stringify({
        contract_governed: true,
        contract_parent_chain: [parentId]
      });
      console.log(`\n✅ Linked to parent: ${parentKey}`);
    } catch (error) {
      console.error(`\n❌ ${error.message}`);
      rl.close();
      process.exit(1);
    }
  }

  // Close readline
  rl.close();

  // Create the SD
  console.log('\n📝 Creating Strategic Directive...');
  try {
    const created = await createSD(sdData);
    console.log('\n✅ SD Created Successfully!');
    console.log('=' .repeat(50));
    console.log(`   SD Key:  ${created.sd_key}`);
    console.log(`   Title:   ${created.title}`);
    console.log(`   Type:    ${created.sd_type}`);
    console.log(`   Status:  ${created.status}`);
    console.log(`   UUID:    ${created.id}`);

    if (typeConfig.subAgents.length > 0) {
      console.log(`\n📋 Sub-agents for this type: ${typeConfig.subAgents.join(', ')}`);
    }

    console.log('\n📝 Next Steps:');
    console.log('   1. Run LEAD-TO-PLAN handoff:');
    console.log(`      node scripts/handoff.js execute LEAD-TO-PLAN ${created.sd_key}`);
    console.log('');
  } catch (error) {
    console.error(`\n❌ ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
});
