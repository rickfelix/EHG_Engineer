/**
 * ShippingExecutor - Executes shipping actions based on LLM decisions
 *
 * Actions:
 * - createPR: Create a pull request
 * - mergePR: Merge a pull request
 * - cleanupBranch: Delete merged branch
 *
 * @module shipping/ShippingExecutor
 * @version 1.0.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

export class ShippingExecutor {
  /**
   * @param {Object} context - Execution context from ShippingDecisionEvaluator
   */
  constructor(context) {
    this.context = context;
    this.repoPath = context.repoPath;
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Execute a shipping action
   * @param {string} action - PROCEED, ESCALATE, DEFER
   * @param {string} decisionType - PR_CREATION, PR_MERGE, BRANCH_CLEANUP
   * @returns {Promise<Object>} Execution result
   */
  async execute(action, decisionType) {
    const logPrefix = `[ShipExec:${decisionType}]`;

    if (action === 'ESCALATE') {
      console.log(`\n${logPrefix} 🚨 HUMAN ESCALATION REQUIRED`);
      return this.escalateToHuman(decisionType);
    }

    if (action === 'DEFER') {
      console.log(`${logPrefix} ⏸️  Deferred - issues need fixing first`);
      return { success: false, deferred: true, reason: 'Quality check failed - fix issues first' };
    }

    // PROCEED - execute the action
    console.log(`${logPrefix} 🚀 Executing automated action...`);

    switch (decisionType) {
      case 'PR_CREATION':
        return this.createPR();
      case 'PR_MERGE':
        return this.mergePR();
      case 'BRANCH_CLEANUP':
        return this.cleanupBranch();
      default:
        throw new Error(`Unknown decision type: ${decisionType}`);
    }
  }

  /**
   * Create a Pull Request
   */
  async createPR() {
    const startTime = Date.now();
    const result = {
      success: false,
      prUrl: null,
      prNumber: null,
      error: null,
      duration: 0
    };

    try {
      const branch = this.context.branch;

      // Ensure we have commits to push
      if (!branch || branch === 'main') {
        throw new Error('Cannot create PR from main branch');
      }

      // Push if needed
      console.log('   [1/3] Ensuring branch is pushed...');
      try {
        await execAsync(
          `cd "${this.repoPath}" && git push -u origin ${branch} 2>&1`,
          { timeout: 30000 }
        );
      } catch (pushError) {
        // May already be pushed, continue
        if (!pushError.message.includes('Everything up-to-date')) {
          console.log(`   [1/3] Push note: ${pushError.message.substring(0, 100)}`);
        }
      }

      // Build PR title and body
      console.log('   [2/3] Building PR content...');
      const title = this.buildPRTitle();
      const body = this.buildPRBody();

      // Create PR using gh CLI with HEREDOC for proper formatting
      console.log('   [3/3] Creating PR via GitHub CLI...');
      const createCommand = `cd "${this.repoPath}" && gh pr create --title "${title.replace(/"/g, '\\"')}" --body "$(cat <<'PREOF'
${body}
PREOF
)"`;

      const { stdout, stderr } = await execAsync(createCommand, { timeout: 30000 });

      // Extract PR URL from output
      const urlMatch = (stdout + stderr).match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      if (urlMatch) {
        result.prUrl = urlMatch[0];
        const numberMatch = result.prUrl.match(/\/pull\/(\d+)/);
        result.prNumber = numberMatch ? parseInt(numberMatch[1]) : null;
        result.success = true;
        console.log(`   ✅ PR #${result.prNumber} created: ${result.prUrl}`);
      } else {
        // Check if PR already exists
        const existsMatch = (stdout + stderr).match(/already exists/i);
        if (existsMatch) {
          console.log('   ℹ️  PR already exists for this branch');
          // Try to get existing PR URL
          const { stdout: prInfo } = await execAsync(
            `cd "${this.repoPath}" && gh pr view --json url,number 2>/dev/null || echo "{}"`,
            { timeout: 10000 }
          );
          try {
            const pr = JSON.parse(prInfo);
            if (pr.url) {
              result.prUrl = pr.url;
              result.prNumber = pr.number;
              result.success = true;
            }
          } catch {
            // Ignore parse error
          }
        }
      }

    } catch (error) {
      result.error = error.message;
      console.error(`   ❌ PR creation failed: ${error.message}`);
    }

    result.duration = Date.now() - startTime;
    await this.recordExecution('PR_CREATION', result);
    return result;
  }

  /**
   * Merge a Pull Request
   */
  async mergePR() {
    const startTime = Date.now();
    const result = {
      success: false,
      merged: false,
      error: null,
      duration: 0
    };

    try {
      const prNumber = this.context.prNumber;
      if (!prNumber) {
        throw new Error('No PR number provided for merge');
      }

      // Branch validation guard: verify we're on the expected branch
      // Prevents cross-session contamination where another session switched our branch
      if (this.context.expectedBranch) {
        const { stdout: currentBranch } = await execAsync(
          `cd "${this.repoPath}" && git rev-parse --abbrev-ref HEAD`,
          { timeout: 5000 }
        );
        const actual = currentBranch.trim();
        if (actual !== this.context.expectedBranch) {
          throw new Error(
            `Branch mismatch detected! Expected '${this.context.expectedBranch}' but found '${actual}'. ` +
            'Another session may have switched the branch. Aborting merge to prevent contamination.'
          );
        }
      }

      console.log(`   [1/3] Merging PR #${prNumber}...`);

      // Merge PR using gh CLI
      await execAsync(
        `cd "${this.repoPath}" && gh pr merge ${prNumber} --merge --delete-branch`,
        { timeout: 60000 }
      );

      result.success = true;
      result.merged = true;
      console.log(`   ✅ PR #${prNumber} merged successfully`);

      // Sync local main ref WITHOUT changing working directory (multi-session safe)
      // SAFETY: git fetch origin main:main updates the local main ref
      // without running git checkout, so other sessions aren't disrupted
      console.log('   [2/3] Syncing local main ref (multi-session safe)...');
      try {
        await execAsync(
          `cd "${this.repoPath}" && git fetch origin main:main`,
          { timeout: 30000 }
        );
        console.log('   ✅ Local main ref synced (no checkout)');
      } catch (syncError) {
        // git fetch origin main:main fails if we're ON main (can't update checked-out branch)
        // In that case, fall back to git pull which is safe since we're already on main
        const currentBranch = await execAsync(
          `cd "${this.repoPath}" && git rev-parse --abbrev-ref HEAD`,
          { timeout: 5000 }
        );
        if (currentBranch.stdout.trim() === 'main') {
          await execAsync(
            `cd "${this.repoPath}" && git pull origin main`,
            { timeout: 30000 }
          );
          console.log('   ✅ Local main synced (already on main, used git pull)');
        } else {
          console.log(`   ⚠️  Local sync warning: ${syncError.message.substring(0, 100)}`);
        }
      }

      console.log('   [3/3] Merge complete');

    } catch (error) {
      result.error = error.message;
      console.error(`   ❌ Merge failed: ${error.message}`);
    }

    result.duration = Date.now() - startTime;
    await this.recordExecution('PR_MERGE', result);
    return result;
  }

  /**
   * Cleanup (delete) a merged branch
   */
  async cleanupBranch() {
    const startTime = Date.now();
    const result = {
      success: false,
      branchDeleted: null,
      error: null,
      duration: 0
    };

    try {
      const branch = this.context.branch;
      if (!branch || branch === 'main') {
        throw new Error('Cannot delete main branch or no branch specified');
      }

      console.log(`   [1/2] Deleting local branch: ${branch}...`);

      // Ensure we're not on the branch to delete
      try {
        await execAsync(`cd "${this.repoPath}" && git checkout main`, { timeout: 10000 });
      } catch {
        // May already be on main
      }

      // Delete local branch
      try {
        await execAsync(`cd "${this.repoPath}" && git branch -d ${branch}`, { timeout: 10000 });
      } catch (deleteError) {
        // Force delete if not merged (we already verified it's safe via LLM)
        if (deleteError.message.includes('not fully merged')) {
          console.log('   ⚠️  Branch not marked as merged, force deleting...');
          await execAsync(`cd "${this.repoPath}" && git branch -D ${branch}`, { timeout: 10000 });
        } else if (deleteError.message.includes('not found')) {
          console.log('   ℹ️  Local branch already deleted');
        } else {
          throw deleteError;
        }
      }

      console.log(`   [2/2] Deleting remote branch: ${branch}...`);

      // Delete remote branch
      try {
        await execAsync(
          `cd "${this.repoPath}" && git push origin --delete ${branch}`,
          { timeout: 30000 }
        );
      } catch (remoteError) {
        // Remote may already be deleted (e.g., by --delete-branch in merge)
        if (!remoteError.message.includes('remote ref does not exist')) {
          console.log(`   ⚠️  Remote deletion note: ${remoteError.message.substring(0, 100)}`);
        }
      }

      result.success = true;
      result.branchDeleted = branch;
      console.log(`   ✅ Branch ${branch} deleted`);

    } catch (error) {
      result.error = error.message;
      console.error(`   ❌ Branch cleanup failed: ${error.message}`);
    }

    result.duration = Date.now() - startTime;
    await this.recordExecution('BRANCH_CLEANUP', result);
    return result;
  }

  /**
   * Handle human escalation
   */
  escalateToHuman(decisionType) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('   HUMAN ESCALATION REQUIRED');
    console.log(`${'='.repeat(60)}`);
    console.log(`   Decision Type: ${decisionType}`);
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    console.log(`   SD: ${this.context.sd?.sd_key || this.context.sdId}`);
    console.log(`   Branch: ${this.context.branch}`);
    console.log('   Reason: Low confidence - LLM cannot make this decision automatically');
    console.log('\n   Please run the interactive ship command manually:');
    console.log('   > /ship');
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: false,
      escalated: true,
      decisionType,
      reason: 'Low confidence requires human review - run /ship manually'
    };
  }

  /**
   * Build PR title from SD context
   */
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  buildPRTitle() {
    const sd = this.context.sd;
    const sdId = sd?.sd_key || this.context.sdId || 'UNKNOWN';
    const title = sd?.title || 'Implementation';

    // Determine prefix based on SD type
    const prefixMap = {
      feature: 'feat',
      infrastructure: 'infra',
      documentation: 'docs',
      database: 'db',
      security: 'security',
      bugfix: 'fix',
      refactor: 'refactor'
    };
    const prefix = prefixMap[sd?.sd_type] || 'feat';

    // Clean title - remove prefix if already present
    const cleanTitle = title.replace(/^(feat|fix|docs|infra|db|security|refactor)[\s:]+/i, '').trim();

    return `${prefix}(${sdId}): ${cleanTitle}`;
  }

  /**
   * Build PR body with SD context
   */
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  buildPRBody() {
    const sd = this.context.sd;
    const sdId = sd?.sd_key || this.context.sdId || 'UNKNOWN';

    return `## Summary

${sd?.description || 'Implementation as per Strategic Directive requirements.'}

## Changes

This PR implements the requirements defined in **${sdId}**.

## Test Plan

- [ ] Unit tests passing
- [ ] E2E tests passing
- [ ] Manual verification complete

## SD Reference

- **SD ID**: ${sdId}
- **SD Type**: ${sd?.sd_type || 'Unknown'}
- **Phase**: ${sd?.current_phase || 'Unknown'}

---

:robot: Generated automatically by LEO Protocol Automated Shipping

[Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;
  }

  /**
   * Record execution result in database
   */
  async recordExecution(decisionType, result) {
    try {
      // Update the most recent shipping decision with execution result
      const { error } = await this.supabase
        .from('shipping_decisions')
        .update({
          executed_at: new Date().toISOString(),
          execution_result: result,
          execution_duration_ms: result.duration,
          updated_at: new Date().toISOString()
        })
        // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
        .eq('sd_id', this.context.sd?.sd_key || this.context.sd?.id || this.context.sdId)
        .eq('decision_type', decisionType)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn(`[ShipExec] Failed to record execution: ${error.message}`);
      }
    } catch (error) {
      console.warn(`[ShipExec] Record error: ${error.message}`);
    }
  }
}

export default ShippingExecutor;
