#!/usr/bin/env node

/**
 * Create Quick-Fix Entry
 * LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish
 *
 * Usage:
 *   node scripts/create-quick-fix.js --title "Fix broken button" --type bug --severity high
 *   node scripts/create-quick-fix.js --interactive  (prompts for all fields)
 *
 * Tiered routing via Unified Work-Item Router:
 *   Tier 1 (<=30 LOC): Auto-approve QF, skip compliance rubric
 *   Tier 2 (31-75 LOC): Standard QF, requires compliance rubric >=70
 *   Tier 3 (>75 LOC or risk keywords): Escalate to full SD workflow
 *
 * Thresholds are database-driven (work_item_thresholds table).
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { routeWorkItem } from '../lib/utils/work-item-router.js';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');
const EHG_ROOT = path.resolve(__dirname, '../../ehg');

dotenv.config();

// Repository paths for target application detection - currently unused but kept for reference
const _REPO_PATHS = {
  EHG: EHG_ROOT,
  EHG_Engineer: EHG_ENGINEER_ROOT
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

  const supabaseUrl = process.env.SUPABASE_URL;
  // Use service role key for insert operations (anon key blocked by RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    console.log('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
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

  // Unified Work-Item Router: determine tier based on LOC + risk keywords
  const routingDecision = await routeWorkItem({
    estimatedLoc,
    type,
    description,
    entryPoint: 'create-quick-fix',
  }, supabase);

  console.log(`\n📊 Routing Decision: ${routingDecision.tierLabel} (${estimatedLoc} LOC, threshold: ${routingDecision.thresholdId})`);

  // Tier 3: Escalate to full Strategic Directive
  if (routingDecision.tier === 3) {
    console.log('\n⚠️  ESCALATION REQUIRED\n');
    console.log(`Reason: ${routingDecision.escalationReason}`);
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
        escalation_reason: routingDecision.escalationReason,
        routing_tier: routingDecision.tier,
        routing_threshold_id: routingDecision.thresholdId !== 'fallback' && routingDecision.thresholdId !== 'error-multiple-active' ? routingDecision.thresholdId : null,
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

  // Tier 1 or Tier 2: Create quick-fix record
  // Note: 'approved' is not a valid quick_fixes status (constraint: quick_fixes_status_check).
  // Tier 1 QFs are auto-approved (no LEAD review) but DB status starts as 'open'.
  const qfStatus = 'open';
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
      status: qfStatus,
      routing_tier: routingDecision.tier,
      routing_threshold_id: routingDecision.thresholdId !== 'fallback' && routingDecision.thresholdId !== 'error-multiple-active' ? routingDecision.thresholdId : null,
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
  console.log(`   Tier: ${routingDecision.tierLabel}`);
  if (routingDecision.tier === 1) {
    console.log('   Compliance: Skipped (Tier 1 auto-approve)');
  } else {
    console.log(`   Compliance: Required (min score: ${routingDecision.complianceMinScore})`);
  }
  console.log(`   Status: ${data.status}\n`);

  // Worktree Isolation for Quick-Fix work
  if (options.autoBranch !== false) { // Default to true
    console.log('🌲 Worktree Isolation\n');

    try {
      // Check if git repo
      try {
        execSync('git rev-parse --git-dir', { stdio: 'pipe' });
      } catch (_err) {
        console.log('   ⚠️  Not a git repository - skipping worktree creation\n');
        return printNextSteps(qfId, false, null);
      }

      // Dynamically import worktree-manager (ESM)
      const { createWorkTypeWorktree, symlinkNodeModules } = await import('../lib/worktree-manager.js');

      const result = createWorkTypeWorktree({
        workType: 'QF',
        workKey: qfId,
        branch: `qf/${qfId}`
      });

      if (result.mode === 'worktree') {
        // Symlink node_modules into worktree
        try {
          symlinkNodeModules(result.path);
        } catch (symlinkErr) {
          console.log(`   ⚠️  node_modules symlink failed: ${symlinkErr.message}`);
          console.log('   Run npm ci in the worktree if needed.\n');
        }

        const action = result.created ? 'Created' : 'Reusing existing';
        console.log(`   ✅ ${action} worktree: ${result.path}`);
        console.log(`   Branch: ${result.branch}\n`);

        // Set environment marker
        process.env.EHG_WORKTREE_MODE = 'worktree';

        // Update database with branch name and worktree path
        await supabase
          .from('quick_fixes')
          .update({ branch_name: result.branch })
          .eq('id', qfId);

        return printNextSteps(qfId, true, result.path);
      } else {
        // Fallback to main repo
        console.log('   ⚠️  Worktree creation fell back to main repo');
        console.log(`   Reason: ${result.reason}`);
        console.log('');

        process.env.EHG_WORKTREE_MODE = 'main-fallback';

        // Still create a branch in main repo
        const branchName = `qf/${qfId}`;
        try {
          execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
          console.log(`   ✅ Branch created in main repo: ${branchName}\n`);

          await supabase
            .from('quick_fixes')
            .update({ branch_name: branchName })
            .eq('id', qfId);

          return printNextSteps(qfId, true, null);
        } catch (branchErr) {
          console.log(`   ❌ Branch creation also failed: ${branchErr.message}\n`);
          return printNextSteps(qfId, false, null);
        }
      }
    } catch (err) {
      console.log(`   ❌ Worktree creation failed: ${err.message}`);
      console.log('   Falling back to branch-only mode.\n');

      process.env.EHG_WORKTREE_MODE = 'main-fallback';

      // Fallback: try simple branch creation
      try {
        const branchName = `qf/${qfId}`;
        execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
        console.log(`   ✅ Fallback branch created: ${branchName}\n`);

        await supabase
          .from('quick_fixes')
          .update({ branch_name: branchName })
          .eq('id', qfId);

        return printNextSteps(qfId, true, null);
      } catch (_fallbackErr) {
        return printNextSteps(qfId, false, null);
      }
    }
  } else {
    return printNextSteps(qfId, false, null);
  }
}

function printNextSteps(qfId, branchCreated, worktreePath) {
  console.log('📍 Next steps:');
  if (worktreePath) {
    console.log(`   1. cd ${worktreePath}`);
    console.log('   2. Implement fix (≤50 LOC)');
    console.log('   3. Run tests: npm run test:unit && npm run test:e2e');
    console.log(`   4. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);
  } else {
    console.log(`   1. Read details: node scripts/read-quick-fix.js ${qfId}`);
    if (!branchCreated) {
      console.log(`   2. Create branch: git checkout -b qf/${qfId}`);
    }
    console.log(`   ${branchCreated ? '2' : '3'}. Implement fix (≤50 LOC)`);
    console.log(`   ${branchCreated ? '3' : '4'}. Run tests: npm run test:unit && npm run test:e2e`);
    console.log(`   ${branchCreated ? '4' : '5'}. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);
  }

  return { escalated: false, qfId, branchCreated, worktreePath };
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

Tiered Routing:
  - Tier 1 (<=30 LOC): Auto-approve, skip compliance
  - Tier 2 (31-75 LOC): Standard QF, compliance >=70
  - Tier 3 (>75 LOC): Escalate to full SD
  - Risk keywords (security, auth, schema): Force Tier 3
    `);
    process.exit(0);
  }
}

// Run
createQuickFix(options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
