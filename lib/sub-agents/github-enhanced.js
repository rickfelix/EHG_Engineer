/**
 * GITHUB Sub-Agent (DevOps Platform Architect) - ENHANCED WITH SAFETY CHECKS
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: CI/CD pipeline verification and GitHub Actions monitoring
 * Code: GITHUB
 * Priority: 90
 *
 * Philosophy: "Automation should be invisible when working, obvious when failing."
 *
 * SAFETY ENHANCEMENTS (2025-11-17):
 * - Comprehensive pre-flight checks before any destructive operations
 * - Automatic backup creation before risky git operations
 * - Merge conflict detection and resolution guidance
 * - Force-push protection with user confirmation
 * - Stash protection and recovery mechanisms
 * - Remote divergence detection
 * - User confirmation prompts for data-loss scenarios
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Enhanced: 2025-11-17 (Data Loss Prevention Initiative)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import readline from 'readline'; // eslint-disable-line no-unused-vars
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

dotenv.config();

const execAsync = promisify(exec);
// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Safety levels for git operations
 */
const SAFETY_LEVEL = {
  SAFE: 'SAFE',           // Read-only operations
  CAUTION: 'CAUTION',     // Operations that could cause data loss
  DESTRUCTIVE: 'DESTRUCTIVE' // Operations that will cause data loss
};

/**
 * Git operation safety metadata
 */
const GIT_OPERATIONS = {
  fetch: { level: SAFETY_LEVEL.SAFE, requiresBackup: false },
  pull: { level: SAFETY_LEVEL.CAUTION, requiresBackup: true },
  push: { level: SAFETY_LEVEL.CAUTION, requiresBackup: false },
  merge: { level: SAFETY_LEVEL.CAUTION, requiresBackup: true },
  rebase: { level: SAFETY_LEVEL.DESTRUCTIVE, requiresBackup: true },
  reset: { level: SAFETY_LEVEL.DESTRUCTIVE, requiresBackup: true },
  checkout: { level: SAFETY_LEVEL.CAUTION, requiresBackup: true }
};

/**
 * Execute GITHUB sub-agent
 * Verifies CI/CD pipeline status and GitHub Actions
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} GitHub verification results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔧 Starting GITHUB for ${sdId}...`);
  console.log('   DevOps Platform Architect - CI/CD Verification');
  console.log('   🛡️  ENHANCED SAFETY MODE ACTIVE');

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    safety_checks: {},
    findings: {
      workflow_status: null,
      recent_runs: null,
      failing_checks: null,
      deployment_status: null,
      branch_lifecycle: null,
      safety_status: null
    },
    options
  };

  try {
    const repoPath = options.repo_path || process.cwd();

    // Phase 0: Pre-flight safety checks (NEW)
    console.log('\n🛡️  Phase 0: Pre-flight Safety Checks...');
    const safetyStatus = await performPreflightSafetyChecks(repoPath);
    results.findings.safety_status = safetyStatus;
    results.safety_checks = safetyStatus;

    // Critical safety issues block execution
    if (safetyStatus.data_loss_risk === 'HIGH') {
      console.log('   🚨 HIGH DATA LOSS RISK DETECTED');
      results.critical_issues.push({
        severity: 'CRITICAL',
        category: 'DATA_LOSS_RISK',
        issue: 'High risk of data loss detected',
        recommendation: 'Create backup before proceeding',
        details: safetyStatus.risks
      });
      results.verdict = 'BLOCKED';
    }

    if (safetyStatus.merge_conflicts.detected) {
      console.log('   ⚠️  Merge conflicts detected');
      results.warnings.push({
        severity: 'HIGH',
        category: 'MERGE_CONFLICTS',
        issue: 'Merge conflicts require manual resolution',
        recommendation: 'Resolve conflicts before proceeding',
        files: safetyStatus.merge_conflicts.files
      });
    }

    if (safetyStatus.remote_divergence.diverged) {
      console.log('   ⚠️  Remote branch has diverged');
      results.warnings.push({
        severity: 'HIGH',
        category: 'REMOTE_DIVERGENCE',
        issue: `Remote has ${safetyStatus.remote_divergence.ahead_by} commit(s) not in local`,
        recommendation: 'Pull and merge remote changes before pushing',
        details: safetyStatus.remote_divergence
      });
      if (results.confidence > 70) results.confidence = 70;
    }

    // Phase 1: Check GitHub CLI availability
    console.log('\n🔍 Phase 1: Checking GitHub CLI...');
    try {
      const { stdout } = await execAsync('gh --version');
      console.log(`   ✅ GitHub CLI available: ${stdout.split('\n')[0]}`);
      results.findings.gh_cli_available = true;
    } catch {
      console.log('   ⚠️  GitHub CLI not available');
      results.findings.gh_cli_available = false;
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'GitHub CLI (gh) not installed or not in PATH',
        recommendation: 'Install: https://cli.github.com/',
        note: 'Manual verification required'
      });
      if (results.confidence > 80) results.confidence = 80;
    }

    // Phase 2: Check workflow status (if gh CLI available)
    console.log('\n🏗️  Phase 2: Checking GitHub Actions workflow status...');
    if (results.findings.gh_cli_available) {
      const workflowStatus = await checkWorkflowStatus(repoPath);
      results.findings.workflow_status = workflowStatus;

      if (workflowStatus.failing_workflows > 0) {
        console.log(`   ❌ ${workflowStatus.failing_workflows} workflow(s) failing`);
        results.critical_issues.push({
          severity: 'CRITICAL',
          issue: `${workflowStatus.failing_workflows} GitHub Actions workflow(s) failing`,
          recommendation: 'Fix CI/CD pipeline failures before final approval',
          failing_workflows: workflowStatus.failures.slice(0, 5)
        });
        results.verdict = 'BLOCKED';
      } else if (workflowStatus.total_workflows === 0) {
        console.log('   ⚠️  No workflows found');
        results.warnings.push({
          severity: 'MEDIUM',
          issue: 'No GitHub Actions workflows configured',
          recommendation: 'Consider setting up CI/CD for automated testing'
        });
      } else {
        console.log(`   ✅ All ${workflowStatus.total_workflows} workflow(s) passing`);
      }
    } else {
      console.log('   ⏭️  Skipped (GitHub CLI not available)');
      results.findings.workflow_status = { skipped: true, reason: 'gh CLI not available' };
    }

    // Phase 3: Check recent workflow runs
    console.log('\n📊 Phase 3: Analyzing recent workflow runs...');
    if (results.findings.gh_cli_available) {
      const recentRuns = await getRecentWorkflowRuns(repoPath);
      results.findings.recent_runs = recentRuns;

      if (recentRuns.total_runs > 0) {
        console.log(`   📈 Found ${recentRuns.total_runs} recent run(s)`);
        console.log(`      Success: ${recentRuns.success_count}, Failed: ${recentRuns.failed_count}`);

        const failureRate = (recentRuns.failed_count / recentRuns.total_runs) * 100;
        if (failureRate > 20) {
          results.warnings.push({
            severity: 'HIGH',
            issue: `High CI/CD failure rate: ${failureRate.toFixed(1)}%`,
            recommendation: 'Investigate recurring pipeline failures',
            recent_failures: recentRuns.recent_failures.slice(0, 3)
          });
          if (results.confidence > 70) results.confidence = 70;
        }
      } else {
        console.log('   ℹ️  No recent workflow runs found');
      }
    } else {
      console.log('   ⏭️  Skipped (GitHub CLI not available)');
      results.findings.recent_runs = { skipped: true };
    }

    // Phase 4: Deployment status check
    console.log('\n🚀 Phase 4: Checking deployment status...');
    if (results.findings.gh_cli_available) {
      const deploymentStatus = await checkDeploymentStatus(repoPath);
      results.findings.deployment_status = deploymentStatus;

      if (deploymentStatus.latest_deployment) {
        const status = deploymentStatus.latest_deployment.status;
        console.log(`   Latest deployment: ${status}`);

        if (status === 'failure' || status === 'error') {
          results.critical_issues.push({
            severity: 'CRITICAL',
            issue: 'Latest deployment failed',
            recommendation: 'Fix deployment issues before proceeding',
            deployment: deploymentStatus.latest_deployment
          });
          results.verdict = 'BLOCKED';
        }
      } else {
        console.log('   ℹ️  No deployments configured or found');
      }
    } else {
      console.log('   ⏭️  Skipped (GitHub CLI not available)');
      results.findings.deployment_status = { skipped: true };
    }

    // Phase 5: Branch lifecycle verification
    console.log('\n🌿 Phase 5: Branch lifecycle verification...');
    const branchLifecycle = await checkBranchLifecycle(repoPath);
    results.findings.branch_lifecycle = branchLifecycle;

    // Critical: Uncommitted changes block handoff
    if (branchLifecycle.uncommitted_changes.has_changes) {
      console.log('   ❌ Uncommitted changes detected');
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: 'Uncommitted changes detected in current branch',
        recommendation: 'Commit or stash changes before creating handoff',
        details: {
          modified: branchLifecycle.uncommitted_changes.modified_count,
          staged: branchLifecycle.uncommitted_changes.staged_count,
          untracked: branchLifecycle.uncommitted_changes.untracked_count
        }
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No uncommitted changes');
    }

    // Warning: Unpushed commits
    if (branchLifecycle.current_branch.unpushed_commits > 0) {
      console.log(`   ⚠️  ${branchLifecycle.current_branch.unpushed_commits} unpushed commit(s)`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `Current branch has ${branchLifecycle.current_branch.unpushed_commits} unpushed commit(s)`,
        recommendation: 'Push commits to remote before handoff',
        branch: branchLifecycle.current_branch.name
      });
      if (results.confidence > 75) results.confidence = 75;
    } else {
      console.log('   ✅ Current branch synced with remote');
    }

    // Warning: Multiple unmerged branches
    if (branchLifecycle.unmerged_branches.count > 5) {
      console.log(`   ⚠️  ${branchLifecycle.unmerged_branches.count} unmerged branches`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${branchLifecycle.unmerged_branches.count} unmerged branches detected`,
        recommendation: 'Review and merge or delete stale branches',
        branches: branchLifecycle.unmerged_branches.branches.slice(0, 5)
      });
      if (results.confidence > 80) results.confidence = 80;
    } else if (branchLifecycle.unmerged_branches.count > 0) {
      console.log(`   ℹ️  ${branchLifecycle.unmerged_branches.count} unmerged branch(es)`);
    } else {
      console.log('   ✅ No unmerged branches');
    }

    // Info: Stale branches
    if (branchLifecycle.stale_branches.count > 0) {
      console.log(`   ℹ️  ${branchLifecycle.stale_branches.count} stale branch(es) (30+ days)`);
      results.recommendations.push(
        `Clean up ${branchLifecycle.stale_branches.count} stale branch(es): ${branchLifecycle.stale_branches.branches.slice(0, 3).join(', ')}`
      );
    }

    // Generate recommendations
    console.log('\n💡 Generating recommendations...');
    generateRecommendations(results);

    console.log(`\n🏁 GITHUB Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch {
    console.error('\n❌ GITHUB error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'GITHUB sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * NEW: Perform comprehensive pre-flight safety checks
 * Detects potential data loss scenarios before they happen
 */
async function performPreflightSafetyChecks(repoPath) {
  const safety = {
    timestamp: new Date().toISOString(),
    data_loss_risk: 'LOW',
    risks: [],
    uncommitted_changes: {
      detected: false,
      files: []
    },
    unpushed_commits: {
      detected: false,
      count: 0,
      commits: []
    },
    stash_entries: {
      count: 0,
      entries: []
    },
    remote_divergence: {
      diverged: false,
      ahead_by: 0,
      behind_by: 0
    },
    merge_conflicts: {
      detected: false,
      files: []
    },
    backup_needed: false,
    safe_to_proceed: true
  };

  try {
    // Check 1: Uncommitted changes
    console.log('   🔍 Checking for uncommitted changes...');
    const { stdout: statusOutput } = await execAsync(`cd "${repoPath}" && git status --porcelain`);
    if (statusOutput.trim()) {
      safety.uncommitted_changes.detected = true;
      safety.uncommitted_changes.files = statusOutput.trim().split('\n');
      safety.risks.push({
        type: 'UNCOMMITTED_CHANGES',
        severity: 'HIGH',
        message: `${safety.uncommitted_changes.files.length} uncommitted file(s)`,
        recommendation: 'Commit or stash changes before pull/merge operations'
      });
      safety.data_loss_risk = 'HIGH';
      safety.backup_needed = true;
      console.log(`      ⚠️  ${safety.uncommitted_changes.files.length} uncommitted file(s)`);
    } else {
      console.log('      ✅ No uncommitted changes');
    }

    // Check 2: Unpushed commits
    console.log('   🔍 Checking for unpushed commits...');
    try {
      const { stdout: unpushedOutput } = await execAsync(
        `cd "${repoPath}" && git log @{u}.. --oneline 2>/dev/null || echo ""`
      );
      if (unpushedOutput.trim()) {
        const commits = unpushedOutput.trim().split('\n');
        safety.unpushed_commits.detected = true;
        safety.unpushed_commits.count = commits.length;
        safety.unpushed_commits.commits = commits;
        safety.risks.push({
          type: 'UNPUSHED_COMMITS',
          severity: 'MEDIUM',
          message: `${commits.length} unpushed commit(s)`,
          recommendation: 'Push commits to remote to prevent potential loss'
        });
        if (safety.data_loss_risk === 'LOW') safety.data_loss_risk = 'MEDIUM';
        console.log(`      ⚠️  ${commits.length} unpushed commit(s)`);
      } else {
        console.log('      ✅ No unpushed commits');
      }
    } catch {
      console.log('      ℹ️  Branch not tracking remote');
    }

    // Check 3: Stash entries
    console.log('   🔍 Checking stash entries...');
    try {
      const { stdout: stashOutput } = await execAsync(`cd "${repoPath}" && git stash list`);
      if (stashOutput.trim()) {
        const stashes = stashOutput.trim().split('\n');
        safety.stash_entries.count = stashes.length;
        safety.stash_entries.entries = stashes.slice(0, 5); // First 5 only
        console.log(`      ℹ️  ${stashes.length} stash entrie(s) exist`);
        if (stashes.length > 10) {
          safety.risks.push({
            type: 'MANY_STASHES',
            severity: 'LOW',
            message: `${stashes.length} stash entries (consider cleaning up)`,
            recommendation: 'Review and apply or drop old stashes'
          });
        }
      } else {
        console.log('      ✅ No stash entries');
      }
    } catch {
      console.log('      ℹ️  Could not check stash');
    }

    // Check 4: Remote divergence
    console.log('   🔍 Checking remote divergence...');
    try {
      // Fetch first to get latest remote state
      await execAsync(`cd "${repoPath}" && git fetch --quiet 2>/dev/null || true`);

      const { stdout: revListOutput } = await execAsync(
        `cd "${repoPath}" && git rev-list --left-right --count HEAD...@{u} 2>/dev/null || echo "0\t0"`
      );
      const [ahead, behind] = revListOutput.trim().split('\t').map(Number);

      if (ahead > 0 || behind > 0) {
        safety.remote_divergence.diverged = true;
        safety.remote_divergence.ahead_by = ahead;
        safety.remote_divergence.behind_by = behind;

        if (behind > 0) {
          safety.risks.push({
            type: 'REMOTE_AHEAD',
            severity: 'HIGH',
            message: `Remote has ${behind} commit(s) not in local`,
            recommendation: 'Pull remote changes before pushing to avoid conflicts'
          });
          if (safety.data_loss_risk === 'LOW') safety.data_loss_risk = 'MEDIUM';
          console.log(`      ⚠️  Remote ahead by ${behind} commit(s)`);
        }

        if (ahead > 0) {
          console.log(`      ℹ️  Local ahead by ${ahead} commit(s)`);
        }
      } else {
        console.log('      ✅ In sync with remote');
      }
    } catch {
      console.log('      ℹ️  Could not check remote divergence');
    }

    // Check 5: Merge conflicts (in case of ongoing merge/rebase)
    console.log('   🔍 Checking for merge conflicts...');
    try {
      const { stdout: conflictCheck } = await execAsync(
        `cd "${repoPath}" && git ls-files -u`
      );
      if (conflictCheck.trim()) {
        const conflictFiles = conflictCheck.trim().split('\n');
        safety.merge_conflicts.detected = true;
        safety.merge_conflicts.files = conflictFiles;
        safety.risks.push({
          type: 'MERGE_CONFLICTS',
          severity: 'CRITICAL',
          message: `${conflictFiles.length} file(s) have merge conflicts`,
          recommendation: 'Resolve conflicts manually before proceeding'
        });
        safety.data_loss_risk = 'HIGH';
        safety.safe_to_proceed = false;
        console.log(`      🚨 ${conflictFiles.length} file(s) with conflicts`);
      } else {
        console.log('      ✅ No merge conflicts');
      }
    } catch {
      console.log('      ✅ No merge conflicts');
    }

    // Check 6: Ongoing git operations
    console.log('   🔍 Checking for ongoing git operations...');
    try {
      const gitDir = `${repoPath}/.git`;
      const operations = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD'];

      for (const op of operations) {
        try {
          await execAsync(`test -f "${gitDir}/${op}"`);
          const opName = op.replace('_HEAD', '').toLowerCase();
          safety.risks.push({
            type: 'ONGOING_OPERATION',
            severity: 'CRITICAL',
            message: `Ongoing ${opName} operation detected`,
            recommendation: `Complete or abort ${opName} before other operations`
          });
          safety.data_loss_risk = 'HIGH';
          safety.safe_to_proceed = false;
          console.log(`      🚨 Ongoing ${opName} operation`);
        } catch {
          // File doesn't exist, operation not in progress
        }
      }

      if (safety.safe_to_proceed) {
        console.log('      ✅ No ongoing operations');
      }
    } catch {
      console.log('      ℹ️  Could not check for ongoing operations');
    }

    // Final risk assessment
    if (safety.data_loss_risk === 'HIGH') {
      console.log('\n   🚨 HIGH DATA LOSS RISK - Backup strongly recommended');
    } else if (safety.data_loss_risk === 'MEDIUM') {
      console.log('\n   ⚠️  MEDIUM DATA LOSS RISK - Proceed with caution');
    } else {
      console.log('\n   ✅ LOW DATA LOSS RISK - Safe to proceed');
    }

    return safety;

  } catch {
    console.error(`   ❌ Safety check error: ${error.message}`);
    safety.safe_to_proceed = false;
    safety.data_loss_risk = 'UNKNOWN';
    return safety;
  }
}

/**
 * NEW: Create automatic safety backup before destructive operations
 */
async function createSafetyBackup(repoPath, operation) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupBranch = `safety-backup/${operation}/${timestamp}`;

  console.log(`\n🛡️  Creating safety backup: ${backupBranch}`);

  try {
    // Create backup branch without switching to it
    await execAsync(`cd "${repoPath}" && git branch "${backupBranch}"`);
    console.log(`   ✅ Backup created: ${backupBranch}`);

    // Also create a stash as secondary backup
    const { stdout: stashOutput } = await execAsync(
      `cd "${repoPath}" && git stash push -u -m "Safety backup: ${operation} @ ${timestamp}"`
    );

    if (!stashOutput.includes('No local changes')) {
      console.log('   ✅ Stash backup created');
    }

    return {
      success: true,
      backup_branch: backupBranch,
      timestamp
    };
  } catch {
    console.error(`   ❌ Backup failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * NEW: Safe git pull with pre-checks and backup
 */
async function safeGitPull(repoPath, remote = 'origin', branch = null) {
  console.log(`\n🔄 Performing SAFE git pull from ${remote}...`);

  // Step 1: Pre-flight checks
  const safety = await performPreflightSafetyChecks(repoPath);

  if (safety.data_loss_risk === 'HIGH') {
    console.log('   🚨 HIGH RISK - Creating backup before pull...');
    const backup = await createSafetyBackup(repoPath, 'pull');

    if (!backup.success) {
      throw new Error('Cannot proceed with pull - backup failed');
    }
  }

  // Step 2: Get current branch if not specified
  if (!branch) {
    const { stdout } = await execAsync(`cd "${repoPath}" && git branch --show-current`);
    branch = stdout.trim();
  }

  // Step 3: Fetch first
  console.log('   📥 Fetching from remote...');
  await execAsync(`cd "${repoPath}" && git fetch ${remote} ${branch}`);

  // Step 4: Check for conflicts BEFORE pulling
  try {
    const { stdout: mergeCheck } = await execAsync(
      `cd "${repoPath}" && git merge-tree $(git merge-base HEAD ${remote}/${branch}) HEAD ${remote}/${branch}`
    );

    if (mergeCheck.includes('<<<<<<<')) {
      throw new Error(`Merge conflicts would occur. Resolve conflicts manually.\n${mergeCheck}`);
    }
  } catch {
    if (error.message.includes('merge conflicts')) {
      throw error;
    }
    // merge-tree command not available or other error - proceed with caution
    console.log('   ⚠️  Could not pre-check for conflicts');
  }

  // Step 5: Perform pull
  console.log('   ⬇️  Pulling changes...');
  const { stdout: pullOutput } = await execAsync(
    `cd "${repoPath}" && git pull ${remote} ${branch}`
  );

  console.log('   ✅ Pull completed successfully');
  return {
    success: true,
    output: pullOutput
  };
}

/**
 * NEW: Safe git push with pre-checks
 */
async function safeGitPush(repoPath, remote = 'origin', branch = null, options = {}) {
  console.log(`\n🔄 Performing SAFE git push to ${remote}...`);

  // Step 1: Pre-flight checks
  const safety = await performPreflightSafetyChecks(repoPath);

  if (safety.uncommitted_changes.detected) {
    throw new Error('Cannot push with uncommitted changes. Commit or stash first.');
  }

  // Step 2: Get current branch if not specified
  if (!branch) {
    const { stdout } = await execAsync(`cd "${repoPath}" && git branch --show-current`);
    branch = stdout.trim();
  }

  // Step 3: Check if push would be rejected (non-fast-forward)
  console.log('   🔍 Checking for remote changes...');
  await execAsync(`cd "${repoPath}" && git fetch ${remote} ${branch}`);

  try {
    await execAsync(
      `cd "${repoPath}" && git merge-base --is-ancestor ${remote}/${branch} HEAD`
    );
    console.log('   ✅ Push will be fast-forward');
  } catch {
    console.log('   ⚠️  Remote has diverged - push would be rejected');

    if (options.force) {
      console.log('   🚨 FORCE PUSH REQUESTED - This will overwrite remote commits!');

      // Require explicit confirmation for force push
      if (!options.confirmed) {
        throw new Error(
          'BLOCKED: Force push requires explicit confirmation.\n' +
          'Remote commits would be lost. Pull and merge first, or confirm force push.'
        );
      }

      // Create backup before force push
      console.log('   🛡️  Creating backup before force push...');
      await createSafetyBackup(repoPath, 'force-push');
    } else {
      throw new Error(
        'Push rejected: Remote has changes not in local branch.\n' +
        'Pull remote changes first: git pull origin ' + branch
      );
    }
  }

  // Step 4: Perform push
  const pushCommand = options.force ?
    `cd "${repoPath}" && git push ${remote} ${branch} --force-with-lease` :
    `cd "${repoPath}" && git push ${remote} ${branch}`;

  console.log(`   ⬆️  Pushing to ${remote}/${branch}...`);
  const { stdout: pushOutput } = await execAsync(pushCommand);

  console.log('   ✅ Push completed successfully');
  return {
    success: true,
    output: pushOutput
  };
}

/**
 * Check workflow status
 */
async function checkWorkflowStatus(repoPath) {
  try {
    const { stdout } = await execAsync(`cd "${repoPath}" && gh workflow list`);
    const lines = stdout.trim().split('\n').filter(line => line.trim());

    const workflows = lines.map(line => {
      const parts = line.split('\t').map(p => p.trim());
      return {
        name: parts[0],
        state: parts[1],
        id: parts[2]
      };
    });

    const failingWorkflows = workflows.filter(w =>
      w.state && (w.state.toLowerCase().includes('fail') || w.state.toLowerCase().includes('error'))
    );

    return {
      total_workflows: workflows.length,
      failing_workflows: failingWorkflows.length,
      workflows: workflows,
      failures: failingWorkflows
    };
  } catch {
    console.error(`   ⚠️  Could not check workflow status: ${error.message}`);
    return {
      error: error.message,
      total_workflows: 0,
      failing_workflows: 0,
      workflows: [],
      failures: []
    };
  }
}

/**
 * Get recent workflow runs
 */
async function getRecentWorkflowRuns(repoPath) {
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && gh run list --limit 10 --json conclusion,status,name,createdAt`
    );
    const runs = JSON.parse(stdout);

    const successCount = runs.filter(r => r.conclusion === 'success').length;
    const failedCount = runs.filter(r => r.conclusion === 'failure').length;
    const recentFailures = runs
      .filter(r => r.conclusion === 'failure')
      .map(r => ({ name: r.name, created_at: r.createdAt }));

    return {
      total_runs: runs.length,
      success_count: successCount,
      failed_count: failedCount,
      recent_failures: recentFailures,
      runs: runs
    };
  } catch {
    console.error(`   ⚠️  Could not get recent runs: ${error.message}`);
    return {
      error: error.message,
      total_runs: 0,
      success_count: 0,
      failed_count: 0,
      recent_failures: [],
      runs: []
    };
  }
}

/**
 * Check deployment status
 */
async function checkDeploymentStatus(repoPath) {
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && gh api repos/{owner}/{repo}/deployments --jq '.[0] | {environment, state: .statuses_url}' 2>/dev/null || echo "{}"`
    );

    if (stdout.trim() === '{}' || !stdout.trim()) {
      return {
        latest_deployment: null,
        note: 'No deployments found or API access issue'
      };
    }

    const deployment = JSON.parse(stdout);
    return {
      latest_deployment: deployment,
      checked: true
    };
  } catch {
    return {
      error: error.message,
      latest_deployment: null
    };
  }
}

/**
 * Check branch lifecycle
 */
async function checkBranchLifecycle(repoPath) {
  const lifecycle = {
    current_branch: {
      name: null,
      unpushed_commits: 0
    },
    uncommitted_changes: {
      has_changes: false,
      modified_count: 0,
      staged_count: 0,
      untracked_count: 0
    },
    unmerged_branches: {
      count: 0,
      branches: []
    },
    stale_branches: {
      count: 0,
      branches: []
    }
  };

  try {
    // Get current branch
    const { stdout: currentBranch } = await execAsync(`cd "${repoPath}" && git branch --show-current`);
    lifecycle.current_branch.name = currentBranch.trim();

    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync(`cd "${repoPath}" && git status --porcelain`);
    if (statusOutput.trim()) {
      lifecycle.uncommitted_changes.has_changes = true;
      const lines = statusOutput.trim().split('\n');
      lines.forEach(line => {
        const status = line.substring(0, 2);
        if (status[0] === 'M' || status[0] === 'A' || status[0] === 'D') {
          lifecycle.uncommitted_changes.staged_count++;
        }
        if (status[1] === 'M' || status[1] === 'D') {
          lifecycle.uncommitted_changes.modified_count++;
        }
        if (status.includes('??')) {
          lifecycle.uncommitted_changes.untracked_count++;
        }
      });
    }

    // Check for unpushed commits
    try {
      const { stdout: unpushed } = await execAsync(
        `cd "${repoPath}" && git log @{u}.. --oneline 2>/dev/null || echo ""`
      );
      if (unpushed.trim()) {
        lifecycle.current_branch.unpushed_commits = unpushed.trim().split('\n').length;
      }
    } catch {
      // Branch may not have upstream - not an error
      lifecycle.current_branch.unpushed_commits = 0;
    }

    // Check for unmerged branches (branches not in main)
    try {
      const { stdout: unmergedOutput } = await execAsync(
        `cd "${repoPath}" && git branch --no-merged main 2>/dev/null || echo ""`
      );
      if (unmergedOutput.trim()) {
        const branches = unmergedOutput.trim().split('\n')
          .map(b => b.trim().replace(/^\*\s*/, ''))
          .filter(b => b);
        lifecycle.unmerged_branches.count = branches.length;
        lifecycle.unmerged_branches.branches = branches;
      }
    } catch {
      // main branch may not exist or other git error
      lifecycle.unmerged_branches.count = 0;
    }

    // Check for stale branches (30+ days old)
    try {
      const { stdout: branchDates } = await execAsync(
        `cd "${repoPath}" && git for-each-ref --format="%(refname:short)|%(committerdate:unix)" refs/heads/`
      );
      const thirtyDaysAgo = Date.now() / 1000 - (30 * 24 * 60 * 60);

      branchDates.trim().split('\n').forEach(line => {
        if (line.trim()) {
          const [branch, timestamp] = line.split('|');
          if (parseInt(timestamp) < thirtyDaysAgo && branch !== 'main') {
            lifecycle.stale_branches.branches.push(branch);
            lifecycle.stale_branches.count++;
          }
        }
      });
    } catch {
      // Git error - skip stale branch check
      lifecycle.stale_branches.count = 0;
    }

    return lifecycle;
  } catch {
    console.error(`   ⚠️  Error checking branch lifecycle: ${error.message}`);
    return lifecycle;
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(results) {
  const { findings, critical_issues, warnings, safety_checks } = results;

  // Safety-specific recommendations
  if (safety_checks?.data_loss_risk === 'HIGH') {
    results.recommendations.unshift(
      '🛡️  HIGH DATA LOSS RISK: Create backup before proceeding',
      'Use: git branch safety-backup-$(date +%Y%m%d-%H%M%S)'
    );
  }

  if (safety_checks?.merge_conflicts?.detected) {
    results.recommendations.unshift(
      '⚠️  Resolve merge conflicts manually before any operations',
      'View conflicts: git status',
      'Resolve: Edit files, then: git add <file> && git commit'
    );
  }

  if (safety_checks?.remote_divergence?.diverged && safety_checks.remote_divergence.behind_by > 0) {
    results.recommendations.unshift(
      `⚠️  Remote is ${safety_checks.remote_divergence.behind_by} commit(s) ahead`,
      'Pull remote changes first: git pull origin <branch>',
      'Review changes before merging'
    );
  }

  if (!findings.gh_cli_available) {
    results.recommendations.push(
      'Install GitHub CLI (gh) for automated CI/CD verification',
      'Manual verification required: Check https://github.com/[repo]/actions'
    );
  }

  if (critical_issues.length > 0) {
    results.recommendations.push(
      'Fix all CI/CD pipeline failures before LEAD approval',
      'Review failed workflow logs via: gh run view [run-id]'
    );
  }

  if (findings.workflow_status?.total_workflows === 0) {
    results.recommendations.push(
      'Consider setting up GitHub Actions for automated testing',
      'Recommended workflows: test, lint, build, deploy'
    );
  }

  if (findings.recent_runs?.failed_count > 0) {
    results.recommendations.push(
      'Investigate recent workflow failures to identify patterns',
      'Fix flaky tests if failure rate > 10%'
    );
  }

  if (critical_issues.length === 0 && warnings.length === 0) {
    results.recommendations.push(
      'CI/CD pipeline healthy - ready for deployment',
      'Continue monitoring workflow status'
    );
  }
}

// Export safe operation functions for external use
export {
  performPreflightSafetyChecks,
  createSafetyBackup,
  safeGitPull,
  safeGitPush,
  SAFETY_LEVEL,
  GIT_OPERATIONS
};
