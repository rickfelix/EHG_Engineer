/**
 * MultiRepoCoordinator - Coordinate shipping across multiple repositories
 *
 * Discovers all EHG repositories and coordinates SD-related work:
 * - Find SD-related branches across all repos
 * - Show unified status table
 * - Determine coordination order (infrastructure before frontend)
 * - Execute coordinated PR creation and merges
 *
 * Now uses centralized lib/multi-repo module for repository discovery.
 *
 * @module shipping/MultiRepoCoordinator
 * @version 2.0.0 - Uses centralized lib/multi-repo module
 */

import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import {
  discoverRepos as discoverReposFromLib,
  getPrimaryRepos
} from '../../../lib/multi-repo/index.js';

// QF-20260703-388: per-repo git/gh calls use execFileSync (no shell) so a timeout's
// kill signal reaches the real process directly -- execSync's shell:true default wraps
// the command in cmd.exe on Windows, and killing that wrapper on timeout leaves the
// actual git/gh child running, which is why preflight survived SIGTERM at 60s/180s.
const PER_REPO_TIMEOUT_MS = 15000;
const SCAN_DEADLINE_MS = 60000;

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
   * Uses centralized lib/multi-repo module
   * @returns {Object} Map of repo name to repo info
   */
  discoverRepos() {
    try {
      return discoverReposFromLib();
    } catch (error) {
      if (this.options.verbose) {
        console.log(`   ⚠️  Could not discover repos: ${error.message}`);
      }
      // Fallback to primary repos from centralized config
      return getPrimaryRepos();
    }
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
    this._deadlineAt = Date.now() + SCAN_DEADLINE_MS;
    this.partial = false;

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
      partial: this.partial,
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
      if (Date.now() > this._deadlineAt) {
        console.log(`   ⚠️  PREFLIGHT_PARTIAL: multi-repo scan deadline (${SCAN_DEADLINE_MS / 1000}s) exceeded, skipping remaining repos`);
        this.partial = true;
        break;
      }
      if (!existsSync(repoInfo.path)) {
        continue;
      }

      try {
        // Fetch latest
        execFileSync('git', ['fetch', '--prune'], {
          cwd: repoInfo.path,
          timeout: PER_REPO_TIMEOUT_MS,
          stdio: 'pipe'
        });

        // Get remote branches
        const branchList = execFileSync('git', ['branch', '-r'], {
          encoding: 'utf8',
          cwd: repoInfo.path,
          timeout: PER_REPO_TIMEOUT_MS
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
              const count = execFileSync(
                'git', ['rev-list', '--count', `origin/main..${branch}`],
                { encoding: 'utf8', cwd: repoInfo.path, timeout: PER_REPO_TIMEOUT_MS }
              ).trim();
              commitsAhead = parseInt(count);
            } catch {
              // Ignore
            }

            // Check if branch is fully merged
            let isMerged = false;
            try {
              execFileSync('git', ['merge-base', '--is-ancestor', branch, 'origin/main'], {
                cwd: repoInfo.path,
                timeout: PER_REPO_TIMEOUT_MS,
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
      if (Date.now() > this._deadlineAt) {
        console.log(`   ⚠️  PREFLIGHT_PARTIAL: multi-repo scan deadline (${SCAN_DEADLINE_MS / 1000}s) exceeded, skipping remaining PR checks`);
        this.partial = true;
        break;
      }

      try {
        const result = execFileSync(
          'gh', ['pr', 'list', '--repo', branch.repoInfo.github, '--head', branch.branch, '--state', 'all', '--json', 'number,state,url', '--limit', '1'],
          { encoding: 'utf8', timeout: PER_REPO_TIMEOUT_MS }
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
