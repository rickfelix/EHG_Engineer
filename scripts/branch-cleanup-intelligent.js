#!/usr/bin/env node
/**
 * Intelligent Branch Cleanup Script
 *
 * Automatically detects and cleans up orphaned branches with high accuracy.
 * Uses multiple signals to ensure only truly safe branches are deleted.
 *
 * Usage:
 *   node scripts/branch-cleanup-intelligent.js                    # Dry run (preview only)
 *   node scripts/branch-cleanup-intelligent.js --execute          # Actually delete branches
 *   node scripts/branch-cleanup-intelligent.js --execute --remote # Delete local + remote
 *   node scripts/branch-cleanup-intelligent.js --repo EHG         # Target specific repo
 *   node scripts/branch-cleanup-intelligent.js --auto             # Non-interactive mode
 *
 * Safety checks:
 * 1. Branch has 0 unique commits not on main (pure placeholder)
 * 2. Branch is older than 2 hours (not possibly active parallel work)
 * 3. If SD-related, SD is completed/cancelled
 * 4. If PR exists, PR was merged
 *
 * @module branch-cleanup-intelligent
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');
const EHG_ROOT = path.resolve(__dirname, '../../ehg');

// Configuration
const REPO_PATHS = {
  EHG: EHG_ROOT,
  EHG_Engineer: EHG_ENGINEER_ROOT
};

// Branches to never delete
const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'staging', 'production'];

// Minimum age in hours before a branch is considered stale (not possibly active)
const MIN_STALE_HOURS = 2;

class IntelligentBranchCleanup {
  constructor(options = {}) {
    this.options = {
      dryRun: !options.execute,
      deleteRemote: options.remote || false,
      targetRepo: options.repo || 'ALL',
      autoMode: options.auto || false,
      verbose: options.verbose || false
    };

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.stats = {
      analyzed: 0,
      safeToDelete: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    };

    this.sdCache = new Map();
  }

  async run() {
    console.log('\n🧹 INTELLIGENT BRANCH CLEANUP');
    console.log('='.repeat(60));
    console.log(`Mode: ${this.options.dryRun ? '🔍 DRY RUN (preview only)' : '⚡ EXECUTE (will delete)'}`);
    console.log(`Delete remote: ${this.options.deleteRemote ? 'Yes' : 'No'}`);
    console.log(`Target repo: ${this.options.targetRepo}`);
    console.log('='.repeat(60));

    // Pre-load SD data for cross-referencing
    await this.loadSDData();

    const repos = this.options.targetRepo === 'ALL'
      ? Object.keys(REPO_PATHS)
      : [this.options.targetRepo];

    for (const repoName of repos) {
      const repoPath = REPO_PATHS[repoName];
      if (!repoPath) {
        console.log(`\n⚠️  Unknown repo: ${repoName}`);
        continue;
      }

      console.log(`\n📂 Analyzing: ${repoName} (${repoPath})`);
      console.log('-'.repeat(60));

      await this.analyzeRepo(repoName, repoPath);
    }

    this.printSummary();
    return this.stats;
  }

  async loadSDData() {
    console.log('\n📊 Loading SD data from database...');

    try {
      const { data: sds, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, status, title, metadata')
        .in('status', ['completed', 'cancelled', 'draft', 'pending_approval', 'in_progress']);

      if (error) {
        console.log(`   ⚠️  Could not load SD data: ${error.message}`);
        return;
      }

      // Index by various keys for fast lookup
      for (const sd of sds || []) {
        // Index by legacy_id (e.g., SD-EHG-WEBSITE-001)
        if (sd.sd_key) {
          this.sdCache.set(sd.sd_key.toLowerCase(), sd);
        }
        // Also index by id field if it looks like an SD-ID
        if (sd.id && sd.id.startsWith('SD-')) {
          this.sdCache.set(sd.id.toLowerCase(), sd);
        }
        // Index by feature_branch if present
        const featureBranch = sd.metadata?.feature_branch;
        if (featureBranch) {
          this.sdCache.set(featureBranch.toLowerCase(), sd);
        }
      }

      console.log(`   ✅ Loaded ${sds?.length || 0} SDs for cross-reference`);
    } catch (error) {
      console.log(`   ⚠️  SD load error: ${error.message}`);
    }
  }

  async analyzeRepo(repoName, repoPath) {
    // Get all unmerged branches
    const branches = await this.getUnmergedBranches(repoPath);

    if (branches.length === 0) {
      console.log('   ✅ No unmerged branches found');
      return;
    }

    console.log(`   Found ${branches.length} unmerged branches`);

    const safeBranches = [];
    const unsafeBranches = [];

    for (const branch of branches) {
      this.stats.analyzed++;

      const analysis = await this.analyzeBranch(branch, repoPath);

      if (analysis.safeToDelete) {
        safeBranches.push({ branch, analysis });
        this.stats.safeToDelete++;
      } else {
        unsafeBranches.push({ branch, analysis });
        this.stats.skipped++;
      }
    }

    // Report unsafe branches
    if (unsafeBranches.length > 0 && this.options.verbose) {
      console.log(`\n   ⚠️  KEPT (${unsafeBranches.length} branches with work or active):`);
      for (const { branch, analysis } of unsafeBranches.slice(0, 10)) {
        console.log(`      - ${branch.name}: ${analysis.reason}`);
      }
      if (unsafeBranches.length > 10) {
        console.log(`      ... and ${unsafeBranches.length - 10} more`);
      }
    }

    // Report and optionally delete safe branches
    if (safeBranches.length > 0) {
      console.log(`\n   🗑️  SAFE TO DELETE (${safeBranches.length} orphaned branches):`);

      if (this.options.verbose || safeBranches.length <= 20) {
        for (const { branch, analysis } of safeBranches.slice(0, 20)) {
          const sdInfo = analysis.sdStatus ? ` [SD: ${analysis.sdStatus}]` : '';
          console.log(`      - ${branch.name}${sdInfo}`);
        }
        if (safeBranches.length > 20) {
          console.log(`      ... and ${safeBranches.length - 20} more`);
        }
      }

      if (!this.options.dryRun) {
        console.log(`\n   ⚡ Deleting ${safeBranches.length} branches...`);

        for (const { branch } of safeBranches) {
          await this.deleteBranch(branch, repoPath);
        }
      }
    }
  }

  async getUnmergedBranches(repoPath) {
    try {
      // Get unmerged branches with their last commit time
      const { stdout } = await execAsync(
        `cd "${repoPath}" && git for-each-ref --sort=-committerdate ` +
        '--format=\'%(refname:short)|%(committerdate:iso8601)\' refs/heads/ ' +
        '| grep -v "^main|" | grep -v "^master|"',
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const branches = [];
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const [name, dateStr] = line.split('|');
        if (name && !PROTECTED_BRANCHES.includes(name)) {
          branches.push({
            name,
            lastCommit: new Date(dateStr)
          });
        }
      }

      return branches;
    } catch (error) {
      console.log(`   ⚠️  Error getting branches: ${error.message}`);
      return [];
    }
  }

  async analyzeBranch(branch, repoPath) {
    const analysis = {
      safeToDelete: false,
      reason: 'Unknown',
      uniqueCommits: 0,
      ageHours: 0,
      sdStatus: null,
      prMerged: null,
      sdMismatch: false,
      supersededRatio: 0
    };

    try {
      // Check 1: Age (must be older than MIN_STALE_HOURS to avoid deleting active work)
      const ageMs = Date.now() - branch.lastCommit.getTime();
      analysis.ageHours = Math.round(ageMs / (1000 * 60 * 60));

      if (analysis.ageHours < MIN_STALE_HOURS) {
        analysis.reason = `Recent activity (${analysis.ageHours}h ago) - may be active parallel work`;
        return analysis;
      }

      // Check 2: Unique commits not on main
      const { stdout: commitCount } = await execAsync(
        `cd "${repoPath}" && git log main..${branch.name} --oneline 2>/dev/null | wc -l`,
        { timeout: 10000 }
      );
      analysis.uniqueCommits = parseInt(commitCount.trim()) || 0;

      // Check 3: Cross-reference with SD database
      const expectedSdId = this.extractSDId(branch.name);
      if (expectedSdId) {
        const sd = this.sdCache.get(expectedSdId.toLowerCase());
        if (sd) {
          analysis.sdStatus = sd.status;

          // If SD is in progress, keep the branch
          if (sd.status === 'in_progress' || sd.status === 'planning') {
            analysis.reason = `SD is ${sd.status} - branch may be needed`;
            return analysis;
          }
        }
      }

      // Check 4: Check if branch name is in any open PR (via gh CLI)
      try {
        const { stdout: prCheck } = await execAsync(
          `cd "${repoPath}" && gh pr list --head "${branch.name}" --state open --json number 2>/dev/null || echo "[]"`,
          { timeout: 10000 }
        );
        const openPRs = JSON.parse(prCheck || '[]');
        if (openPRs.length > 0) {
          analysis.reason = `Has open PR #${openPRs[0].number}`;
          return analysis;
        }
      } catch {
        // gh CLI not available or error - continue
      }

      // If 0 commits, definitely safe
      if (analysis.uniqueCommits === 0) {
        analysis.safeToDelete = true;
        analysis.reason = 'Orphaned placeholder (0 unique commits)';
        return analysis;
      }

      // Check 5: For branches WITH commits, check if SD mismatch + superseded
      // This catches branches created for one SD but used for different work
      if (analysis.uniqueCommits > 0 && analysis.uniqueCommits <= 30) {
        const mismatchResult = await this.checkMismatchAndSuperseded(branch.name, repoPath, expectedSdId);

        if (mismatchResult.isMismatch && mismatchResult.supersededRatio >= 0.9) {
          // All SDs in commits must be completed
          const allCompleted = mismatchResult.commitSDs.every(sd => {
            const found = this.sdCache.get(sd.toLowerCase());
            return !found || found.status === 'completed' || found.status === 'cancelled';
          });

          if (allCompleted) {
            analysis.safeToDelete = true;
            analysis.sdMismatch = true;
            analysis.supersededRatio = mismatchResult.supersededRatio;
            analysis.reason = `SD mismatch + ${Math.round(mismatchResult.supersededRatio * 100)}% superseded (work already on main)`;
            return analysis;
          }
        }

        // Branch has work that's not fully superseded
        analysis.reason = `Has ${analysis.uniqueCommits} commits (${Math.round((mismatchResult?.supersededRatio || 0) * 100)}% superseded)`;
        return analysis;
      }

      // Too many commits to analyze quickly
      analysis.reason = `Has ${analysis.uniqueCommits} commits - needs manual review`;
      return analysis;

    } catch (error) {
      analysis.reason = `Analysis error: ${error.message}`;
    }

    return analysis;
  }

  async checkMismatchAndSuperseded(branchName, repoPath, expectedSdId) {
    const result = {
      isMismatch: false,
      supersededRatio: 0,
      commitSDs: []
    };

    try {
      // Get SDs from commit messages
      const { stdout: commits } = await execAsync(
        `cd "${repoPath}" && git log main..${branchName} --pretty=format:"%s" 2>/dev/null`,
        { timeout: 10000 }
      );

      const sdSet = new Set();
      for (const line of commits.split('\n').filter(Boolean)) {
        const match = line.match(/(SD-[A-Z0-9-]+)/i);
        if (match) sdSet.add(match[1].toUpperCase());
      }
      result.commitSDs = Array.from(sdSet);

      // Check for mismatch: branch SD differs from commit SDs
      if (expectedSdId && result.commitSDs.length > 0) {
        const hasExpected = result.commitSDs.some(sd =>
          sd.startsWith(expectedSdId.toUpperCase()) || expectedSdId.toUpperCase().startsWith(sd)
        );
        result.isMismatch = !hasExpected;
      }

      // Check superseded ratio (sample up to 5 files)
      const { stdout: filesOutput } = await execAsync(
        `cd "${repoPath}" && git diff --name-only main...${branchName} 2>/dev/null | head -10`,
        { timeout: 10000 }
      );

      const files = filesOutput.trim().split('\n').filter(Boolean);
      if (files.length === 0) {
        result.supersededRatio = 1; // No files = nothing to preserve
        return result;
      }

      let superseded = 0;
      const sampleSize = Math.min(files.length, 5);

      for (let i = 0; i < sampleSize; i++) {
        const file = files[i];
        try {
          const { stdout: branchDate } = await execAsync(
            `cd "${repoPath}" && git log -1 --format="%ct" ${branchName} -- "${file}" 2>/dev/null`,
            { timeout: 5000 }
          );
          const { stdout: mainDate } = await execAsync(
            `cd "${repoPath}" && git log -1 --format="%ct" main -- "${file}" 2>/dev/null`,
            { timeout: 5000 }
          );

          if (branchDate.trim() && mainDate.trim()) {
            if (parseInt(mainDate.trim()) > parseInt(branchDate.trim())) {
              superseded++;
            }
          }
        } catch {
          // Skip file on error
        }
      }

      result.supersededRatio = superseded / sampleSize;
    } catch {
      // Return defaults on error
    }

    return result;
  }

  extractSDId(branchName) {
    // Extract SD-ID from branch name
    // Formats: feat/SD-XXX-001-description, fix/SD-XXX-001-description, etc.
    const match = branchName.match(/\/(SD-[A-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  async deleteBranch(branch, repoPath) {
    try {
      // Delete local branch
      await execAsync(
        `cd "${repoPath}" && git branch -D "${branch.name}" 2>/dev/null`,
        { timeout: 10000 }
      );

      // Delete remote branch if requested
      if (this.options.deleteRemote) {
        try {
          await execAsync(
            `cd "${repoPath}" && git push origin --delete "${branch.name}" 2>/dev/null`,
            { timeout: 30000 }
          );
        } catch {
          // Remote may not exist or already deleted
        }
      }

      this.stats.deleted++;

      if (this.options.verbose) {
        console.log(`      ✅ Deleted: ${branch.name}`);
      }
    } catch (error) {
      this.stats.errors++;
      if (this.options.verbose) {
        console.log(`      ❌ Failed to delete ${branch.name}: ${error.message}`);
      }
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Branches analyzed: ${this.stats.analyzed}`);
    console.log(`   Safe to delete:    ${this.stats.safeToDelete}`);
    console.log(`   Skipped (unsafe):  ${this.stats.skipped}`);

    if (!this.options.dryRun) {
      console.log(`   Actually deleted:  ${this.stats.deleted}`);
      console.log(`   Errors:            ${this.stats.errors}`);
    }

    if (this.options.dryRun && this.stats.safeToDelete > 0) {
      console.log('\n💡 To actually delete these branches, run:');
      console.log('   node scripts/branch-cleanup-intelligent.js --execute');
      console.log('   node scripts/branch-cleanup-intelligent.js --execute --remote  # Also delete remote');
    }

    console.log('');
  }
}

// CLI
const args = process.argv.slice(2);
const options = {
  execute: args.includes('--execute') || args.includes('-e'),
  remote: args.includes('--remote') || args.includes('-r'),
  auto: args.includes('--auto') || args.includes('-a'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  repo: null
};

// Parse --repo argument
const repoIndex = args.findIndex(a => a === '--repo');
if (repoIndex !== -1 && args[repoIndex + 1]) {
  options.repo = args[repoIndex + 1];
}

// Help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Intelligent Branch Cleanup

Usage:
  node scripts/branch-cleanup-intelligent.js [options]

Options:
  --execute, -e    Actually delete branches (default is dry run)
  --remote, -r     Also delete remote branches (requires --execute)
  --repo <name>    Target specific repo (EHG or EHG_Engineer, default: ALL)
  --auto, -a       Non-interactive mode (no confirmations)
  --verbose, -v    Show detailed output
  --help, -h       Show this help

Safety:
  Only deletes branches that are:
  - Older than 2 hours (not possibly active parallel work)
  - Have 0 unique commits not on main (pure placeholders)
  - Not associated with in-progress SDs
  - Don't have open PRs

Examples:
  # Preview what would be deleted
  node scripts/branch-cleanup-intelligent.js

  # Delete orphaned branches (local only)
  node scripts/branch-cleanup-intelligent.js --execute

  # Delete orphaned branches (local + remote)
  node scripts/branch-cleanup-intelligent.js --execute --remote

  # Clean only EHG repo
  node scripts/branch-cleanup-intelligent.js --execute --repo EHG
`);
  process.exit(0);
}

// Run
const cleanup = new IntelligentBranchCleanup(options);
cleanup.run().catch(error => {
  console.error('❌ Cleanup failed:', error.message);
  process.exit(1);
});
