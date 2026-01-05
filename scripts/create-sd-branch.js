#!/usr/bin/env node

/**
 * Create SD Branch - Automated Branch Creation for Strategic Directives
 * LEO Protocol: Proactive branch creation at LEAD phase (not reactive at PLAN-TO-EXEC)
 *
 * Usage:
 *   node scripts/create-sd-branch.js SD-XXX-001                    # Auto-lookup title from DB
 *   node scripts/create-sd-branch.js SD-XXX-001 --title "Feature"  # Override title
 *   node scripts/create-sd-branch.js SD-XXX-001 --app EHG          # Specify target app
 *   node scripts/create-sd-branch.js --check SD-XXX-001            # Check if branch exists
 *
 * Features:
 * - Auto-creates branch with correct naming convention
 * - Looks up SD title from database for branch naming
 * - Stashes uncommitted changes safely
 * - Updates SD record with branch name
 * - Sets up remote tracking
 * - Validates branch doesn't already exist
 *
 * This script should be run:
 * 1. After LEAD approval (recommended)
 * 2. Before PLAN-TO-EXEC handoff (automated fallback)
 * 3. Anytime you need to ensure the branch exists
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import readline from 'readline';
import path from 'path';
import fs from 'fs';

dotenv.config();

const execAsync = promisify(exec);

// Repository paths
const REPO_PATHS = {
  EHG: '/mnt/c/_EHG/EHG',
  EHG_Engineer: '/mnt/c/_EHG/EHG_Engineer'
};

/**
 * Branch type mapping based on SD-ID keywords
 */
const BRANCH_TYPE_MAP = {
  'FIX': 'fix',
  'DOCS': 'docs',
  'REFACTOR': 'refactor',
  'TEST': 'test',
  'CHORE': 'chore',
  'PERF': 'perf',
  'CI': 'ci'
};

/**
 * Generate standardized branch name from SD-ID and title
 * Format: <type>/<SD-ID>-<slug>
 */
function generateBranchName(sdId, title) {
  // Determine branch type prefix from SD-ID
  let branchType = 'feat'; // default
  for (const [key, value] of Object.entries(BRANCH_TYPE_MAP)) {
    if (sdId.toUpperCase().includes(key)) {
      branchType = value;
      break;
    }
  }

  // Create slug from title
  let slug = '';
  if (title && title.trim().length > 0) {
    slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')          // Spaces to hyphens
      .replace(/-+/g, '-')           // Collapse multiple hyphens
      .replace(/^-|-$/g, '')         // Trim hyphens
      .substring(0, 40);             // Max 40 chars
  }

  // Construct branch name
  if (slug) {
    return `${branchType}/${sdId}-${slug}`;
  } else {
    return `${branchType}/${sdId}`;
  }
}

/**
 * Execute git command in specified directory
 */
async function gitCommand(command, cwd) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (error) {
    return {
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      success: false
    };
  }
}

/**
 * Interactive prompting
 */
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

/**
 * Look up SD from database
 */
async function lookupSD(supabase, sdId) {
  const { data, error } = await supabase
    .from('strategic_directives')
    .select('id, title, status, target_application, branch_name')
    .eq('id', sdId)
    .single();

  if (error) {
    // Try prds table as fallback
    const { data: prdData, error: prdError } = await supabase
      .from('prds')
      .select('sd_id, title, status, target_application')
      .eq('sd_id', sdId)
      .single();

    if (prdError) {
      return null;
    }
    return {
      id: prdData.sd_id,
      title: prdData.title,
      status: prdData.status,
      target_application: prdData.target_application
    };
  }

  return data;
}

/**
 * Check if branch exists locally or remotely
 */
async function branchExists(branchName, repoPath) {
  // Check local
  const localResult = await gitCommand('git branch --list', repoPath);
  const localBranches = localResult.stdout.split('\n').map(b => b.trim().replace(/^\* /, ''));
  if (localBranches.includes(branchName)) {
    return { exists: true, location: 'local' };
  }

  // Check remote
  const remoteResult = await gitCommand(`git ls-remote --heads origin ${branchName}`, repoPath);
  if (remoteResult.success && remoteResult.stdout.length > 0) {
    return { exists: true, location: 'remote' };
  }

  return { exists: false, location: null };
}

/**
 * Get current branch
 */
async function getCurrentBranch(repoPath) {
  const result = await gitCommand('git rev-parse --abbrev-ref HEAD', repoPath);
  return result.success ? result.stdout : null;
}

/**
 * Check for uncommitted changes
 */
async function hasUncommittedChanges(repoPath) {
  const result = await gitCommand('git status --porcelain', repoPath);
  return result.success && result.stdout.trim().length > 0;
}

/**
 * Main branch creation function
 */
async function createSDBranch(options = {}) {
  console.log('\n🌿 LEO Protocol - SD Branch Creation\n');
  console.log('='.repeat(60));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get SD ID
  const sdId = options.sdId;
  if (!sdId) {
    console.log('❌ SD ID is required');
    console.log('   Usage: node scripts/create-sd-branch.js SD-XXX-001');
    process.exit(1);
  }

  console.log(`📋 Strategic Directive: ${sdId}\n`);

  // Look up SD from database
  console.log('🔍 Looking up SD in database...');
  const sd = await lookupSD(supabase, sdId);

  let title = options.title;
  let targetApp = options.app;

  if (sd) {
    console.log(`   ✅ Found: "${sd.title}"`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Target App: ${sd.target_application || 'Not specified'}`);

    // Use DB values if not overridden
    title = title || sd.title;
    targetApp = targetApp || sd.target_application || 'EHG';

    // Check if branch already recorded in DB
    if (sd.branch_name) {
      console.log(`\n⚠️  Branch already recorded in database: ${sd.branch_name}`);
    }
  } else {
    console.log('   ⚠️  SD not found in database (continuing with provided/default values)');
    title = title || sdId;
    targetApp = targetApp || 'EHG';
  }

  // Determine repo path
  const repoPath = REPO_PATHS[targetApp];
  if (!repoPath || !fs.existsSync(repoPath)) {
    console.log(`❌ Invalid target application or path not found: ${targetApp}`);
    process.exit(1);
  }

  console.log(`\n📂 Repository: ${repoPath}`);

  // Generate branch name
  const branchName = generateBranchName(sdId, title);
  console.log(`🏷️  Branch Name: ${branchName}`);

  // Check mode - just check if branch exists
  if (options.checkOnly) {
    const exists = await branchExists(branchName, repoPath);
    if (exists.exists) {
      console.log(`\n✅ Branch exists (${exists.location}): ${branchName}`);
      process.exit(0);
    } else {
      console.log(`\n❌ Branch does not exist: ${branchName}`);
      process.exit(1);
    }
  }

  // Check if branch already exists
  const exists = await branchExists(branchName, repoPath);
  if (exists.exists) {
    console.log(`\n✅ Branch already exists (${exists.location})`);

    // Switch to it if not already on it
    const currentBranch = await getCurrentBranch(repoPath);
    if (currentBranch !== branchName) {
      console.log(`   Current branch: ${currentBranch}`);

      if (!options.noSwitch) {
        console.log(`   Switching to ${branchName}...`);

        // Handle uncommitted changes
        if (await hasUncommittedChanges(repoPath)) {
          console.log('   ⚠️  Uncommitted changes detected');

          if (options.autoStash) {
            await gitCommand(`git stash push -m "Auto-stash for ${sdId}"`, repoPath);
            console.log('   ✅ Changes stashed');
          } else {
            const choice = await prompt('   Stash changes and switch? (y/n): ');
            if (choice.toLowerCase() === 'y') {
              await gitCommand(`git stash push -m "Auto-stash for ${sdId}"`, repoPath);
              console.log('   ✅ Changes stashed');
            } else {
              console.log('   Skipping branch switch');
              return { success: true, branchName, switched: false, created: false };
            }
          }
        }

        // Fetch from remote if needed
        if (exists.location === 'remote') {
          await gitCommand('git fetch origin', repoPath);
        }

        // Switch branch
        const switchResult = await gitCommand(`git checkout ${branchName}`, repoPath);
        if (switchResult.success) {
          console.log(`   ✅ Switched to ${branchName}`);
        } else {
          console.log(`   ❌ Failed to switch: ${switchResult.stderr}`);
        }
      }
    } else {
      console.log('   Already on correct branch');
    }

    return { success: true, branchName, switched: true, created: false };
  }

  // Branch doesn't exist - create it
  console.log('\n🔨 Creating branch...');

  // Handle uncommitted changes
  let stashed = false;
  if (await hasUncommittedChanges(repoPath)) {
    console.log('   ⚠️  Uncommitted changes detected');

    if (options.autoStash) {
      await gitCommand(`git stash push -m "Pre-branch ${sdId}"`, repoPath);
      console.log('   ✅ Changes stashed');
      stashed = true;
    } else {
      const choice = await prompt('   Stash changes and create branch? (y/n): ');
      if (choice.toLowerCase() === 'y') {
        await gitCommand(`git stash push -m "Pre-branch ${sdId}"`, repoPath);
        console.log('   ✅ Changes stashed');
        stashed = true;
      } else {
        console.log('❌ Cannot create branch with uncommitted changes');
        process.exit(1);
      }
    }
  }

  // Ensure we're on main/master first
  const currentBranch = await getCurrentBranch(repoPath);
  if (currentBranch !== 'main' && currentBranch !== 'master') {
    console.log(`   Switching to main branch first (currently on ${currentBranch})...`);
    const checkoutMain = await gitCommand('git checkout main', repoPath);
    if (!checkoutMain.success) {
      // Try master
      await gitCommand('git checkout master', repoPath);
    }

    // Pull latest
    console.log('   Pulling latest changes...');
    await gitCommand('git pull origin main', repoPath);
  }

  // Create and checkout new branch
  const createResult = await gitCommand(`git checkout -b ${branchName}`, repoPath);

  if (!createResult.success) {
    console.log(`❌ Failed to create branch: ${createResult.stderr}`);

    // Restore stashed changes if we stashed
    if (stashed) {
      await gitCommand('git stash pop', repoPath);
      console.log('   ✅ Changes restored from stash');
    }

    process.exit(1);
  }

  console.log(`✅ Branch created: ${branchName}`);

  // Set up remote tracking
  console.log('   Setting up remote tracking...');
  const pushResult = await gitCommand(`git push -u origin ${branchName}`, repoPath);
  if (pushResult.success) {
    console.log('   ✅ Remote tracking set up');
  } else {
    console.log('   ⚠️  Remote tracking not set (will be set on first push)');
  }

  // Restore stashed changes
  if (stashed) {
    console.log('   Restoring stashed changes...');
    const popResult = await gitCommand('git stash pop', repoPath);
    if (popResult.success) {
      console.log('   ✅ Changes restored');
    } else {
      console.log('   ⚠️  Could not restore stash (may have conflicts)');
    }
  }

  // Update database with branch name
  if (sd) {
    console.log('\n📝 Updating database...');
    const { error: updateError } = await supabase
      .from('strategic_directives')
      .update({ branch_name: branchName })
      .eq('id', sdId);

    if (updateError) {
      // Try prds table
      await supabase
        .from('prds')
        .update({ branch_name: branchName })
        .eq('sd_id', sdId);
    }
    console.log('   ✅ Branch name recorded in database');
  }

  // Success summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ SD BRANCH READY');
  console.log('='.repeat(60));
  console.log(`   SD ID:      ${sdId}`);
  console.log(`   Branch:     ${branchName}`);
  console.log(`   Repository: ${targetApp}`);
  console.log(`   Path:       ${repoPath}`);
  console.log('\n📍 Next Steps:');
  console.log('   1. Run PLAN-TO-EXEC handoff: npm run handoff execute PLAN-TO-EXEC ' + sdId);
  console.log('   2. Begin implementation');
  console.log('   3. Commit with: git commit -m "feat(' + sdId + '): description"');
  console.log('');

  return { success: true, branchName, switched: true, created: true };
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--check') {
    options.checkOnly = true;
  } else if (arg === '--title') {
    options.title = args[++i];
  } else if (arg === '--app') {
    options.app = args[++i];
  } else if (arg === '--auto-stash' || arg === '-y') {
    options.autoStash = true;
  } else if (arg === '--no-switch') {
    options.noSwitch = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
LEO Protocol - SD Branch Creation

Usage:
  node scripts/create-sd-branch.js <SD-ID> [options]
  node scripts/create-sd-branch.js --check <SD-ID>

Options:
  --check             Check if branch exists (exit 0 if yes, 1 if no)
  --title <title>     Override SD title for branch naming
  --app <EHG|EHG_Engineer>  Target application (auto-detected from DB)
  --auto-stash, -y    Automatically stash uncommitted changes
  --no-switch         Don't switch to branch if it already exists
  --help, -h          Show this help

Examples:
  node scripts/create-sd-branch.js SD-UAT-001
  node scripts/create-sd-branch.js SD-UAT-001 --auto-stash
  node scripts/create-sd-branch.js SD-UAT-001 --app EHG_Engineer
  node scripts/create-sd-branch.js --check SD-UAT-001

Naming Convention:
  <type>/<SD-ID>-<slug>

  Types: feat (default), fix, docs, refactor, test, chore, perf, ci
  Type is derived from SD-ID (e.g., SD-FIX-001 → fix/SD-FIX-001-...)

Integration:
  - This script is called automatically during LEAD-TO-PLAN handoff
  - Can be run manually anytime to ensure branch exists
  - Updates database with branch name for tracking
`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    options.sdId = arg;
  }
}

// Run
createSDBranch(options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

export { createSDBranch, generateBranchName, branchExists };
