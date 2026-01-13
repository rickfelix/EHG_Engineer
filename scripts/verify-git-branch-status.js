#!/usr/bin/env node

/**
 * Git Branch Enforcement Gate (GATE 6)
 *
 * Verifies correct branch exists and is checked out before EXEC work begins.
 * Automates branch creation and switching to prevent wrong-branch issues.
 *
 * ENFORCEMENT POINT: PLAN→EXEC handoff (before implementation starts)
 * BLOCKING: Cannot proceed without correct branch
 *
 * Exit Codes:
 * 0 = PASS (on correct branch, ready for EXEC work)
 * 1 = FAIL (branch issues, cannot proceed with EXEC)
 *
 * Features:
 * - Auto-creates branch if missing
 * - Auto-switches to correct branch (with stash)
 * - Validates branch naming convention
 * - Sets up remote tracking
 * - Prevents work on main/master branches
 *
 * Usage:
 *   node scripts/verify-git-branch-status.js SD-XXX "Title" /path/to/app
 *   node scripts/verify-git-branch-status.js SD-XXX "Title"  # defaults to EHG_ROOT (cross-platform)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');
const EHG_ROOT = path.resolve(__dirname, '../../ehg');

const execAsync = promisify(exec);

class GitBranchVerifier {
  constructor(sdId, sdTitle, appPath = EHG_ROOT) {
    this.sdId = sdId;
    this.sdTitle = sdTitle || '';
    this.appPath = appPath;
    this.expectedBranchName = this.generateBranchName(sdId, sdTitle);

    this.results = {
      branchExists: false,
      onCorrectBranch: false,
      branchNamingValid: false,
      branchMatchesSD: false,
      remoteTrackingSetup: false,
      verdict: 'FAIL',
      blockers: [],
      warnings: [],
      actions: [],
      currentBranch: null,
      expectedBranch: this.expectedBranchName,
      branchCreated: false,
      branchSwitched: false,
      changesStashed: false
    };
  }

  /**
   * Generate standardized branch name from SD-ID and title
   * Format: <type>/<SD-ID>-<slug>
   * Example: feat/SD-2025-001-voice-api
   */
  generateBranchName(sdId, title) {
    // Determine branch type prefix from SD-ID or default to 'feat'
    const typeMap = {
      'FIX': 'fix',
      'DOCS': 'docs',
      'REFACTOR': 'refactor',
      'TEST': 'test',
      'CHORE': 'chore'
    };

    // Extract type from SD-ID if present (e.g., SD-FIX-001 → fix)
    let branchType = 'feat'; // default
    for (const [key, value] of Object.entries(typeMap)) {
      if (sdId.toUpperCase().includes(key)) {
        branchType = value;
        break;
      }
    }

    // Create slug from title (lowercase, replace spaces with hyphens, remove special chars)
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
   * Execute git command in app directory
   */
  async gitCommand(command) {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.appPath });
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
   * Check 1: Verify branch exists (local or remote)
   */
  async checkBranchExists() {
    console.log('\n🔍 CHECK 1: Branch Exists for SD');
    console.log('-'.repeat(50));
    console.log(`   Expected branch: ${this.expectedBranchName}`);

    // Check local branches
    const localResult = await this.gitCommand('git branch --list');
    const localBranches = localResult.stdout.split('\n').map(b => b.trim().replace(/^\* /, ''));

    const localMatch = localBranches.find(b => b === this.expectedBranchName);

    if (localMatch) {
      console.log('✅ Branch exists locally');
      this.results.branchExists = true;
      return true;
    }

    // Check remote branches
    const remoteResult = await this.gitCommand(`git ls-remote --heads origin ${this.expectedBranchName}`);

    if (remoteResult.success && remoteResult.stdout.length > 0) {
      console.log('✅ Branch exists on remote (will fetch)');
      this.results.branchExists = true;
      this.results.warnings.push('Branch exists on remote but not locally - will fetch');
      return true;
    }

    console.log('⚠️  Branch does not exist (will create)');
    this.results.branchExists = false;
    this.results.actions.push('create_branch');
    return false; // Will create in later step
  }

  /**
   * Check 2: Verify currently on correct branch
   */
  async checkCurrentBranch() {
    console.log('\n🔍 CHECK 2: Current Branch');
    console.log('-'.repeat(50));

    const result = await this.gitCommand('git branch --show-current');

    if (!result.success || !result.stdout) {
      this.results.blockers.push('Could not determine current branch');
      console.error('❌ Failed to get current branch');
      return false;
    }

    const currentBranch = result.stdout;
    this.results.currentBranch = currentBranch;
    console.log(`   Current branch: ${currentBranch}`);
    console.log(`   Expected branch: ${this.expectedBranchName}`);

    if (currentBranch === this.expectedBranchName) {
      console.log('✅ Already on correct branch');
      this.results.onCorrectBranch = true;
      return true;
    }

    // Check if on protected branch (main/master)
    if (currentBranch === 'main' || currentBranch === 'master') {
      this.results.blockers.push(`Currently on protected branch "${currentBranch}" - EXEC work must be on feature branch`);
      console.error(`❌ On protected branch: ${currentBranch}`);
      console.error('   EXEC work cannot be done on main/master branch');
      this.results.actions.push('switch_branch');
      return false;
    }

    console.log('⚠️  On different branch (will switch)');
    this.results.onCorrectBranch = false;
    this.results.actions.push('switch_branch');
    return false; // Will switch in later step
  }

  /**
   * Check 3: Validate branch naming convention
   */
  async checkBranchNaming() {
    console.log('\n🔍 CHECK 3: Branch Naming Convention');
    console.log('-'.repeat(50));

    const branchPattern = /^(feat|fix|docs|refactor|test|chore)\/SD-[A-Z0-9-]+/;

    if (!this.expectedBranchName.match(branchPattern)) {
      this.results.warnings.push(`Branch name "${this.expectedBranchName}" does not match standard convention`);
      console.warn(`⚠️  Non-standard branch name: ${this.expectedBranchName}`);
      console.warn('   Expected format: <type>/SD-XXX-<description>');
      this.results.branchNamingValid = false;
      return false;
    }

    console.log('✅ Branch naming follows convention');
    this.results.branchNamingValid = true;
    return true;
  }

  /**
   * Check 4: Verify branch matches SD-ID
   */
  async checkBranchMatchesSD() {
    console.log('\n🔍 CHECK 4: Branch Matches SD-ID');
    console.log('-'.repeat(50));

    // Extract SD-ID from expected branch name
    // Match SD-ID patterns like: SD-E2E-FOUNDATION-001-R2, SD-2025-001, SD-VISION-V2-005, SD-PARENT-4.0-A
    // SD-ID segments are UPPERCASE alphanumeric (with optional dots for versions), slug is lowercase
    // Pattern: SD- followed by uppercase/numeric/dot segments (stops at first lowercase char)
    const sdMatch = this.expectedBranchName.match(/SD-[A-Z0-9.]+(-[A-Z0-9.]+)*/);

    if (!sdMatch) {
      this.results.warnings.push('Could not extract SD-ID from branch name');
      console.warn('⚠️  Could not validate SD-ID in branch name');
      return true; // Don't block, just warn
    }

    const branchSDId = sdMatch[0];

    if (branchSDId !== this.sdId) {
      this.results.blockers.push(`Branch SD-ID "${branchSDId}" does not match target SD-ID "${this.sdId}"`);
      console.error(`❌ Branch SD-ID mismatch: ${branchSDId} vs ${this.sdId}`);
      return false;
    }

    console.log(`✅ Branch matches SD-ID: ${this.sdId}`);
    this.results.branchMatchesSD = true;
    return true;
  }

  /**
   * Check 5: Verify remote tracking setup
   */
  async checkRemoteTracking() {
    console.log('\n🔍 CHECK 5: Remote Tracking');
    console.log('-'.repeat(50));

    // Only check if branch exists locally
    if (!this.results.branchExists) {
      console.log('⚠️  Branch does not exist yet (will setup tracking after creation)');
      return true; // Will setup during creation
    }

    const result = await this.gitCommand(`git rev-parse --abbrev-ref ${this.expectedBranchName}@{upstream}`);

    if (!result.success) {
      console.log('⚠️  No remote tracking configured (will setup)');
      this.results.remoteTrackingSetup = false;
      this.results.actions.push('setup_tracking');
      return false; // Will setup in later step
    }

    console.log(`✅ Remote tracking: ${result.stdout}`);
    this.results.remoteTrackingSetup = true;
    return true;
  }

  /**
   * ACTION 1: Create branch if it does not exist
   */
  async createBranch() {
    console.log('\n🔨 ACTION: Creating Branch');
    console.log('-'.repeat(50));

    // Check for uncommitted changes before creating branch
    const statusResult = await this.gitCommand('git status --porcelain');
    if (statusResult.stdout.length > 0) {
      console.log('⚠️  Uncommitted changes detected - stashing before branch creation');
      await this.gitCommand('git stash push -m "GATE-6: Auto-stash before branch creation"');
      this.results.changesStashed = true;
    }

    // Create and checkout new branch
    const createResult = await this.gitCommand(`git checkout -b ${this.expectedBranchName}`);

    if (!createResult.success) {
      this.results.blockers.push(`Failed to create branch: ${createResult.stderr}`);
      console.error(`❌ Branch creation failed: ${createResult.stderr}`);

      // Restore stashed changes if creation failed
      if (this.results.changesStashed) {
        await this.gitCommand('git stash pop');
        this.results.changesStashed = false;
      }

      return false;
    }

    console.log(`✅ Branch created: ${this.expectedBranchName}`);
    this.results.branchCreated = true;
    this.results.branchExists = true;
    this.results.onCorrectBranch = true;

    // Restore stashed changes
    if (this.results.changesStashed) {
      const popResult = await this.gitCommand('git stash pop');
      if (popResult.success) {
        console.log('✅ Stashed changes restored');
        this.results.changesStashed = false;
      } else {
        console.warn('⚠️  Could not restore stashed changes - check git stash list');
      }
    }

    // Push to remote with tracking
    await this.setupRemoteTracking();

    return true;
  }

  /**
   * ACTION 2: Switch to correct branch (with stash)
   */
  async switchBranch() {
    console.log('\n🔨 ACTION: Switching Branch');
    console.log('-'.repeat(50));
    console.log(`   From: ${this.results.currentBranch}`);
    console.log(`   To: ${this.expectedBranchName}`);

    // Check for uncommitted changes
    const statusResult = await this.gitCommand('git status --porcelain');

    if (statusResult.stdout.length > 0) {
      console.log('⚠️  Uncommitted changes detected - stashing before switch');
      const stashResult = await this.gitCommand('git stash push -m "GATE-6: Auto-stash before branch switch"');

      if (!stashResult.success) {
        this.results.blockers.push('Cannot stash uncommitted changes before branch switch');
        console.error('❌ Failed to stash changes');
        return false;
      }

      this.results.changesStashed = true;
      console.log('✅ Changes stashed');
    }

    // Check if branch exists locally, if not fetch from remote or create
    const localBranchCheck = await this.gitCommand(`git rev-parse --verify ${this.expectedBranchName}`);

    if (!localBranchCheck.success) {
      // Try fetching from remote
      console.log('   Branch not found locally, checking remote...');
      const fetchResult = await this.gitCommand(`git fetch origin ${this.expectedBranchName}:${this.expectedBranchName}`);

      if (!fetchResult.success) {
        // Branch does not exist anywhere, create it
        console.log('   Branch not found on remote, creating new branch...');
        return await this.createBranch();
      }

      console.log('✅ Branch fetched from remote');
    }

    // Switch to branch
    const checkoutResult = await this.gitCommand(`git checkout ${this.expectedBranchName}`);

    if (!checkoutResult.success) {
      this.results.blockers.push(`Failed to checkout branch: ${checkoutResult.stderr}`);
      console.error(`❌ Checkout failed: ${checkoutResult.stderr}`);

      // Restore stashed changes
      if (this.results.changesStashed) {
        await this.gitCommand('git stash pop');
        this.results.changesStashed = false;
      }

      return false;
    }

    console.log(`✅ Switched to branch: ${this.expectedBranchName}`);
    this.results.branchSwitched = true;
    this.results.onCorrectBranch = true;

    // Restore stashed changes
    if (this.results.changesStashed) {
      const popResult = await this.gitCommand('git stash pop');

      if (popResult.success) {
        console.log('✅ Stashed changes restored');
        this.results.changesStashed = false;
      } else {
        console.warn('⚠️  Stash pop had conflicts - resolve manually with: git stash list');
        this.results.warnings.push('Stash pop conflicts - manual resolution required');
      }
    }

    return true;
  }

  /**
   * ACTION 3: Setup remote tracking
   */
  async setupRemoteTracking() {
    console.log('\n🔨 ACTION: Setup Remote Tracking');
    console.log('-'.repeat(50));

    // Push branch to remote with tracking
    const pushResult = await this.gitCommand(`git push -u origin ${this.expectedBranchName}`);

    if (!pushResult.success) {
      // Check if branch already exists on remote
      if (pushResult.stderr.includes('already exists')) {
        console.log('⚠️  Branch already exists on remote, setting up tracking...');
        const trackResult = await this.gitCommand(`git branch --set-upstream-to=origin/${this.expectedBranchName} ${this.expectedBranchName}`);

        if (trackResult.success) {
          console.log('✅ Remote tracking configured');
          this.results.remoteTrackingSetup = true;
          return true;
        }
      }

      this.results.warnings.push(`Could not setup remote tracking: ${pushResult.stderr}`);
      console.warn(`⚠️  Remote tracking setup failed: ${pushResult.stderr}`);
      return false; // Don't block on this
    }

    console.log('✅ Branch pushed to remote with tracking');
    this.results.remoteTrackingSetup = true;
    return true;
  }

  /**
   * Run all checks and execute actions as needed
   */
  async verify() {
    console.log('\n🔐 GIT BRANCH ENFORCEMENT GATE (GATE 6)');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${this.sdId}`);
    console.log(`SD Title: ${this.sdTitle || 'N/A'}`);
    console.log(`Application Path: ${this.appPath}`);
    console.log(`Expected Branch: ${this.expectedBranchName}`);

    // Verify app path exists
    if (!fs.existsSync(this.appPath)) {
      console.error(`\n❌ ERROR: Application path does not exist: ${this.appPath}`);
      this.results.blockers.push('Application path does not exist');
      this.results.verdict = 'FAIL';
      return this.results;
    }

    // Verify it's a git repository
    const gitDir = path.join(this.appPath, '.git');
    if (!fs.existsSync(gitDir)) {
      console.error(`\n❌ ERROR: Not a git repository: ${this.appPath}`);
      this.results.blockers.push('Not a git repository');
      this.results.verdict = 'FAIL';
      return this.results;
    }

    // Run all checks
    const _check1 = await this.checkBranchExists();
    const _check2 = await this.checkCurrentBranch();
    const _check3 = await this.checkBranchNaming();
    const _check4 = await this.checkBranchMatchesSD();
    const _check5 = await this.checkRemoteTracking();

    // Execute actions based on check results
    if (this.results.actions.includes('create_branch') && !this.results.branchExists) {
      const created = await this.createBranch();
      if (!created) {
        this.results.verdict = 'FAIL';
        this.printSummary();
        return this.results;
      }
    } else if (this.results.actions.includes('switch_branch') && !this.results.onCorrectBranch) {
      const switched = await this.switchBranch();
      if (!switched) {
        this.results.verdict = 'FAIL';
        this.printSummary();
        return this.results;
      }
    }

    // Setup tracking if needed (and not already done during create/switch)
    if (this.results.actions.includes('setup_tracking') && this.results.branchExists && this.results.onCorrectBranch) {
      await this.setupRemoteTracking();
    }

    // Final verification: Check if on correct branch now
    const finalBranchCheck = await this.gitCommand('git branch --show-current');
    const finalBranch = finalBranchCheck.stdout;

    if (finalBranch !== this.expectedBranchName) {
      this.results.blockers.push(`Final verification failed: still on "${finalBranch}" instead of "${this.expectedBranchName}"`);
      this.results.verdict = 'FAIL';
    } else {
      this.results.verdict = this.results.blockers.length === 0 ? 'PASS' : 'FAIL';
    }

    this.printSummary();
    return this.results;
  }

  /**
   * Print summary of verification results
   */
  printSummary() {
    console.log('\n📊 VERIFICATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Branch Exists:            ${this.results.branchExists ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`On Correct Branch:        ${this.results.onCorrectBranch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Branch Naming Valid:      ${this.results.branchNamingValid ? '✅ PASS' : '⚠️  WARN'}`);
    console.log(`Branch Matches SD:        ${this.results.branchMatchesSD ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Remote Tracking Setup:    ${this.results.remoteTrackingSetup ? '✅ PASS' : '⚠️  WARN'}`);
    console.log('-'.repeat(50));
    console.log(`Current Branch:  ${this.results.currentBranch || 'N/A'}`);
    console.log(`Expected Branch: ${this.expectedBranchName}`);
    console.log(`Verdict: ${this.results.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);

    if (this.results.branchCreated) {
      console.log(`\n🎉 Branch created: ${this.expectedBranchName}`);
    }

    if (this.results.branchSwitched) {
      console.log(`\n🔄 Switched to branch: ${this.expectedBranchName}`);
    }

    if (this.results.blockers.length > 0) {
      console.log('\n🚨 BLOCKERS:');
      this.results.blockers.forEach((blocker, i) => {
        console.log(`   ${i + 1}. ${blocker}`);
      });
    }

    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
    }

    if (this.results.verdict === 'FAIL') {
      console.log('\n❌ GATE 6 FAILED: Cannot proceed with EXEC work');
      console.log('\n📋 REQUIRED ACTIONS:');
      console.log('   1. Ensure you are on the correct branch for this SD');
      console.log('   2. Verify branch naming follows convention: <type>/SD-XXX-<description>');
      console.log('   3. Resolve any git conflicts if present');
      console.log('   4. Re-run PLAN→EXEC handoff');
      console.log('');
    } else {
      console.log('\n✅ GATE 6 PASSED: On correct branch, ready for EXEC work');
      console.log(`   Branch: ${this.expectedBranchName}`);
      console.log(`   Remote tracking: ${this.results.remoteTrackingSetup ? 'configured' : 'not configured (will setup on first push)'}`);
    }

    console.log('='.repeat(50));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Git Branch Enforcement Gate (GATE 6)');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node verify-git-branch-status.js SD-XXX "SD Title" [APP_PATH]');
    console.log('');
    console.log('Arguments:');
    console.log('  SD-XXX     Strategic Directive ID (required)');
    console.log('  "SD Title" Strategic Directive title for branch naming (required)');
    console.log('  APP_PATH   Path to application directory (default: EHG_ROOT)');
    console.log('');
    console.log('Examples:');
    console.log('  node verify-git-branch-status.js SD-EXPORT-001 "Data Export Feature"');
    console.log('  node verify-git-branch-status.js SD-EXPORT-001 "Data Export Feature" /path/to/ehg');
    console.log('');
    console.log('Features:');
    console.log('  • Auto-creates branch if missing');
    console.log('  • Auto-switches to correct branch (with stash)');
    console.log('  • Validates branch naming convention');
    console.log('  • Sets up remote tracking');
    console.log('  • Prevents work on main/master branches');
    console.log('');
    console.log('Exit Codes:');
    console.log('  0 = PASS (on correct branch, ready for EXEC)');
    console.log('  1 = FAIL (branch issues, cannot proceed)');
    process.exit(0);
  }

  const sdId = args[0];
  const sdTitle = args[1] || '';
  const appPath = args[2] || EHG_ROOT;

  const verifier = new GitBranchVerifier(sdId, sdTitle, appPath);
  const results = await verifier.verify();

  // Exit with appropriate code
  process.exit(results.verdict === 'PASS' ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

export default GitBranchVerifier;
