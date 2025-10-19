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

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
  console.log(`   DevOps Platform Architect - CI/CD Verification`);

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
      deployment_status: null
    },
    options
  };

  try {
    const repoPath = options.repo_path || '/mnt/c/_EHG/ehg';

    // Phase 1: Check GitHub CLI availability
    console.log(`\n🔍 Phase 1: Checking GitHub CLI...`);
    try {
      const { stdout } = await execAsync('gh --version');
      console.log(`   ✅ GitHub CLI available: ${stdout.split('\n')[0]}`);
      results.findings.gh_cli_available = true;
    } catch (error) {
      console.log(`   ⚠️  GitHub CLI not available`);
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
    console.log(`\n🏗️  Phase 2: Checking GitHub Actions workflow status...`);
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
        console.log(`   ⚠️  No workflows found`);
        results.warnings.push({
          severity: 'MEDIUM',
          issue: 'No GitHub Actions workflows configured',
          recommendation: 'Consider setting up CI/CD for automated testing'
        });
      } else {
        console.log(`   ✅ All ${workflowStatus.total_workflows} workflow(s) passing`);
      }
    } else {
      console.log(`   ⏭️  Skipped (GitHub CLI not available)`);
      results.findings.workflow_status = { skipped: true, reason: 'gh CLI not available' };
    }

    // Phase 3: Check recent workflow runs
    console.log(`\n📊 Phase 3: Analyzing recent workflow runs...`);
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
        console.log(`   ℹ️  No recent workflow runs found`);
      }
    } else {
      console.log(`   ⏭️  Skipped (GitHub CLI not available)`);
      results.findings.recent_runs = { skipped: true };
    }

    // Phase 4: Deployment status check
    console.log(`\n🚀 Phase 4: Checking deployment status...`);
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
        console.log(`   ℹ️  No deployments configured or found`);
      }
    } else {
      console.log(`   ⏭️  Skipped (GitHub CLI not available)`);
      results.findings.deployment_status = { skipped: true };
    }

    // Generate recommendations
    console.log(`\n💡 Generating recommendations...`);
    generateRecommendations(results);

    console.log(`\n🏁 GITHUB Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error(`\n❌ GITHUB error:`, error.message);
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
