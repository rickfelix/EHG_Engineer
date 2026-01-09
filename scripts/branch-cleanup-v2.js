#!/usr/bin/env node
/**
 * Branch Cleanup v2 - Two-Stage Intelligent Cleanup
 *
 * Stage 1: Fast automated cleanup with high certainty
 * Stage 2: Review queue for branches needing judgment
 *
 * Usage:
 *   node scripts/branch-cleanup-v2.js                     # Preview both stages
 *   node scripts/branch-cleanup-v2.js --execute           # Delete Stage 1 only
 *   node scripts/branch-cleanup-v2.js --execute --remote  # Also delete remote
 *   node scripts/branch-cleanup-v2.js --repo EHG          # Target specific repo
 *
 * @module branch-cleanup-v2
 * @version 2.0.0
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

const REPO_PATHS = {
  EHG: '/mnt/c/_EHG/EHG',
  EHG_Engineer: '/mnt/c/_EHG/EHG_Engineer'
};

const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'staging', 'production'];
const MIN_STALE_HOURS = 2;

class BranchCleanupV2 {
  constructor(options = {}) {
    this.options = {
      dryRun: !options.execute,
      deleteRemote: options.remote || false,
      targetRepo: options.repo || 'EHG',
      verbose: options.verbose || false,
      includeStage2: options.stage2 || false
    };

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.sdCache = new Map();
    this.stage1 = [];  // High certainty - auto delete
    this.stage2 = [];  // Needs review
    this.kept = [];    // Must keep (active, recent, etc.)

    this.stats = {
      total: 0,
      stage1Safe: 0,
      stage2Review: 0,
      kept: 0,
      deleted: 0
    };
  }

  async run() {
    console.log('\n🧹 BRANCH CLEANUP v2 - Two-Stage Analysis');
    console.log('═'.repeat(60));
    console.log(`Mode: ${this.options.dryRun ? '🔍 PREVIEW' : '⚡ EXECUTE'}`);
    console.log(`Target: ${this.options.targetRepo}`);
    console.log('═'.repeat(60));

    await this.loadSDData();

    const repoPath = REPO_PATHS[this.options.targetRepo];
    if (!repoPath) {
      console.log(`❌ Unknown repo: ${this.options.targetRepo}`);
      return;
    }

    const branches = await this.getUnmergedBranches(repoPath);
    this.stats.total = branches.length;

    console.log(`\n📂 Found ${branches.length} unmerged branches\n`);
    console.log('Analyzing branches...');

    // Fast first pass - categorize all branches
    let processed = 0;
    for (const branch of branches) {
      const _category = await this.categorizeBranch(branch, repoPath);
      processed++;

      if (processed % 20 === 0) {
        process.stdout.write(`   Processed ${processed}/${branches.length}\r`);
      }
    }

    console.log(`   Processed ${processed}/${branches.length}    `);

    this.printResults();

    // Execute Stage 1 deletions if not dry run
    if (!this.options.dryRun && this.stage1.length > 0) {
      await this.executeStage1Deletions(repoPath);
    }

    // Save Stage 2 review queue
    if (this.stage2.length > 0) {
      await this.saveReviewQueue();
    }

    return this.stats;
  }

  async loadSDData() {
    try {
      const { data: sds } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, status, title, metadata');

      for (const sd of sds || []) {
        if (sd.legacy_id) this.sdCache.set(sd.legacy_id.toLowerCase(), sd);
        if (sd.id?.startsWith('SD-')) this.sdCache.set(sd.id.toLowerCase(), sd);
      }
      console.log(`✅ Loaded ${sds?.length || 0} SDs for cross-reference\n`);
    } catch (error) {
      console.log(`⚠️ Could not load SD data: ${error.message}\n`);
    }
  }

  async getUnmergedBranches(repoPath) {
    try {
      const { stdout } = await execAsync(
        `cd "${repoPath}" && git for-each-ref --sort=-committerdate ` +
        '--format=\'%(refname:short)|%(committerdate:iso8601)\' refs/heads/ ' +
        '| grep -v "^main|" | grep -v "^master|"',
        { maxBuffer: 10 * 1024 * 1024 }
      );

      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [name, dateStr] = line.split('|');
        return { name, lastCommit: new Date(dateStr) };
      }).filter(b => !PROTECTED_BRANCHES.includes(b.name));
    } catch {
      return [];
    }
  }

  async categorizeBranch(branch, repoPath) {
    const info = {
      name: branch.name,
      ageHours: Math.round((Date.now() - branch.lastCommit.getTime()) / (1000 * 60 * 60)),
      commits: 0,
      reason: ''
    };

    // Check 1: Too recent - must keep
    if (info.ageHours < MIN_STALE_HOURS) {
      info.reason = `Recent (${info.ageHours}h) - may be active`;
      this.kept.push(info);
      this.stats.kept++;
      return 'kept';
    }

    // Check 2: Get commit count
    try {
      const { stdout } = await execAsync(
        `cd "${repoPath}" && git log main..${branch.name} --oneline 2>/dev/null | wc -l`,
        { timeout: 5000 }
      );
      info.commits = parseInt(stdout.trim()) || 0;
    } catch {
      info.commits = -1; // Error
    }

    // Check 3: SD in progress - must keep
    const sdId = this.extractSDId(branch.name);
    if (sdId) {
      const sd = this.sdCache.get(sdId.toLowerCase());
      if (sd && (sd.status === 'in_progress' || sd.status === 'planning')) {
        info.reason = `SD ${sd.status}`;
        this.kept.push(info);
        this.stats.kept++;
        return 'kept';
      }
    }

    // Check 4: Has open PR - must keep
    try {
      const { stdout: prCheck } = await execAsync(
        `cd "${repoPath}" && gh pr list --head "${branch.name}" --state open --json number 2>/dev/null || echo "[]"`,
        { timeout: 5000 }
      );
      if (JSON.parse(prCheck || '[]').length > 0) {
        info.reason = 'Has open PR';
        this.kept.push(info);
        this.stats.kept++;
        return 'kept';
      }
    } catch {
      // Continue
    }

    // STAGE 1: High certainty deletions
    if (info.commits === 0) {
      info.reason = 'Empty placeholder (0 commits)';
      this.stage1.push(info);
      this.stats.stage1Safe++;
      return 'stage1';
    }

    // For branches with commits, do quick mismatch check
    if (info.commits > 0 && info.commits <= 20) {
      const mismatch = await this.quickMismatchCheck(branch.name, repoPath, sdId);

      if (mismatch.isMismatch && mismatch.allSuperseded) {
        info.reason = `SD mismatch + 100% superseded (${info.commits} commits from ${mismatch.actualSDs.join(', ')})`;
        info.actualSDs = mismatch.actualSDs;
        this.stage1.push(info);
        this.stats.stage1Safe++;
        return 'stage1';
      }

      // Stage 2: Has commits that need review
      info.reason = `${info.commits} commits (${mismatch.supersededPct}% superseded)`;
      info.actualSDs = mismatch.actualSDs;
      this.stage2.push(info);
      this.stats.stage2Review++;
      return 'stage2';
    }

    // Too many commits - stage 2
    info.reason = `${info.commits} commits - needs review`;
    this.stage2.push(info);
    this.stats.stage2Review++;
    return 'stage2';
  }

  async quickMismatchCheck(branchName, repoPath, expectedSdId) {
    const result = {
      isMismatch: false,
      allSuperseded: false,
      supersededPct: 0,
      actualSDs: []
    };

    try {
      // Get SDs from commits
      const { stdout: commits } = await execAsync(
        `cd "${repoPath}" && git log main..${branchName} --pretty=format:"%s" 2>/dev/null | head -20`,
        { timeout: 5000 }
      );

      const sdSet = new Set();
      for (const line of commits.split('\n').filter(Boolean)) {
        const match = line.match(/(SD-[A-Z0-9-]+)/i);
        if (match) sdSet.add(match[1].toUpperCase());
      }
      result.actualSDs = Array.from(sdSet);

      // Check mismatch
      if (expectedSdId && result.actualSDs.length > 0) {
        const expUpper = expectedSdId.toUpperCase();
        const hasExpected = result.actualSDs.some(sd =>
          sd.startsWith(expUpper) || expUpper.startsWith(sd)
        );
        result.isMismatch = !hasExpected;
      }

      // Quick superseded check (sample 3 files)
      const { stdout: files } = await execAsync(
        `cd "${repoPath}" && git diff --name-only main...${branchName} 2>/dev/null | head -3`,
        { timeout: 5000 }
      );

      const fileList = files.trim().split('\n').filter(Boolean);
      if (fileList.length === 0) {
        result.allSuperseded = true;
        result.supersededPct = 100;
        return result;
      }

      let superseded = 0;
      for (const file of fileList) {
        try {
          const { stdout: branchTs } = await execAsync(
            `cd "${repoPath}" && git log -1 --format="%ct" ${branchName} -- "${file}" 2>/dev/null`,
            { timeout: 3000 }
          );
          const { stdout: mainTs } = await execAsync(
            `cd "${repoPath}" && git log -1 --format="%ct" main -- "${file}" 2>/dev/null`,
            { timeout: 3000 }
          );

          if (branchTs.trim() && mainTs.trim() && parseInt(mainTs) > parseInt(branchTs)) {
            superseded++;
          }
        } catch {
          // Skip
        }
      }

      result.supersededPct = Math.round((superseded / fileList.length) * 100);
      result.allSuperseded = superseded === fileList.length;
    } catch {
      // Return defaults
    }

    return result;
  }

  extractSDId(branchName) {
    const match = branchName.match(/\/(SD-[A-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  printResults() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 ANALYSIS RESULTS');
    console.log('═'.repeat(60));

    // Stage 1 - Safe to delete
    console.log(`\n✅ STAGE 1: Safe to Delete (${this.stage1.length} branches)`);
    if (this.stage1.length > 0) {
      console.log('   High certainty - can be auto-deleted:');
      for (const b of this.stage1.slice(0, 15)) {
        console.log(`   • ${b.name.substring(0, 45)}... - ${b.reason}`);
      }
      if (this.stage1.length > 15) {
        console.log(`   ... and ${this.stage1.length - 15} more`);
      }
    }

    // Stage 2 - Needs review
    console.log(`\n⚠️  STAGE 2: Needs Review (${this.stage2.length} branches)`);
    if (this.stage2.length > 0) {
      console.log('   Has work that may need manual inspection:');
      for (const b of this.stage2.slice(0, 10)) {
        console.log(`   • ${b.name.substring(0, 45)}... - ${b.reason}`);
      }
      if (this.stage2.length > 10) {
        console.log(`   ... and ${this.stage2.length - 10} more`);
      }
    }

    // Kept
    console.log(`\n🔒 KEPT: ${this.kept.length} branches (active/recent/has PR)`);

    // Summary
    console.log('\n' + '─'.repeat(60));
    console.log('SUMMARY:');
    console.log(`   Total analyzed:     ${this.stats.total}`);
    console.log(`   Stage 1 (safe):     ${this.stats.stage1Safe}`);
    console.log(`   Stage 2 (review):   ${this.stats.stage2Review}`);
    console.log(`   Kept (protected):   ${this.stats.kept}`);

    if (this.options.dryRun && this.stage1.length > 0) {
      console.log('\n💡 To delete Stage 1 branches:');
      console.log('   node scripts/branch-cleanup-v2.js --execute');
      console.log('   node scripts/branch-cleanup-v2.js --execute --remote  # Also remote');
    }
  }

  async executeStage1Deletions(repoPath) {
    console.log(`\n⚡ Deleting ${this.stage1.length} Stage 1 branches...`);

    for (const branch of this.stage1) {
      try {
        await execAsync(
          `cd "${repoPath}" && git branch -D "${branch.name}" 2>/dev/null`,
          { timeout: 10000 }
        );

        if (this.options.deleteRemote) {
          try {
            await execAsync(
              `cd "${repoPath}" && git push origin --delete "${branch.name}" 2>/dev/null`,
              { timeout: 30000 }
            );
          } catch {
            // Remote may not exist
          }
        }

        this.stats.deleted++;
      } catch {
        if (this.options.verbose) {
          console.log(`   ❌ Failed: ${branch.name}`);
        }
      }
    }

    console.log(`   ✅ Deleted ${this.stats.deleted} branches`);
  }

  async saveReviewQueue() {
    // Generate analysis table for Stage 2
    console.log('\n' + '═'.repeat(100));
    console.log('📋 STAGE 2 ANALYSIS TABLE');
    console.log('═'.repeat(100));

    if (this.stage2.length === 0) {
      console.log('   No branches need review.');
      return;
    }

    // Table header
    console.log('');
    console.log('┌' + '─'.repeat(50) + '┬' + '─'.repeat(8) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(15) + '┬' + '─'.repeat(12) + '┐');
    console.log('│ ' + 'Branch'.padEnd(48) + ' │ ' + 'Commits'.padEnd(6) + ' │ ' + 'Superseded'.padEnd(10) + ' │ ' + 'Age (days)'.padEnd(13) + ' │ ' + 'Recommend'.padEnd(10) + ' │');
    console.log('├' + '─'.repeat(50) + '┼' + '─'.repeat(8) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(15) + '┼' + '─'.repeat(12) + '┤');

    let likelySafe = 0;
    let uncertain = 0;

    for (const b of this.stage2) {
      // Determine recommendation
      let recommend = 'UNCERTAIN';
      const supersededMatch = b.reason.match(/(\d+)% superseded/);
      const supersededPct = supersededMatch ? parseInt(supersededMatch[1]) : 0;
      const ageDays = Math.round(b.ageHours / 24);

      // All related SDs completed?
      const allSdsCompleted = (b.actualSDs || []).every(sd => {
        const found = this.sdCache.get(sd.toLowerCase());
        return !found || found.status === 'completed' || found.status === 'cancelled';
      });

      if (supersededPct >= 80 && ageDays > 7 && allSdsCompleted) {
        recommend = 'LIKELY_SAFE';
        likelySafe++;
      } else if (supersededPct >= 50 && ageDays > 14 && allSdsCompleted) {
        recommend = 'LIKELY_SAFE';
        likelySafe++;
      } else {
        uncertain++;
      }

      b.recommendation = recommend;

      const branchShort = b.name.length > 48 ? b.name.substring(0, 45) + '...' : b.name.padEnd(48);
      const commits = String(b.commits).padEnd(6);
      const superseded = (supersededPct + '%').padEnd(10);
      const age = String(ageDays).padEnd(13);
      const rec = recommend.padEnd(10);

      console.log(`│ ${branchShort} │ ${commits} │ ${superseded} │ ${age} │ ${rec} │`);
    }

    console.log('└' + '─'.repeat(50) + '┴' + '─'.repeat(8) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(15) + '┴' + '─'.repeat(12) + '┘');

    // Summary
    console.log('\n📊 Stage 2 Summary:');
    console.log(`   LIKELY_SAFE: ${likelySafe} branches (recommend deletion)`);
    console.log(`   UNCERTAIN:   ${uncertain} branches (may have unique work)`);

    // Delete LIKELY_SAFE if --stage2 flag is set
    if (this.options.includeStage2 && !this.options.dryRun && likelySafe > 0) {
      console.log(`\n⚡ Deleting ${likelySafe} LIKELY_SAFE branches...`);
      const repoPath = REPO_PATHS[this.options.targetRepo];
      let deleted = 0;

      for (const b of this.stage2.filter(b => b.recommendation === 'LIKELY_SAFE')) {
        try {
          await execAsync(`cd "${repoPath}" && git branch -D "${b.name}" 2>/dev/null`, { timeout: 10000 });
          if (this.options.deleteRemote) {
            try {
              await execAsync(`cd "${repoPath}" && git push origin --delete "${b.name}" 2>/dev/null`, { timeout: 30000 });
            } catch { /* Remote may not exist */ }
          }
          deleted++;
        } catch { /* Skip on error */ }
      }

      console.log(`   ✅ Deleted ${deleted} LIKELY_SAFE branches`);
      this.stats.deleted += deleted;
    } else if (likelySafe > 0 && this.options.dryRun) {
      console.log('\n💡 To delete LIKELY_SAFE branches, add --stage2 flag:');
      console.log('   node scripts/branch-cleanup-v2.js --execute --stage2');
    }

    // Report UNCERTAIN branches
    if (uncertain > 0) {
      console.log(`\n⚠️  ${uncertain} UNCERTAIN branches preserved (may have unique work)`);
    }

    // Save to JSON for reference
    const queueFile = '/tmp/branch-review-queue.json';
    writeFileSync(queueFile, JSON.stringify({
      generated: new Date().toISOString(),
      repo: this.options.targetRepo,
      summary: { likelySafe, uncertain, total: this.stage2.length },
      branches: this.stage2
    }, null, 2));
    console.log(`\n   Full data saved to: ${queueFile}`);
  }
}

// CLI
const args = process.argv.slice(2);
const options = {
  execute: args.includes('--execute') || args.includes('-e'),
  remote: args.includes('--remote') || args.includes('-r'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  stage2: args.includes('--stage2'),
  repo: 'EHG'
};

const repoIdx = args.findIndex(a => a === '--repo');
if (repoIdx !== -1 && args[repoIdx + 1]) {
  options.repo = args[repoIdx + 1];
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Branch Cleanup v2 - Two-Stage Intelligent Analysis

Usage:
  node scripts/branch-cleanup-v2.js [options]

Options:
  --execute, -e    Delete branches (default is preview)
  --stage2         Also delete LIKELY_SAFE Stage 2 branches
  --remote, -r     Also delete remote branches
  --repo <name>    Target repo (EHG or EHG_Engineer)
  --verbose, -v    Show detailed output
  --help, -h       Show this help

Stage 1 (Auto-delete with --execute):
  • 0 commits (empty placeholders)
  • SD mismatch + 100% superseded on main

Stage 2 (Analyzed + Tabled):
  • LIKELY_SAFE: ≥80% superseded + old + SDs completed → delete with --stage2
  • UNCERTAIN: May have unique work → preserved

Examples:
  node scripts/branch-cleanup-v2.js                          # Preview all
  node scripts/branch-cleanup-v2.js --execute                # Delete Stage 1 only
  node scripts/branch-cleanup-v2.js --execute --stage2       # Delete Stage 1 + LIKELY_SAFE
  node scripts/branch-cleanup-v2.js --execute --stage2 --remote  # All + remote
`);
  process.exit(0);
}

const cleanup = new BranchCleanupV2(options);
cleanup.run().catch(error => {
  console.error('❌ Failed:', error.message);
  process.exit(1);
});
