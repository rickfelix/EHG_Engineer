#!/usr/bin/env node

/**
 * Create Quick-Fix Entry
 * LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish
 *
 * Usage:
 *   node scripts/create-quick-fix.js --title "Fix broken button" --type bug --severity high
 *   node scripts/create-quick-fix.js --interactive  (prompts for all fields)
 *
 * Auto-escalates to full SD if:
 * - Estimated LOC > 50
 * - Type is 'feature' (not allowed in quick-fix)
 * - Database schema changes needed
 * - Security/auth changes needed
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// Repository paths for target application detection
const REPO_PATHS = {
  EHG: '/mnt/c/_EHG/EHG',
  EHG_Engineer: '/mnt/c/_EHG/EHG_Engineer'
};

/**
 * Detect target application based on current working directory
 * @returns {'EHG' | 'EHG_Engineer'} The detected target application
 */
function detectTargetApplication() {
  const cwd = process.cwd();

  if (cwd.includes('/EHG_Engineer') || cwd.includes('\\EHG_Engineer')) {
    return 'EHG_Engineer';
  }
  if (cwd.includes('/EHG') || cwd.includes('\\EHG')) {
    return 'EHG';
  }

  // Default to EHG (main app) if unable to detect
  return 'EHG';
}

// Generate quick-fix ID: QF-YYYYMMDD-NNN
function generateQuickFixId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

  return `QF-${year}${month}${day}-${random}`;
}

// Interactive prompting
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createQuickFix(options = {}) {
  console.log('\n🎯 LEO Quick-Fix Workflow - Create Issue\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Interactive mode if no options provided
  let title, type, severity, description, steps, expected, actual, estimatedLoc, targetApplication;

  // Auto-detect or use provided target application
  targetApplication = options.targetApplication || detectTargetApplication();
  console.log(`🎯 Target Application: ${targetApplication}`);
  console.log(`   (Run from ${targetApplication === 'EHG' ? 'EHG app' : 'EHG_Engineer'} directory or use --target-application)\n`);

  if (options.interactive || !options.title) {
    console.log('📝 Interactive Mode - Please provide details:\n');

    title = await prompt('Issue title: ');

    console.log('\nType options: bug, polish, typo, documentation');
    type = await prompt('Issue type: ');

    console.log('\nSeverity options: critical, high, medium, low');
    severity = await prompt('Issue severity: ');

    description = await prompt('\nBrief description: ');
    steps = await prompt('Steps to reproduce (optional): ');
    expected = await prompt('Expected behavior (optional): ');
    actual = await prompt('Actual behavior (optional): ');

    const estimatedLocStr = await prompt('Estimated lines of code to change (default: 10): ');
    estimatedLoc = parseInt(estimatedLocStr) || 10;
  } else {
    // Use provided options
    title = options.title;
    type = options.type || 'bug';
    severity = options.severity || 'medium';
    description = options.description || title;
    steps = options.steps || '';
    expected = options.expected || '';
    actual = options.actual || '';
    estimatedLoc = options.estimatedLoc || 10;
  }

  // Validate type
  const validTypes = ['bug', 'polish', 'typo', 'documentation'];
  if (!validTypes.includes(type)) {
    console.log(`❌ Invalid type: ${type}`);
    console.log(`   Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Validate severity
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  if (!validSeverities.includes(severity)) {
    console.log(`❌ Invalid severity: ${severity}`);
    console.log(`   Valid severities: ${validSeverities.join(', ')}`);
    process.exit(1);
  }

  // Generate ID
  const qfId = generateQuickFixId();

  // Auto-classification check
  const shouldEscalate = estimatedLoc > 50;

  if (shouldEscalate) {
    console.log('\n⚠️  ESCALATION REQUIRED\n');
    console.log(`Estimated LOC (${estimatedLoc}) exceeds quick-fix threshold (50 LOC)`);
    console.log('This requires a full Strategic Directive.\n');
    console.log('📋 Next steps:');
    console.log('   1. Create Strategic Directive with LEAD approval');
    console.log('   2. Run: node scripts/add-prd-to-database.js SD-XXX');
    console.log('   3. Follow full LEAD→PLAN→EXEC workflow\n');

    // Still create the quick-fix record but mark as escalated
    const { data, error } = await supabase
      .from('quick_fixes')
      .insert({
        id: qfId,
        title,
        type,
        severity,
        description,
        steps_to_reproduce: steps,
        expected_behavior: expected,
        actual_behavior: actual,
        estimated_loc: estimatedLoc,
        target_application: targetApplication,
        status: 'escalated',
        escalation_reason: `Estimated LOC (${estimatedLoc}) exceeds 50 line threshold`,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.log('❌ Failed to create quick-fix record:', error.message);
      process.exit(1);
    }

    console.log(`✅ Quick-fix record created: ${qfId}`);
    console.log('   Status: ESCALATED (requires full SD)');

    return { escalated: true, qfId, data };
  }

  // Create quick-fix record
  const { data, error } = await supabase
    .from('quick_fixes')
    .insert({
      id: qfId,
      title,
      type,
      severity,
      description,
      steps_to_reproduce: steps,
      expected_behavior: expected,
      actual_behavior: actual,
      estimated_loc: estimatedLoc,
      target_application: targetApplication,
      status: 'open',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.log('❌ Failed to create quick-fix:', error.message);
    process.exit(1);
  }

  console.log(`\n✅ Quick-fix created: ${qfId}\n`);
  console.log('📋 Details:');
  console.log(`   Title: ${title}`);
  console.log(`   Type: ${type}`);
  console.log(`   Severity: ${severity}`);
  console.log(`   Target App: ${targetApplication}`);
  console.log(`   Estimated LOC: ${estimatedLoc}`);
  console.log(`   Status: ${data.status}\n`);

  // Enhancement #3: Auto-Branch Creation
  if (options.autoBranch !== false) { // Default to true
    console.log('🌿 Auto-Branch Creation\n');

    try {
      // Check if git repo
      try {
        execSync('git rev-parse --git-dir', { stdio: 'pipe' });
      } catch (err) {
        console.log('   ⚠️  Not a git repository - skipping branch creation\n');
        return printNextSteps(qfId, false);
      }

      // Check for uncommitted changes
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      if (status.trim()) {
        console.log('   ⚠️  Uncommitted changes detected');
        console.log('   Would you like to:');
        console.log('   a) Stash changes and create branch');
        console.log('   b) Skip branch creation (manual later)');

        const choice = await prompt('   Choice (a/b): ');

        if (choice.toLowerCase() === 'a') {
          execSync(`git stash push -m "Pre quick-fix/${qfId}"`, { stdio: 'inherit' });
          console.log('   ✅ Changes stashed\n');
        } else {
          return printNextSteps(qfId, false);
        }
      }

      // Create branch
      const branchName = `quick-fix/${qfId}`;
      execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });

      console.log(`   ✅ Branch created: ${branchName}\n`);

      // Update database with branch name
      await supabase
        .from('quick_fixes')
        .update({ branch_name: branchName })
        .eq('id', qfId);

      return printNextSteps(qfId, true);

    } catch (err) {
      console.log(`   ❌ Branch creation failed: ${err.message}\n`);
      return printNextSteps(qfId, false);
    }
  } else {
    return printNextSteps(qfId, false);
  }
}

function printNextSteps(qfId, branchCreated) {
  console.log('📍 Next steps:');
  console.log(`   1. Read details: node scripts/read-quick-fix.js ${qfId}`);
  if (!branchCreated) {
    console.log(`   2. Create branch: git checkout -b quick-fix/${qfId}`);
  }
  console.log(`   ${branchCreated ? '2' : '3'}. Implement fix (≤50 LOC)`);
  console.log(`   ${branchCreated ? '3' : '4'}. Run tests: npm run test:unit && npm run test:e2e`);
  console.log(`   ${branchCreated ? '4' : '5'}. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);

  return { escalated: false, qfId, branchCreated };
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--interactive' || arg === '-i') {
    options.interactive = true;
  } else if (arg === '--title') {
    options.title = args[++i];
  } else if (arg === '--type') {
    options.type = args[++i];
  } else if (arg === '--severity') {
    options.severity = args[++i];
  } else if (arg === '--description') {
    options.description = args[++i];
  } else if (arg === '--steps') {
    options.steps = args[++i];
  } else if (arg === '--expected') {
    options.expected = args[++i];
  } else if (arg === '--actual') {
    options.actual = args[++i];
  } else if (arg === '--estimated-loc') {
    options.estimatedLoc = parseInt(args[++i]);
  } else if (arg === '--target-application' || arg === '--target-app') {
    const val = args[++i];
    if (!['EHG', 'EHG_Engineer'].includes(val)) {
      console.error(`❌ Invalid target application: ${val}. Must be 'EHG' or 'EHG_Engineer'`);
      process.exit(1);
    }
    options.targetApplication = val;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
LEO Quick-Fix Workflow - Create Issue

Usage:
  node scripts/create-quick-fix.js --interactive
  node scripts/create-quick-fix.js --title "Fix button" --type bug --severity high

Options:
  --interactive, -i       Interactive mode (prompts for all fields)
  --title                Issue title
  --type                 Issue type (bug, polish, typo, documentation)
  --severity             Severity (critical, high, medium, low)
  --description          Brief description
  --steps                Steps to reproduce
  --expected             Expected behavior
  --actual               Actual behavior
  --estimated-loc        Estimated lines of code (default: 10)
  --target-application   Target repo: 'EHG' or 'EHG_Engineer' (auto-detected from cwd)
  --help, -h             Show this help

Examples:
  node scripts/create-quick-fix.js --interactive
  node scripts/create-quick-fix.js --title "Fix save button" --type bug --severity high
  node scripts/create-quick-fix.js --title "Fix typo in header" --type typo --severity low --estimated-loc 1

Auto-Escalation (to full SD):
  - Estimated LOC > 50
  - Type is 'feature' (not allowed)
  - Database schema changes
  - Security/auth changes
    `);
    process.exit(0);
  }
}

// Run
createQuickFix(options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
