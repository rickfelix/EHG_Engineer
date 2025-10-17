#!/usr/bin/env node

/**
 * Git Commit Enforcement Gate (GATE 5)
 *
 * Verifies git status is clean and all commits pushed before PLAN→LEAD handoff.
 * This prevents lost work due to uncommitted changes.
 *
 * ENFORCEMENT POINT: PLAN→LEAD handoff only
 * BLOCKING: Cannot proceed with uncommitted changes
 *
 * Exit Codes:
 * 0 = PASS (clean git status, commits exist, all pushed)
 * 1 = FAIL (uncommitted changes, no commits, or unpushed commits)
 *
 * Usage:
 *   node scripts/verify-git-commit-status.js SD-XXX /path/to/app
 *   node scripts/verify-git-commit-status.js SD-XXX  # defaults to /mnt/c/_EHG/ehg
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

class GitCommitVerifier {
  constructor(sdId, appPath = '/mnt/c/_EHG/ehg') {
    this.sdId = sdId;
    this.appPath = appPath;
    this.results = {
      cleanWorkingDirectory: false,
      commitsExist: false,
      allCommitsPushed: false,
      remoteBranchExists: false,
      verdict: 'FAIL',
      blockers: [],
      warnings: [],
      commitCount: 0,
      unpushedCount: 0,
      uncommittedFiles: []
    };
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
   * Check 1: Clean working directory (no uncommitted changes)
   */
  async checkCleanWorkingDirectory() {
    console.log('\n🔍 CHECK 1: Clean Working Directory');
    console.log('-'.repeat(50));

    const result = await this.gitCommand('git status --porcelain');

    if (!result.success) {
      this.results.blockers.push('Git command failed - is this a git repository?');
      console.error('❌ Git command failed:', result.stderr);
      return false;
    }

    const uncommittedLines = result.stdout.split('\n').filter(line => line.trim().length > 0);

    if (uncommittedLines.length === 0) {
      console.log('✅ Working directory is clean (no uncommitted changes)');
      this.results.cleanWorkingDirectory = true;
      return true;
    }

    // Parse uncommitted files
    this.results.uncommittedFiles = uncommittedLines.map(line => {
      const status = line.substring(0, 2);
      const file = line.substring(3);
      return { status, file };
    });

    // Filter to only source code files (ignore temp/coverage/test artifact files)
    const sourceFiles = this.results.uncommittedFiles.filter(item => {
      const file = item.file;
      return !file.includes('node_modules') &&
             !file.includes('coverage') &&
             !file.includes('.tmp') &&
             !file.includes('.temp') &&
             !file.includes('.env') &&
             !file.includes('.auth') &&
             !file.includes('auth/user.json') &&
             !file.includes('test-results/') &&
             !file.startsWith('docs/workflow/metrics/') &&
             (file.endsWith('.tsx') || file.endsWith('.ts') ||
              file.endsWith('.jsx') || file.endsWith('.js') ||
              file.endsWith('.css') || file.endsWith('.sql') ||
              file.endsWith('.json'));
    });

    if (sourceFiles.length > 0) {
      this.results.blockers.push(`${sourceFiles.length} uncommitted source files detected`);
      console.error(`❌ Uncommitted changes detected (${sourceFiles.length} source files):`);
      sourceFiles.slice(0, 10).forEach(item => {
        console.error(`   ${item.status} ${item.file}`);
      });
      if (sourceFiles.length > 10) {
        console.error(`   ... and ${sourceFiles.length - 10} more`);
      }
      return false;
    }

    // Only non-source files uncommitted (temp files, etc)
    console.log(`⚠️  ${uncommittedLines.length} uncommitted files (non-source, acceptable)`);
    this.results.cleanWorkingDirectory = true;
    return true;
  }

  /**
   * Check 2: Commits exist for this SD
   */
  async checkCommitsExist() {
    console.log('\n🔍 CHECK 2: Commits Exist for SD');
    console.log('-'.repeat(50));

    const result = await this.gitCommand(`git log --all --oneline --grep="${this.sdId}"`);

    if (!result.success) {
      this.results.blockers.push('Failed to check git log');
      console.error('❌ Git log command failed:', result.stderr);
      return false;
    }

    const commits = result.stdout.split('\n').filter(line => line.trim().length > 0);
    this.results.commitCount = commits.length;

    if (commits.length === 0) {
      this.results.blockers.push(`No commits found with SD-ID: ${this.sdId}`);
      console.error(`❌ No commits found containing "${this.sdId}"`);
      console.error('   Implementation work must be committed before handoff');
      return false;
    }

    console.log(`✅ Found ${commits.length} commit(s) with SD-ID: ${this.sdId}`);
    commits.slice(0, 5).forEach(commit => {
      console.log(`   ${commit}`);
    });
    if (commits.length > 5) {
      console.log(`   ... and ${commits.length - 5} more`);
    }

    this.results.commitsExist = true;
    return true;
  }

  /**
   * Check 3: All commits pushed to remote
   */
  async checkAllCommitsPushed() {
    console.log('\n🔍 CHECK 3: All Commits Pushed to Remote');
    console.log('-'.repeat(50));

    // Get current branch
    const branchResult = await this.gitCommand('git branch --show-current');
    if (!branchResult.success || !branchResult.stdout) {
      this.results.warnings.push('Could not determine current branch');
      console.warn('⚠️  Could not determine current branch');
      // Don't block on this - may be in detached HEAD state
      this.results.allCommitsPushed = true;
      return true;
    }

    const currentBranch = branchResult.stdout;
    console.log(`   Current branch: ${currentBranch}`);

    // Check if branch has remote tracking
    const trackingResult = await this.gitCommand(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`);
    if (!trackingResult.success) {
      this.results.blockers.push(`Branch "${currentBranch}" has no remote tracking branch`);
      console.error(`❌ Branch "${currentBranch}" is not tracking a remote branch`);
      console.error('   Push branch to remote: git push -u origin ' + currentBranch);
      return false;
    }

    const remoteBranch = trackingResult.stdout;
    console.log(`   Remote tracking: ${remoteBranch}`);

    // Check for unpushed commits
    const statusResult = await this.gitCommand('git status -sb');
    if (!statusResult.success) {
      this.results.warnings.push('Could not check remote sync status');
      console.warn('⚠️  Could not verify remote sync status');
      this.results.allCommitsPushed = true; // Assume OK if can't check
      return true;
    }

    // Look for "ahead" in status (e.g., "## main...origin/main [ahead 2]")
    const aheadMatch = statusResult.stdout.match(/\[ahead (\d+)\]/);
    if (aheadMatch) {
      const unpushedCount = parseInt(aheadMatch[1]);
      this.results.unpushedCount = unpushedCount;
      this.results.blockers.push(`${unpushedCount} unpushed commit(s) on branch "${currentBranch}"`);
      console.error(`❌ ${unpushedCount} commit(s) not pushed to remote`);
      console.error(`   Push commits: git push`);
      return false;
    }

    console.log('✅ All commits are pushed to remote');
    this.results.allCommitsPushed = true;
    return true;
  }

  /**
   * Check 4: Remote branch exists on GitHub
   */
  async checkRemoteBranchExists() {
    console.log('\n🔍 CHECK 4: Remote Branch Exists');
    console.log('-'.repeat(50));

    // Get current branch
    const branchResult = await this.gitCommand('git branch --show-current');
    if (!branchResult.success || !branchResult.stdout) {
      console.warn('⚠️  Could not determine current branch');
      this.results.remoteBranchExists = true; // Don't block
      return true;
    }

    const currentBranch = branchResult.stdout;

    // Check if branch exists on remote
    const remoteResult = await this.gitCommand(`git ls-remote --heads origin ${currentBranch}`);
    if (!remoteResult.success) {
      this.results.warnings.push('Could not verify remote branch existence');
      console.warn('⚠️  Could not verify remote branch existence');
      this.results.remoteBranchExists = true; // Don't block
      return true;
    }

    if (!remoteResult.stdout || remoteResult.stdout.trim().length === 0) {
      this.results.blockers.push(`Branch "${currentBranch}" does not exist on remote`);
      console.error(`❌ Branch "${currentBranch}" not found on remote`);
      console.error(`   Push branch: git push -u origin ${currentBranch}`);
      return false;
    }

    console.log(`✅ Branch "${currentBranch}" exists on remote (origin)`);
    this.results.remoteBranchExists = true;
    return true;
  }

  /**
   * Run all checks and determine verdict
   */
  async verify() {
    console.log('\n🔐 GIT COMMIT ENFORCEMENT GATE (GATE 5)');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${this.sdId}`);
    console.log(`Application Path: ${this.appPath}`);

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
    const check1 = await this.checkCleanWorkingDirectory();
    const check2 = await this.checkCommitsExist();
    const check3 = await this.checkAllCommitsPushed();
    const check4 = await this.checkRemoteBranchExists();

    // Determine verdict
    const allPassed = check1 && check2 && check3 && check4;
    this.results.verdict = allPassed ? 'PASS' : 'FAIL';

    // Print summary
    console.log('\n📊 VERIFICATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Clean Working Directory:  ${check1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Commits Exist (${this.results.commitCount}):        ${check2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`All Commits Pushed:       ${check3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Remote Branch Exists:     ${check4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log('-'.repeat(50));
    console.log(`Verdict: ${this.results.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);

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
      console.log('\n❌ GATE 5 FAILED: Cannot proceed with PLAN→LEAD handoff');
      console.log('\n📋 REQUIRED ACTIONS:');
      console.log('   1. Review all uncommitted changes');
      console.log('   2. Commit changes with proper message format:');
      console.log('      git commit -m "feat/fix(' + this.sdId + '): <description>');
      console.log('');
      console.log('      🤖 Generated with [Claude Code](https://claude.com/claude-code)');
      console.log('');
      console.log('      Co-Authored-By: Claude <noreply@anthropic.com>"');
      console.log('   3. Push commits to remote: git push');
      console.log('   4. Verify all changes are committed and pushed');
      console.log('   5. Re-run PLAN→LEAD handoff');
      console.log('');
    } else {
      console.log('\n✅ GATE 5 PASSED: Git status clean, ready for PLAN→LEAD handoff');
    }

    console.log('='.repeat(50));
    return this.results;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Git Commit Enforcement Gate (GATE 5)');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node verify-git-commit-status.js SD-XXX [APP_PATH]');
    console.log('');
    console.log('Arguments:');
    console.log('  SD-XXX     Strategic Directive ID (required)');
    console.log('  APP_PATH   Path to application directory (default: /mnt/c/_EHG/ehg)');
    console.log('');
    console.log('Examples:');
    console.log('  node verify-git-commit-status.js SD-EXPORT-001');
    console.log('  node verify-git-commit-status.js SD-EXPORT-001 /mnt/c/_EHG/ehg');
    console.log('');
    console.log('Exit Codes:');
    console.log('  0 = PASS (all checks passed)');
    console.log('  1 = FAIL (one or more checks failed)');
    process.exit(0);
  }

  const sdId = args[0];
  const appPath = args[1] || '/mnt/c/_EHG/ehg';

  const verifier = new GitCommitVerifier(sdId, appPath);
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

export default GitCommitVerifier;
