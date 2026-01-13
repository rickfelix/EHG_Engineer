#!/usr/bin/env node
/**
 * Single Branch Analyzer
 *
 * Fast, intelligent analysis of a single branch to determine if it's safe to delete.
 * Combines multiple signals into a single verdict.
 *
 * Usage:
 *   node scripts/branch-analyze-single.js <branch-name> [--repo EHG|EHG_Engineer]
 *
 * @module branch-analyze-single
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

const REPO_PATHS = {
  EHG: EHG_ROOT,
  EHG_Engineer: EHG_ENGINEER_ROOT
};

class BranchAnalyzer {
  constructor(branchName, repoName = 'EHG') {
    this.branchName = branchName;
    this.repoPath = REPO_PATHS[repoName] || REPO_PATHS.EHG;
    this.repoName = repoName;

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.analysis = {
      branchName,
      expectedSD: null,
      actualSDs: [],
      sdMismatch: false,
      commits: [],
      filesModified: [],
      supersededFiles: 0,
      totalFiles: 0,
      sdStatuses: {},
      ageHours: 0,
      verdict: 'UNKNOWN',
      reasons: []
    };
  }

  async analyze() {
    console.log(`\n🔍 BRANCH ANALYSIS: ${this.branchName}`);
    console.log('═'.repeat(60));

    // Step 1: Extract expected SD from branch name
    this.analysis.expectedSD = this.extractSDId(this.branchName);
    console.log(`\n📌 Expected SD: ${this.analysis.expectedSD || 'None (non-SD branch)'}`);

    // Step 2: Get commits and their actual SDs
    await this.getCommitsAndSDs();

    // Step 3: Check for SD mismatch
    this.checkSDMismatch();

    // Step 4: Get files and check if superseded
    await this.checkSupersededFiles();

    // Step 5: Get SD statuses from database
    await this.getSDStatuses();

    // Step 6: Check branch age
    await this.getBranchAge();

    // Step 7: Determine verdict
    this.determineVerdict();

    this.printSummary();

    return this.analysis;
  }

  extractSDId(branchName) {
    const match = branchName.match(/(SD-[A-Z0-9-]+)/i);
    return match ? match[1].toUpperCase() : null;
  }

  async getCommitsAndSDs() {
    try {
      const { stdout } = await execAsync(
        `cd "${this.repoPath}" && git log main..${this.branchName} --pretty=format:"%h|%s" 2>/dev/null`,
        { timeout: 10000 }
      );

      const sdSet = new Set();
      this.analysis.commits = [];

      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const [hash, subject] = line.split('|');
        this.analysis.commits.push({ hash, subject });

        // Extract SD from commit message
        const sdMatch = subject.match(/(SD-[A-Z0-9-]+)/i);
        if (sdMatch) {
          sdSet.add(sdMatch[1].toUpperCase());
        }
      }

      this.analysis.actualSDs = Array.from(sdSet);
      console.log(`\n📝 Commits: ${this.analysis.commits.length}`);

      if (this.analysis.commits.length > 0) {
        console.log(`   Actual SDs in commits: ${this.analysis.actualSDs.join(', ') || 'None found'}`);
        // Show first few commits
        for (const c of this.analysis.commits.slice(0, 3)) {
          console.log(`   • ${c.hash}: ${c.subject.substring(0, 50)}...`);
        }
        if (this.analysis.commits.length > 3) {
          console.log(`   ... and ${this.analysis.commits.length - 3} more`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Could not get commits: ${error.message}`);
    }
  }

  checkSDMismatch() {
    if (!this.analysis.expectedSD) {
      this.analysis.sdMismatch = false;
      return;
    }

    // Mismatch if commits reference different SDs than branch name
    if (this.analysis.actualSDs.length > 0) {
      const hasExpected = this.analysis.actualSDs.includes(this.analysis.expectedSD);
      const hasOthers = this.analysis.actualSDs.some(sd => sd !== this.analysis.expectedSD);

      if (!hasExpected && hasOthers) {
        this.analysis.sdMismatch = true;
        this.analysis.reasons.push(`SD MISMATCH: Branch for ${this.analysis.expectedSD} but commits from ${this.analysis.actualSDs.join(', ')}`);
        console.log('\n⚠️  SD MISMATCH DETECTED');
        console.log(`   Branch: ${this.analysis.expectedSD}`);
        console.log(`   Commits: ${this.analysis.actualSDs.join(', ')}`);
      }
    }
  }

  async checkSupersededFiles() {
    try {
      // Get list of files modified in this branch
      const { stdout: filesOutput } = await execAsync(
        `cd "${this.repoPath}" && git diff --name-only main...${this.branchName} 2>/dev/null`,
        { timeout: 10000 }
      );

      this.analysis.filesModified = filesOutput.trim().split('\n').filter(Boolean);
      this.analysis.totalFiles = this.analysis.filesModified.length;

      if (this.analysis.totalFiles === 0) {
        console.log('\n📁 Files: 0 (no changes from main)');
        return;
      }

      console.log(`\n📁 Files modified: ${this.analysis.totalFiles}`);

      // For each file, check if main has a newer version
      let superseded = 0;
      const sampleFiles = this.analysis.filesModified.slice(0, 5);

      for (const file of sampleFiles) {
        try {
          // Get last commit date on branch for this file
          const { stdout: branchDate } = await execAsync(
            `cd "${this.repoPath}" && git log -1 --format="%ci" ${this.branchName} -- "${file}" 2>/dev/null`,
            { timeout: 5000 }
          );

          // Get last commit date on main for this file
          const { stdout: mainDate } = await execAsync(
            `cd "${this.repoPath}" && git log -1 --format="%ci" main -- "${file}" 2>/dev/null`,
            { timeout: 5000 }
          );

          if (branchDate.trim() && mainDate.trim()) {
            const branchTime = new Date(branchDate.trim()).getTime();
            const mainTime = new Date(mainDate.trim()).getTime();

            if (mainTime > branchTime) {
              superseded++;
              console.log(`   ↳ ${file.substring(0, 40)}... (main is NEWER)`);
            } else {
              console.log(`   ↳ ${file.substring(0, 40)}... (branch is newer)`);
            }
          }
        } catch {
          // File comparison failed, skip
        }
      }

      // Estimate total superseded based on sample
      if (sampleFiles.length > 0) {
        const ratio = superseded / sampleFiles.length;
        this.analysis.supersededFiles = Math.round(ratio * this.analysis.totalFiles);

        if (this.analysis.supersededFiles === this.analysis.totalFiles) {
          this.analysis.reasons.push(`ALL FILES SUPERSEDED: Main has newer versions of all ${this.analysis.totalFiles} files`);
        } else if (this.analysis.supersededFiles > this.analysis.totalFiles * 0.8) {
          this.analysis.reasons.push(`MOSTLY SUPERSEDED: ${this.analysis.supersededFiles}/${this.analysis.totalFiles} files have newer versions on main`);
        }
      }

      if (this.analysis.filesModified.length > 5) {
        console.log(`   ... and ${this.analysis.filesModified.length - 5} more files`);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not check files: ${error.message}`);
    }
  }

  async getSDStatuses() {
    const sdsToCheck = new Set([this.analysis.expectedSD, ...this.analysis.actualSDs].filter(Boolean));

    if (sdsToCheck.size === 0) return;

    console.log('\n🗄️  SD Database Status:');

    for (const sdId of sdsToCheck) {
      try {
        const { data: sd } = await this.supabase
          .from('strategic_directives_v2')
          .select('id, legacy_id, status, title')
          .or(`legacy_id.ilike.${sdId},id.ilike.${sdId}`)
          .single();

        if (sd) {
          this.analysis.sdStatuses[sdId] = sd.status;
          const marker = sd.status === 'completed' ? '✅' : sd.status === 'in_progress' ? '🔄' : '📋';
          console.log(`   ${marker} ${sdId}: ${sd.status}`);

          if (sd.status === 'in_progress') {
            this.analysis.reasons.push(`SD IN PROGRESS: ${sdId} is still active`);
          }
        } else {
          console.log(`   ❓ ${sdId}: Not found in database`);
        }
      } catch {
        console.log(`   ❓ ${sdId}: Lookup failed`);
      }
    }
  }

  async getBranchAge() {
    try {
      const { stdout } = await execAsync(
        `cd "${this.repoPath}" && git log -1 --format="%ci" ${this.branchName} 2>/dev/null`,
        { timeout: 5000 }
      );

      if (stdout.trim()) {
        const lastCommit = new Date(stdout.trim());
        const ageMs = Date.now() - lastCommit.getTime();
        this.analysis.ageHours = Math.round(ageMs / (1000 * 60 * 60));

        const ageDays = Math.round(this.analysis.ageHours / 24);
        console.log(`\n⏰ Age: ${ageDays} days (${this.analysis.ageHours} hours)`);

        if (this.analysis.ageHours < 2) {
          this.analysis.reasons.push(`RECENTLY ACTIVE: Last commit ${this.analysis.ageHours}h ago`);
        }
      }
    } catch {
      // Ignore
    }
  }

  determineVerdict() {
    const a = this.analysis;

    // SAFE conditions
    const hasNoCommits = a.commits.length === 0;
    const allSDsCompleted = Object.values(a.sdStatuses).every(s => s === 'completed' || s === 'cancelled');
    const isOld = a.ageHours >= 2;
    const allSuperseded = a.supersededFiles === a.totalFiles && a.totalFiles > 0;
    const hasMismatch = a.sdMismatch;

    // UNSAFE conditions
    const hasActiveSD = Object.values(a.sdStatuses).some(s => s === 'in_progress' || s === 'planning');
    const isRecent = a.ageHours < 2;
    const hasUniqueWork = a.commits.length > 0 && a.supersededFiles < a.totalFiles && !hasMismatch;

    if (hasNoCommits && isOld) {
      a.verdict = 'SAFE_TO_DELETE';
      a.reasons.push('Empty placeholder branch with no commits');
    } else if (isRecent) {
      a.verdict = 'KEEP';
      a.reasons.push('Recently active - may be parallel work');
    } else if (hasActiveSD) {
      a.verdict = 'KEEP';
      a.reasons.push('Associated SD is still in progress');
    } else if (hasMismatch && allSuperseded && allSDsCompleted) {
      a.verdict = 'SAFE_TO_DELETE';
      a.reasons.push('SD mismatch + all work superseded + SDs completed');
    } else if (allSuperseded && allSDsCompleted) {
      a.verdict = 'SAFE_TO_DELETE';
      a.reasons.push('All work superseded on main + SDs completed');
    } else if (hasUniqueWork) {
      a.verdict = 'REVIEW_NEEDED';
      a.reasons.push('Has unique commits not on main - manual review recommended');
    } else if (allSDsCompleted && isOld) {
      a.verdict = 'LIKELY_SAFE';
      a.reasons.push('SDs completed and branch is old - likely safe but verify');
    } else {
      a.verdict = 'REVIEW_NEEDED';
      a.reasons.push('Could not determine safety - manual review recommended');
    }
  }

  printSummary() {
    const a = this.analysis;

    console.log('\n' + '═'.repeat(60));
    console.log('📊 VERDICT');
    console.log('═'.repeat(60));

    const verdictEmoji = {
      'SAFE_TO_DELETE': '✅',
      'LIKELY_SAFE': '🟡',
      'KEEP': '🔒',
      'REVIEW_NEEDED': '⚠️',
      'UNKNOWN': '❓'
    };

    console.log(`\n   ${verdictEmoji[a.verdict]} ${a.verdict}`);
    console.log('\n   Reasons:');
    for (const reason of a.reasons) {
      console.log(`   • ${reason}`);
    }

    console.log('\n   Quick Stats:');
    console.log(`   • Commits: ${a.commits.length}`);
    console.log(`   • Files: ${a.totalFiles} (${a.supersededFiles} superseded)`);
    console.log(`   • Age: ${Math.round(a.ageHours / 24)} days`);
    console.log(`   • SD Mismatch: ${a.sdMismatch ? 'Yes' : 'No'}`);

    if (a.verdict === 'SAFE_TO_DELETE') {
      console.log(`\n   To delete: git branch -D "${this.branchName}"`);
    }

    console.log('');
  }
}

// CLI
const args = process.argv.slice(2);
const branchName = args.find(a => !a.startsWith('--'));
const repoArg = args.findIndex(a => a === '--repo');
const repoName = repoArg !== -1 ? args[repoArg + 1] : 'EHG';

if (!branchName || args.includes('--help') || args.includes('-h')) {
  console.log(`
Single Branch Analyzer

Usage:
  node scripts/branch-analyze-single.js <branch-name> [--repo EHG|EHG_Engineer]

Examples:
  node scripts/branch-analyze-single.js feat/SD-UAT-001-testing
  node scripts/branch-analyze-single.js docs/SD-DOCS-001-api --repo EHG
`);
  process.exit(branchName ? 0 : 1);
}

const analyzer = new BranchAnalyzer(branchName, repoName);
analyzer.analyze().catch(error => {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
});
