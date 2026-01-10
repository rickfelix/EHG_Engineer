/**
 * SDGitStateReconciler - Compare database SD status with git state
 *
 * Detects mismatches between SD status in database and actual git state:
 * - SD "completed" but branch has unmerged commits → BLOCK
 * - SD "in_progress" but no branch exists → WARN
 * - SD "in_progress" but branch already merged → WARN
 *
 * @module shipping/SDGitStateReconciler
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Repository paths
const REPO_PATHS = {
  'rickfelix/ehg': '/mnt/c/_EHG/ehg',
  'rickfelix/EHG_Engineer': '/mnt/c/_EHG/EHG_Engineer'
};

// SD status categories
const COMPLETED_STATUSES = ['completed', 'approved', 'merged', 'done', 'shipped', 'archived'];
const IN_PROGRESS_STATUSES = ['in_progress', 'active', 'pending_approval'];
const PLANNING_STATUSES = ['draft', 'planning', 'deferred'];

export class SDGitStateReconciler {
  /**
   * @param {string} sdId - Strategic Directive ID
   * @param {Object} options - Configuration options
   */
  constructor(sdId, options = {}) {
    this.sdId = sdId;
    this.options = {
      verbose: false,
      autoFix: false,
      ...options
    };
    this.supabase = null;
  }

  async initialize() {
    if (!this.supabase) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
  }

  /**
   * Main reconciliation entry point
   * @returns {Promise<Object>} Reconciliation results
   */
  async reconcile() {
    await this.initialize();

    console.log('\n🔄 State Reconciliation');
    console.log('-'.repeat(50));

    // Get SD state from database
    const sdState = await this.getSDState();
    if (!sdState) {
      return {
        passed: false,
        status: 'ERROR',
        message: `SD not found: ${this.sdId}`,
        mismatches: [],
        warnings: [{ type: 'SD_NOT_FOUND', sdId: this.sdId }]
      };
    }

    // Get git state across repos
    const gitState = await this.getGitState();

    // Compare states
    const comparison = this.compareStates(sdState, gitState);

    this.printResults(sdState, gitState, comparison);

    return {
      passed: comparison.mismatches.length === 0,
      status: comparison.mismatches.length > 0 ? 'MISMATCH' : 'OK',
      sdState,
      gitState,
      ...comparison
    };
  }

  /**
   * Get SD state from database
   * @returns {Promise<Object|null>} SD state
   */
  async getSDState() {
    // Try both id and legacy_id patterns
    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase, progress_percentage, metadata, completion_date')
      .or(`id.ilike.%${this.sdId}%,legacy_id.ilike.%${this.sdId}%`)
      .limit(1)
      .single();

    if (error || !sd) {
      if (this.options.verbose) {
        console.log(`   ⚠️  SD lookup failed: ${error?.message || 'not found'}`);
      }
      return null;
    }

    return {
      id: sd.id,
      title: sd.title,
      status: sd.status,
      phase: sd.current_phase,
      progress: sd.progress_percentage,
      featureBranch: sd.metadata?.feature_branch,
      mergedBranch: sd.metadata?.merged_branch,
      completionDate: sd.completion_date,
      isCompleted: COMPLETED_STATUSES.includes(sd.status),
      isInProgress: IN_PROGRESS_STATUSES.includes(sd.status),
      isPlanning: PLANNING_STATUSES.includes(sd.status)
    };
  }

  /**
   * Get git state across all repos
   * @returns {Promise<Object>} Git state
   */
  async getGitState() {
    const state = {
      branches: [],
      hasMergedWork: false,
      hasUnmergedWork: false,
      mergeEvidence: []
    };

    const branchPatterns = [
      `feat/${this.sdId}`,
      `fix/${this.sdId}`,
      `docs/${this.sdId}`,
      `test/${this.sdId}`
    ];

    for (const [repo, repoPath] of Object.entries(REPO_PATHS)) {
      if (!existsSync(repoPath)) continue;

      try {
        // Sync with remote
        execSync('git fetch --prune', { cwd: repoPath, timeout: 30000, stdio: 'pipe' });

        // Check for branches matching SD
        const branchList = execSync('git branch -r', {
          encoding: 'utf8',
          cwd: repoPath,
          timeout: 10000
        });

        for (const pattern of branchPatterns) {
          const matching = branchList.split('\n')
            .map(b => b.trim())
            .filter(b => b.toLowerCase().includes(pattern.toLowerCase()) && !b.includes('HEAD'));

          for (const branch of matching) {
            const cleanBranch = branch.replace('origin/', '');

            // Check commits ahead of main
            let commitsAhead = 0;
            try {
              const count = execSync(
                `git rev-list --count origin/main..${branch}`,
                { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
              ).trim();
              commitsAhead = parseInt(count);
            } catch (_e) {
              // Ignore
            }

            state.branches.push({
              repo,
              repoPath,
              name: cleanBranch,
              commitsAhead,
              isUnmerged: commitsAhead > 0
            });

            if (commitsAhead > 0) {
              state.hasUnmergedWork = true;
            }
          }
        }

        // Check for merge evidence in main
        const mergeEvidence = this.checkMergeEvidence(repoPath);
        if (mergeEvidence.found) {
          state.hasMergedWork = true;
          state.mergeEvidence.push({
            repo,
            ...mergeEvidence
          });
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`   ⚠️  Error checking ${repo}: ${error.message}`);
        }
      }
    }

    return state;
  }

  /**
   * Check for merge evidence in git history
   * @param {string} repoPath - Path to repository
   * @returns {Object} Merge evidence
   */
  checkMergeEvidence(repoPath) {
    try {
      // Look for merge commits mentioning this SD
      const mergeCommit = execSync(
        `git log main --merges --grep="${this.sdId}" --format="%H %s" -1 2>/dev/null || true`,
        { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
      ).trim();

      if (mergeCommit) {
        return {
          found: true,
          type: 'merge_commit',
          commit: mergeCommit.split(' ')[0],
          message: mergeCommit.split(' ').slice(1).join(' ')
        };
      }

      // Look for PR merge pattern
      const prMerge = execSync(
        `git log main --format="%H %s" --grep="Merge pull request" | grep -i "${this.sdId}" | head -1 2>/dev/null || true`,
        { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
      ).trim();

      if (prMerge) {
        return {
          found: true,
          type: 'pr_merge',
          commit: prMerge.split(' ')[0],
          message: prMerge.split(' ').slice(1).join(' ')
        };
      }

      // Look for commits mentioning SD
      const sdCommit = execSync(
        `git log main --format="%H %s" --grep="${this.sdId}" -1 2>/dev/null || true`,
        { encoding: 'utf8', cwd: repoPath, timeout: 10000 }
      ).trim();

      if (sdCommit) {
        return {
          found: true,
          type: 'commit',
          commit: sdCommit.split(' ')[0],
          message: sdCommit.split(' ').slice(1).join(' ')
        };
      }
    } catch (_error) {
      // Ignore
    }

    return { found: false };
  }

  /**
   * Compare SD state with git state
   * @param {Object} sdState - SD state from database
   * @param {Object} gitState - Git state from repos
   * @returns {Object} Comparison results
   */
  compareStates(sdState, gitState) {
    const mismatches = [];
    const warnings = [];
    const autoFixOptions = [];

    // Mismatch 1: SD completed but branch has unmerged commits
    if (sdState.isCompleted && gitState.hasUnmergedWork) {
      const unmergedBranches = gitState.branches.filter(b => b.isUnmerged);
      mismatches.push({
        type: 'COMPLETED_BUT_UNMERGED',
        severity: 'BLOCK',
        message: `SD status is '${sdState.status}' but ${unmergedBranches.length} branch(es) have unmerged commits`,
        details: unmergedBranches,
        remediation: [
          'Option 1: Create PRs and merge the branches',
          'Option 2: If work is superseded, delete the branches',
          'Option 3: If status is wrong, revert SD to in_progress'
        ]
      });

      autoFixOptions.push({
        type: 'REVERT_SD_STATUS',
        action: 'Update SD status to in_progress',
        command: `UPDATE strategic_directives_v2 SET status='in_progress' WHERE id='${sdState.id}'`
      });
    }

    // Mismatch 2: SD in progress but no branch exists and no merge evidence
    if (sdState.isInProgress && gitState.branches.length === 0 && !gitState.hasMergedWork) {
      warnings.push({
        type: 'IN_PROGRESS_NO_BRANCH',
        severity: 'WARN',
        message: `SD status is '${sdState.status}' but no feature branch found`,
        remediation: [
          'Create a feature branch for this SD',
          'Or if work is complete, run LEAD-FINAL-APPROVAL handoff'
        ]
      });
    }

    // Mismatch 3: SD in progress but work already merged
    if (sdState.isInProgress && gitState.hasMergedWork && !gitState.hasUnmergedWork) {
      warnings.push({
        type: 'IN_PROGRESS_ALREADY_MERGED',
        severity: 'WARN',
        message: `SD status is '${sdState.status}' but work appears to be merged to main`,
        details: gitState.mergeEvidence,
        remediation: [
          'Run: node scripts/handoff.js execute LEAD-FINAL-APPROVAL ' + this.sdId
        ]
      });

      autoFixOptions.push({
        type: 'COMPLETE_SD',
        action: 'Run LEAD-FINAL-APPROVAL handoff',
        command: `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${this.sdId}`
      });
    }

    // Mismatch 4: SD in planning but has commits
    if (sdState.isPlanning && gitState.hasUnmergedWork) {
      warnings.push({
        type: 'PLANNING_HAS_COMMITS',
        severity: 'INFO',
        message: `SD is in '${sdState.status}' phase but has commits on feature branch`,
        remediation: [
          'Consider transitioning to EXEC phase',
          'Or ensure commits are from exploration work only'
        ]
      });
    }

    return {
      mismatches,
      warnings,
      autoFixOptions,
      isConsistent: mismatches.length === 0 && warnings.length === 0
    };
  }

  /**
   * Print reconciliation results
   */
  printResults(sdState, gitState, comparison) {
    console.log(`\n   SD State: ${sdState.status} (${sdState.phase || 'N/A'})`);
    console.log(`   Git State: ${gitState.branches.length} branch(es), ${gitState.hasUnmergedWork ? 'has unmerged' : 'all merged'}`);

    if (comparison.mismatches.length > 0) {
      console.log('\n❌ State Mismatches (BLOCKING):');
      for (const m of comparison.mismatches) {
        console.log(`   • ${m.message}`);
        if (m.remediation) {
          console.log('     Remediation:');
          m.remediation.forEach(r => console.log(`       - ${r}`));
        }
      }
    }

    if (comparison.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const w of comparison.warnings) {
        console.log(`   • ${w.message}`);
        if (w.remediation) {
          console.log('     Remediation:');
          w.remediation.forEach(r => console.log(`       - ${r}`));
        }
      }
    }

    if (comparison.isConsistent) {
      console.log('\n✅ State Reconciliation: PASS');
      console.log('   Database and git states are consistent');
    } else if (comparison.mismatches.length > 0) {
      console.log('\n❌ State Reconciliation: BLOCKED');
    } else {
      console.log('\n⚠️  State Reconciliation: WARNING');
    }
  }

  /**
   * Execute auto-fix for a specific mismatch
   * @param {Object} fix - Auto-fix option to execute
   * @returns {Promise<boolean>} Success status
   */
  async executeAutoFix(fix) {
    console.log(`\n🔧 Executing auto-fix: ${fix.action}`);

    switch (fix.type) {
      case 'REVERT_SD_STATUS':
        try {
          const { error } = await this.supabase
            .from('strategic_directives_v2')
            .update({ status: 'in_progress', updated_at: new Date().toISOString() })
            .eq('id', fix.sdId || this.sdId);

          if (error) throw error;
          console.log('   ✅ SD status reverted to in_progress');
          return true;
        } catch (error) {
          console.log(`   ❌ Failed: ${error.message}`);
          return false;
        }

      case 'COMPLETE_SD':
        console.log(`   → Run manually: ${fix.command}`);
        return false;

      default:
        console.log(`   ⚠️  Unknown fix type: ${fix.type}`);
        return false;
    }
  }
}

export default SDGitStateReconciler;
