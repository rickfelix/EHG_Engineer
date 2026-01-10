/**
 * ShippingPreflightVerifier - Pre-ship branch verification gate
 *
 * Verifies that all code for an SD is ready for shipping:
 * - No unmerged branches exist for the SD
 * - No open PRs pending merge
 * - Branches with commits have PRs created
 *
 * Pattern extracted from LeadFinalApprovalExecutor.PR_MERGE_VERIFICATION gate
 *
 * @module shipping/ShippingPreflightVerifier
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Repository paths
const REPO_PATHS = {
  'rickfelix/ehg': '/mnt/c/_EHG/ehg',
  'rickfelix/EHG_Engineer': '/mnt/c/_EHG/EHG_Engineer'
};

export class ShippingPreflightVerifier {
  /**
   * @param {string} sdId - Strategic Directive ID (e.g., 'SD-LEO-001')
   * @param {Object} options - Configuration options
   * @param {boolean} options.verbose - Enable verbose output
   * @param {boolean} options.createMissingPRs - Auto-create PRs for branches with commits
   */
  constructor(sdId, options = {}) {
    this.sdId = sdId;
    this.options = {
      verbose: false,
      createMissingPRs: false,
      ...options
    };
    this.results = {
      passed: true,
      openPRs: [],
      unmergedBranches: [],
      warnings: [],
      errors: []
    };
  }

  /**
   * Build branch patterns for matching SD branches
   * Supports: feat/SD-XXX-*, fix/SD-XXX-*, docs/SD-XXX-*, test/SD-XXX-*
   */
  getBranchPatterns() {
    return [
      `feat/${this.sdId}`,
      `fix/${this.sdId}`,
      `docs/${this.sdId}`,
      `test/${this.sdId}`,
      `chore/${this.sdId}`,
      `refactor/${this.sdId}`
    ];
  }

  /**
   * Main verification entry point
   * @returns {Promise<Object>} Verification results
   */
  async verify() {
    console.log(`\n📋 Pre-Ship Verification for ${this.sdId}`);
    console.log('═'.repeat(55));

    // Check open PRs across repos
    await this.checkOpenPRs();

    // Check for unmerged branches with commits
    await this.checkUnmergedBranches();

    // Determine overall result
    this.results.passed =
      this.results.openPRs.length === 0 &&
      this.results.unmergedBranches.length === 0;

    this.printResults();
    return this.results;
  }

  /**
   * Check for open PRs matching this SD across all repos
   */
  async checkOpenPRs() {
    const branchPatterns = this.getBranchPatterns();

    for (const [repo, repoPath] of Object.entries(REPO_PATHS)) {
      if (!existsSync(repoPath)) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Repo not found: ${repoPath}`);
        }
        continue;
      }

      try {
        const result = execSync(
          `gh pr list --repo ${repo} --state open --json number,title,headRefName,url --limit 100`,
          { encoding: 'utf8', timeout: 30000 }
        );

        const prs = JSON.parse(result || '[]');

        // Filter PRs that match this SD's branch patterns
        const matchingPRs = prs.filter(pr =>
          branchPatterns.some(pattern =>
            pr.headRefName.toLowerCase().includes(pattern.toLowerCase())
          )
        );

        if (matchingPRs.length > 0) {
          for (const pr of matchingPRs) {
            this.results.openPRs.push({
              repo,
              repoPath,
              number: pr.number,
              title: pr.title,
              branch: pr.headRefName,
              url: pr.url
            });
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Could not check ${repo}: ${error.message?.substring(0, 50)}`);
        }
      }
    }
  }

  /**
   * Check for unmerged branches with commits (work with no PR created)
   */
  async checkUnmergedBranches() {
    const branchPatterns = this.getBranchPatterns();

    for (const [repo, repoPath] of Object.entries(REPO_PATHS)) {
      if (!existsSync(repoPath)) {
        continue;
      }

      try {
        // Get list of remote branches
        const branchList = execSync('git branch -r', {
          encoding: 'utf8',
          cwd: repoPath,
          timeout: 10000
        });

        for (const pattern of branchPatterns) {
          const matchingBranches = branchList.split('\n')
            .map(b => b.trim())
            .filter(b =>
              b.toLowerCase().includes(pattern.toLowerCase()) &&
              !b.includes('HEAD')
            );

          for (const branch of matchingBranches) {
            const cleanBranch = branch.replace('origin/', '');

            // Skip if already tracked as open PR
            const hasOpenPR = this.results.openPRs.some(
              pr => pr.branch === cleanBranch && pr.repo === repo
            );
            if (hasOpenPR) continue;

            try {
              // Check if branch has commits not in main
              const commitCount = execSync(
                `git rev-list --count origin/main..${branch}`,
                { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
              ).trim();

              const commits = parseInt(commitCount);
              if (commits > 0) {
                this.results.unmergedBranches.push({
                  repo,
                  repoPath,
                  branch: cleanBranch,
                  commits,
                  hasOpenPR: false
                });
              }
            } catch (_e) {
              // Branch comparison failed - skip
            }
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Could not check branches in ${repo}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Print verification results
   */
  printResults() {
    console.log('\n🔍 Branch Verification Results:');
    console.log('-'.repeat(50));

    if (this.results.openPRs.length > 0) {
      console.log(`\n❌ ${this.results.openPRs.length} open PR(s) found:`);
      for (const pr of this.results.openPRs) {
        console.log(`   • PR #${pr.number}: ${pr.title}`);
        console.log(`     Branch: ${pr.branch}`);
        console.log(`     Repo: ${pr.repo}`);
        console.log(`     → Merge: gh pr merge ${pr.number} --repo ${pr.repo} --merge --delete-branch`);
      }
    }

    if (this.results.unmergedBranches.length > 0) {
      console.log(`\n❌ ${this.results.unmergedBranches.length} unmerged branch(es) with commits:`);
      for (const branch of this.results.unmergedBranches) {
        console.log(`   • ${branch.branch} (${branch.commits} commits)`);
        console.log(`     Repo: ${branch.repo}`);
        console.log(`     → Create PR: cd ${branch.repoPath} && gh pr create --head ${branch.branch}`);
      }
    }

    if (this.results.passed) {
      console.log('\n✅ Branch Verification: PASS');
      console.log('   No unmerged branches or open PRs found for this SD');
    } else {
      console.log('\n❌ Branch Verification: BLOCKED');
      console.log('   Resolve the above issues before shipping');
    }
  }

  /**
   * Create PRs for branches that have commits but no PR
   * @returns {Promise<Array>} Created PR details
   */
  async createMissingPRs() {
    const created = [];

    for (const branch of this.results.unmergedBranches) {
      if (branch.hasOpenPR) continue;

      try {
        console.log(`\n📝 Creating PR for ${branch.branch}...`);

        const prTitle = `feat(${this.sdId}): ${branch.branch.replace(/^(feat|fix|docs|test|chore|refactor)\//, '').replace(/-/g, ' ')}`;

        const result = execSync(
          `gh pr create --head ${branch.branch} --title "${prTitle}" --body "Auto-created by ship-preflight for ${this.sdId}"`,
          { encoding: 'utf8', cwd: branch.repoPath, timeout: 30000 }
        );

        const prUrl = result.trim();
        console.log(`   ✅ Created: ${prUrl}`);

        created.push({
          branch: branch.branch,
          repo: branch.repo,
          url: prUrl
        });
      } catch (error) {
        console.log(`   ❌ Failed to create PR: ${error.message}`);
        this.results.errors.push({
          type: 'PR_CREATION_FAILED',
          branch: branch.branch,
          error: error.message
        });
      }
    }

    return created;
  }

  /**
   * Get remediation steps for issues found
   * @returns {Array<string>} List of remediation commands
   */
  getRemediationSteps() {
    const steps = [];

    // Open PRs need to be merged
    for (const pr of this.results.openPRs) {
      steps.push(`gh pr merge ${pr.number} --repo ${pr.repo} --merge --delete-branch`);
    }

    // Unmerged branches need PRs created then merged
    for (const branch of this.results.unmergedBranches) {
      steps.push(`cd ${branch.repoPath} && gh pr create --head ${branch.branch}`);
    }

    return steps;
  }
}

export default ShippingPreflightVerifier;
