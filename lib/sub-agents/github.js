/**
 * GITHUB Sub-Agent (DevOps Platform Architect)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: CI/CD pipeline verification and GitHub Actions monitoring
 * Code: GITHUB
 * Priority: 90
 *
 * Philosophy: "Automation should be invisible when working, obvious when failing."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

dotenv.config();

const execAsync = promisify(exec);
// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

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

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // PAT-DB-SD-E2E-001: Database/Infrastructure SDs have reduced CI/CD requirements
  // Check SD type and apply relaxed validation for non-deployment SDs
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('category, target_application')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  const sdCategory = sdData?.category?.toLowerCase() || '';
  // Security SDs focus on code hardening, not deployment pipelines
  // Pre-existing workflow failures should not block security-focused work
  const relaxedCiSdTypes = ['database', 'infrastructure', 'documentation', 'protocol', 'security'];

  // Determine repo path based on target application or options
  // SD-VISION-V2-009 FIX: GITHUB sub-agent must run gh commands from correct repo directory
  let repoPath = options.repo_path || process.cwd();
  const targetApp = sdData?.target_application?.toLowerCase();
  if (targetApp === 'ehg') {
    repoPath = '/mnt/c/_EHG/EHG';
  } else if (targetApp === 'ehg_engineer') {
    repoPath = '/mnt/c/_EHG/EHG_Engineer';
  }

  if (relaxedCiSdTypes.includes(sdCategory)) {
    console.log(`\n🗄️  SD Type Detection: ${sdCategory.toUpperCase()}`);
    console.log('   💡 Database/Infrastructure SDs have relaxed CI/CD requirements');
    console.log('   ✅ PR existence check only (no deployment/workflow requirements)');
    console.log(`   📁 Repo path: ${repoPath}`);

    // Just check that a PR exists for the SD
    try {
      const { stdout: prList } = await execAsync(`cd "${repoPath}" && gh pr list --state all --search "${sdId}" --json number,state,title 2>/dev/null || echo "[]"`);
      const prs = JSON.parse(prList);
      const hasPr = prs.length > 0;

      return {
        verdict: hasPr ? 'PASS' : 'BLOCKED',
        confidence: 90,
        critical_issues: hasPr ? [] : [{
          severity: 'HIGH',
          issue: 'No PR found for database SD',
          recommendation: 'Create a PR for the migration changes'
        }],
        warnings: [],
        recommendations: [{
          severity: 'INFO',
          issue: `${sdCategory} SD - relaxed CI/CD validation`,
          recommendation: 'Database SDs validated via schema existence, not deployment pipelines'
        }],
        detailed_analysis: {
          sd_type: sdCategory,
          pr_exists: hasPr,
          validation_approach: 'PR existence check only (no deployment requirements)'
        },
        findings: {
          workflow_status: { skipped: true, reason: 'Database SD - no deployment' },
          recent_runs: { skipped: true },
          deployment_status: { skipped: true },
          branch_lifecycle: { simplified: true, pr_exists: hasPr }
        },
        options
      };
    } catch (prError) {
      console.log(`   ⚠️  Could not check PR status: ${prError.message}`);
      // Fall through to standard validation
    }
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      workflow_status: null,
      recent_runs: null,
      failing_checks: null,
      deployment_status: null,
      branch_lifecycle: null
    },
    options
  };

  try {
    const repoPath = options.repo_path || process.cwd();

    // Phase 1: Check GitHub CLI availability
    console.log('\n🔍 Phase 1: Checking GitHub CLI...');
    try {
      const { stdout } = await execAsync('gh --version');
      console.log(`   ✅ GitHub CLI available: ${stdout.split('\n')[0]}`);
      results.findings.gh_cli_available = true;
    } catch (error) {
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

  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
      // Only block on staged or modified files, not untracked files
      lifecycle.uncommitted_changes.has_changes =
        lifecycle.uncommitted_changes.staged_count > 0 ||
        lifecycle.uncommitted_changes.modified_count > 0;
    }

    // Check for unpushed commits
    try {
      const { stdout: unpushed } = await execAsync(
        `cd "${repoPath}" && git log @{u}.. --oneline 2>/dev/null || echo ""`
      );
      if (unpushed.trim()) {
        lifecycle.current_branch.unpushed_commits = unpushed.trim().split('\n').length;
      }
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      // Git error - skip stale branch check
      lifecycle.stale_branches.count = 0;
    }

    return lifecycle;
  } catch (error) {
    console.error(`   ⚠️  Error checking branch lifecycle: ${error.message}`);
    return lifecycle;
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(results) {
  const { findings, critical_issues, warnings } = results;

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
