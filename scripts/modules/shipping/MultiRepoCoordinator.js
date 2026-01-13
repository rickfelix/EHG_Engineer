/**
 * MultiRepoCoordinator - Coordinate shipping across multiple repositories
 *
 * Discovers all EHG repositories and coordinates SD-related work:
 * - Find SD-related branches across all repos
 * - Show unified status table
 * - Determine coordination order (infrastructure before frontend)
 * - Execute coordinated PR creation and merges
 *
 * Pattern extracted from branch-cleanup-v2.js repo discovery
 *
 * @module shipping/MultiRepoCoordinator
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic base directory (parent of EHG_Engineer)
const EHG_BASE_DIR = resolve(__dirname, '../../../../..');

// Repositories to permanently ignore (archive/inactive repos)
const IGNORED_REPOS = ['ehg-replit-archive', 'solara2'];

// Dynamic repo paths
const STATIC_REPO_PATHS = {
  ehg: { name: 'ehg', path: resolve(EHG_BASE_DIR, 'ehg'), github: 'rickfelix/ehg', priority: 2 },
  EHG_Engineer: { name: 'EHG_Engineer', path: resolve(EHG_BASE_DIR, 'EHG_Engineer'), github: 'rickfelix/EHG_Engineer', priority: 1 }
};

// Repo coordination order (lower = earlier)
// Infrastructure repos should be merged before frontend repos
const REPO_PRIORITY = {
  EHG_Engineer: 1,  // Infrastructure/tooling
  ehg: 2,           // Frontend app
  EHG: 2            // Legacy alias for ehg
};

export class MultiRepoCoordinator {
  /**
   * @param {string} sdId - Strategic Directive ID
   * @param {Object} options - Configuration options
   */
  constructor(sdId, options = {}) {
    this.sdId = sdId;
    this.options = {
      verbose: false,
      autoCreatePRs: false,
      autoMerge: false,
      ...options
    };
    this.repos = {};
    this.branchStatus = [];
  }

  /**
   * Discover all git repositories in the EHG base directory
   * @returns {Object} Map of repo name to repo info
   */
  discoverRepos() {
    const repos = {};

    try {
      const entries = readdirSync(EHG_BASE_DIR);

      for (const entry of entries) {
        // Skip ignored repos
        if (IGNORED_REPOS.includes(entry)) {
          continue;
        }

        const fullPath = join(EHG_BASE_DIR, entry);
        const gitPath = join(fullPath, '.git');

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory() && existsSync(gitPath)) {
            // Determine GitHub repo name
            let githubRepo = `rickfelix/${entry}`;
            try {
              const remoteUrl = execSync('git remote get-url origin', {
                encoding: 'utf8',
                cwd: fullPath,
                timeout: 5000
              }).trim();

              // Extract repo from git URL
              const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
              if (match) {
                githubRepo = match[1];
              }
            } catch {
              // Use default
            }

            repos[entry] = {
              name: entry,
              path: fullPath,
              github: githubRepo,
              priority: REPO_PRIORITY[entry] || 99
            };
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch (error) {
      if (this.options.verbose) {
        console.log(`   ⚠️  Could not discover repos: ${error.message}`);
      }
      return STATIC_REPO_PATHS;
    }

    return Object.keys(repos).length > 0 ? repos : STATIC_REPO_PATHS;
  }

  /**
   * Main coordination entry point
   * @returns {Promise<Object>} Coordination results
   */
  async coordinate() {
    console.log(`\n🔗 Multi-Repo Coordination for ${this.sdId}`);
    console.log('═'.repeat(55));

    // Discover repos
    this.repos = this.discoverRepos();
    console.log(`   Found ${Object.keys(this.repos).length} repositories`);

    // Find SD branches in all repos
    await this.findSDBranches();

    // Check PR status for each branch
    await this.checkPRStatus();

    // Print unified status table
    this.printStatusTable();

    // Determine coordination order
    const coordinationPlan = this.getCoordinationPlan();

    return {
      passed: this.branchStatus.filter(b => b.needsAction).length === 0,
      repos: this.repos,
      branches: this.branchStatus,
      coordinationPlan
    };
  }

  /**
   * Find SD-related branches across all repos
   */
  async findSDBranches() {
    const branchPatterns = [
      `feat/${this.sdId}`,
      `fix/${this.sdId}`,
      `docs/${this.sdId}`,
      `test/${this.sdId}`,
      `chore/${this.sdId}`,
      `refactor/${this.sdId}`
    ];

    for (const [repoName, repoInfo] of Object.entries(this.repos)) {
      if (!existsSync(repoInfo.path)) {
        continue;
      }

      try {
        // Fetch latest
        execSync('git fetch --prune', {
          cwd: repoInfo.path,
          timeout: 30000,
          stdio: 'pipe'
        });

        // Get remote branches
        const branchList = execSync('git branch -r', {
          encoding: 'utf8',
          cwd: repoInfo.path,
          timeout: 10000
        });

        for (const pattern of branchPatterns) {
          const matching = branchList.split('\n')
            .map(b => b.trim())
            .filter(b =>
              b.toLowerCase().includes(pattern.toLowerCase()) &&
              !b.includes('HEAD')
            );

          for (const branch of matching) {
            const cleanBranch = branch.replace('origin/', '');

            // Get commit count ahead of main
            let commitsAhead = 0;
            try {
              const count = execSync(
                `git rev-list --count origin/main..${branch}`,
                { encoding: 'utf8', cwd: repoInfo.path, timeout: 10000 }
              ).trim();
              commitsAhead = parseInt(count);
            } catch {
              // Ignore
            }

            // Check if branch is fully merged
            let isMerged = false;
            try {
              execSync(`git merge-base --is-ancestor ${branch} origin/main`, {
                cwd: repoInfo.path,
                timeout: 10000,
                stdio: 'pipe'
              });
              isMerged = true;
            } catch {
              isMerged = false;
            }

            this.branchStatus.push({
              repo: repoName,
              repoInfo,
              branch: cleanBranch,
              commitsAhead,
              isMerged,
              prNumber: null,
              prStatus: null,
              needsAction: commitsAhead > 0 && !isMerged
            });
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Error checking ${repoName}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Check PR status for branches
   */
  async checkPRStatus() {
    for (const branch of this.branchStatus) {
      if (!branch.needsAction) continue;

      try {
        const result = execSync(
          `gh pr list --repo ${branch.repoInfo.github} --head ${branch.branch} --state all --json number,state,url --limit 1`,
          { encoding: 'utf8', timeout: 30000 }
        );

        const prs = JSON.parse(result || '[]');
        if (prs.length > 0) {
          branch.prNumber = prs[0].number;
          branch.prStatus = prs[0].state;
          branch.prUrl = prs[0].url;

          // If PR is merged, branch no longer needs action
          if (prs[0].state === 'MERGED') {
            branch.isMerged = true;
            branch.needsAction = false;
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Could not check PR for ${branch.branch}: ${error.message?.substring(0, 50)}`);
        }
      }
    }
  }

  /**
   * Print unified status table
   */
  printStatusTable() {
    console.log('\n┌──────────────────┬─────────────────────────────┬─────────┬────────┬────────┐');
    console.log('│ Repository       │ Branch                      │ Commits │ PR #   │ Status │');
    console.log('├──────────────────┼─────────────────────────────┼─────────┼────────┼────────┤');

    // Sort by priority, then by branch name
    const sorted = [...this.branchStatus].sort((a, b) => {
      const priorityDiff = a.repoInfo.priority - b.repoInfo.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.branch.localeCompare(b.branch);
    });

    for (const branch of sorted) {
      const repoCol = branch.repo.substring(0, 16).padEnd(16);
      const branchCol = branch.branch.substring(0, 27).padEnd(27);
      const commitsCol = String(branch.commitsAhead).padStart(7);
      const prCol = branch.prNumber ? `#${branch.prNumber}`.padStart(6) : '-'.padStart(6);

      let status = 'Merged';
      if (branch.needsAction) {
        if (branch.prNumber && branch.prStatus === 'OPEN') {
          status = 'Open PR';
        } else if (branch.commitsAhead > 0 && !branch.prNumber) {
          status = 'No PR';
        } else {
          status = 'Unmerged';
        }
      }
      const statusCol = status.padEnd(6);

      console.log(`│ ${repoCol} │ ${branchCol} │ ${commitsCol} │ ${prCol} │ ${statusCol} │`);
    }

    console.log('└──────────────────┴─────────────────────────────┴─────────┴────────┴────────┘');

    // Summary
    const needsAction = this.branchStatus.filter(b => b.needsAction);
    const merged = this.branchStatus.filter(b => b.isMerged);

    if (needsAction.length === 0) {
      console.log('\n✅ Multi-Repo Coordination: PASS');
      console.log(`   All ${this.branchStatus.length} branch(es) are merged`);
    } else {
      console.log(`\n⚠️  Multi-Repo Coordination: ${needsAction.length} action(s) needed`);
      console.log(`   Merged: ${merged.length} | Pending: ${needsAction.length}`);
    }
  }

  /**
   * Get coordination plan with ordered actions
   * @returns {Array} Ordered list of actions
   */
  getCoordinationPlan() {
    const actions = [];

    // Sort branches by repo priority
    const needsAction = this.branchStatus
      .filter(b => b.needsAction)
      .sort((a, b) => a.repoInfo.priority - b.repoInfo.priority);

    for (const branch of needsAction) {
      if (!branch.prNumber) {
        // Need to create PR first
        actions.push({
          type: 'CREATE_PR',
          repo: branch.repo,
          branch: branch.branch,
          command: `cd ${branch.repoInfo.path} && gh pr create --head ${branch.branch} --title "feat(${this.sdId}): ${branch.branch}" --body "Part of ${this.sdId}"`
        });
      }

      if (branch.prNumber && branch.prStatus === 'OPEN') {
        // Need to merge PR
        actions.push({
          type: 'MERGE_PR',
          repo: branch.repo,
          branch: branch.branch,
          prNumber: branch.prNumber,
          command: `gh pr merge ${branch.prNumber} --repo ${branch.repoInfo.github} --merge --delete-branch`
        });
      }
    }

    return actions;
  }

  /**
   * Execute coordination plan
   * @returns {Promise<Object>} Execution results
   */
  async executeCoordinationPlan() {
    const plan = this.getCoordinationPlan();
    const results = {
      executed: [],
      failed: []
    };

    for (const action of plan) {
      console.log(`\n🔄 Executing: ${action.type} on ${action.repo}/${action.branch}`);

      try {
        const output = execSync(action.command, {
          encoding: 'utf8',
          timeout: 60000
        });

        console.log(`   ✅ Success: ${output.trim().substring(0, 100)}`);
        results.executed.push({
          ...action,
          success: true,
          output
        });
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        results.failed.push({
          ...action,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get remediation steps for uncoordinated branches
   * @returns {Array<string>} List of remediation commands
   */
  getRemediationSteps() {
    const plan = this.getCoordinationPlan();
    return plan.map(action => action.command);
  }
}

export default MultiRepoCoordinator;
