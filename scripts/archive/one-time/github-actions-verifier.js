#!/usr/bin/env node

/**
 * GitHub Actions Verifier Sub-Agent (DevOps Platform Architect)
 *
 * Purpose: Verify CI/CD pipeline status after EXEC implementation
 * Priority: CRITICAL (90)
 * Phase: PLAN_VERIFY
 *
 * Critical Gap Identified: SD-SUBAGENT-IMPROVE-001 and prior SDs never verified GitHub Actions
 *
 * Workflow:
 *   1. Check if SD has recent commits (via git log)
 *   2. Query GitHub Actions for recent workflow runs (via gh CLI)
 *   3. Verify all pipelines are green (not failed/cancelled)
 *   4. Check deployment status (if applicable)
 *   5. Return verdict: PASS/FAIL/BLOCKED
 *
 * Usage:
 *   node scripts/github-actions-verifier.js <SD-ID>
 *
 * Requirements:
 *   - gh CLI installed and authenticated
 *   - Git repository with remote configured
 *   - Recent commits pushed to GitHub
 *
 * Example:
 *   node scripts/github-actions-verifier.js SD-TEST-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

/**
 * Execute shell command and return output
 */
async function runCommand(command, description) {
  console.log(`\n🔍 ${description}...`);
  console.log(`   Command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('warning')) {
      console.log(`   ⚠️  stderr: ${stderr.substring(0, 200)}`);
    }

    return { success: true, output: stdout, error: null };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return { success: false, output: null, error: error.message };
  }
}

/**
 * Check if gh CLI is installed
 */
async function checkGHCLI() {
  const result = await runCommand('gh --version', 'Checking gh CLI installation');

  if (!result.success) {
    return {
      installed: false,
      message: 'gh CLI not installed. Install from: https://cli.github.com/'
    };
  }

  return {
    installed: true,
    version: result.output.split('\n')[0]
  };
}

/**
 * Get recent commits related to SD
 */
async function getRecentCommits(sdId) {
  const command = `git log --oneline --grep="${sdId}" --since="7 days ago" | head -10`;
  const result = await runCommand(command, `Searching for commits related to ${sdId}`);

  if (!result.success || !result.output.trim()) {
    return {
      found: false,
      commits: [],
      message: `No commits found for ${sdId} in last 7 days`
    };
  }

  const commits = result.output.trim().split('\n').map(line => {
    const [hash, ...messageParts] = line.split(' ');
    return { hash, message: messageParts.join(' ') };
  });

  console.log(`   ✅ Found ${commits.length} commit(s):`);
  commits.forEach(c => console.log(`      - ${c.hash}: ${c.message.substring(0, 60)}`));

  return {
    found: true,
    commits,
    message: `Found ${commits.length} commits`
  };
}

/**
 * Query GitHub Actions workflow runs
 */
async function getWorkflowRuns(limit = 5) {
  const command = `gh run list --limit ${limit} --json conclusion,status,name,createdAt,url`;
  const result = await runCommand(command, 'Querying GitHub Actions workflow runs');

  if (!result.success) {
    return {
      success: false,
      runs: [],
      message: result.error
    };
  }

  try {
    const runs = JSON.parse(result.output);

    console.log(`   ✅ Found ${runs.length} recent workflow run(s):`);
    runs.forEach(run => {
      const statusIcon = run.conclusion === 'success' ? '✅' :
                        run.conclusion === 'failure' ? '❌' :
                        run.status === 'in_progress' ? '⏳' : '⚠️';
      console.log(`      ${statusIcon} ${run.name}: ${run.conclusion || run.status}`);
      console.log(`         Created: ${new Date(run.createdAt).toLocaleString()}`);
      console.log(`         URL: ${run.url}`);
    });

    return {
      success: true,
      runs,
      message: `Retrieved ${runs.length} workflow runs`
    };
  } catch (error) {
    return {
      success: false,
      runs: [],
      message: `Failed to parse workflow runs: ${error.message}`
    };
  }
}

/**
 * Analyze workflow runs for failures
 */
function analyzeWorkflowRuns(runs) {
  const failed = runs.filter(r => r.conclusion === 'failure');
  const cancelled = runs.filter(r => r.conclusion === 'cancelled');
  const inProgress = runs.filter(r => r.status === 'in_progress');
  const success = runs.filter(r => r.conclusion === 'success');

  const hasFailures = failed.length > 0;
  const hasCancelled = cancelled.length > 0;
  const allSuccess = success.length === runs.length && runs.length > 0;

  let verdict, confidence, message;
  const critical_issues = [];
  const warnings = [];
  const recommendations = [];

  if (hasFailures) {
    verdict = 'FAIL';
    confidence = 0;
    message = `${failed.length} workflow run(s) failed`;
    critical_issues.push(
      ...failed.map(r => ({
        workflow: r.name,
        conclusion: r.conclusion,
        url: r.url,
        created_at: r.createdAt
      }))
    );
    recommendations.push('Fix failing CI/CD pipelines before marking SD complete');
    recommendations.push('Review workflow logs: gh run view [run-id]');
  } else if (hasCancelled) {
    verdict = 'WARNING';
    confidence = 50;
    message = `${cancelled.length} workflow run(s) cancelled (may indicate issues)`;
    warnings.push(
      ...cancelled.map(r => ({
        workflow: r.name,
        conclusion: r.conclusion,
        url: r.url
      }))
    );
    recommendations.push('Investigate why workflows were cancelled');
  } else if (inProgress.length > 0) {
    verdict = 'WARNING';
    confidence = 70;
    message = `${inProgress.length} workflow run(s) still in progress`;
    warnings.push({
      message: 'Wait for workflows to complete before final approval',
      in_progress_count: inProgress.length
    });
    recommendations.push('Wait 2-3 minutes for workflows to complete, then re-run verification');
  } else if (allSuccess) {
    verdict = 'PASS';
    confidence = 100;
    message = `All ${runs.length} workflow runs successful`;
  } else if (runs.length === 0) {
    verdict = 'WARNING';
    confidence = 50;
    message = 'No recent workflow runs found';
    warnings.push('No CI/CD activity detected - commits may not have been pushed');
    recommendations.push('Verify commits are pushed: git push origin [branch]');
  } else {
    verdict = 'WARNING';
    confidence = 60;
    message = 'Mixed workflow results';
  }

  return {
    verdict,
    confidence,
    message,
    critical_issues,
    warnings,
    recommendations,
    analysis: {
      total_runs: runs.length,
      success: success.length,
      failed: failed.length,
      cancelled: cancelled.length,
      in_progress: inProgress.length
    }
  };
}

/**
 * Main verification function
 */
async function verify(sdId) {
  console.log('\n🤖 GITHUB ACTIONS VERIFIER (DevOps Platform Architect)');
  console.log('═'.repeat(60));
  console.log(`SD: ${sdId}`);
  console.log('Priority: CRITICAL (90)');
  console.log('Phase: PLAN_VERIFY');
  console.log('');

  const startTime = Date.now();
  const results = {
    sub_agent_code: 'GITHUB',
    sub_agent_name: 'DevOps Platform Architect',
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: '',
    execution_time: 0,
    metadata: {}
  };

  try {
    // Step 1: Check gh CLI
    console.log('📋 Step 1: Prerequisites');
    const ghCheck = await checkGHCLI();

    if (!ghCheck.installed) {
      results.verdict = 'BLOCKED';
      results.confidence = 0;
      results.critical_issues.push({
        issue: 'gh CLI not installed',
        message: ghCheck.message
      });
      results.detailed_analysis = `Cannot verify GitHub Actions without gh CLI. ${ghCheck.message}`;
      results.execution_time = Math.floor((Date.now() - startTime) / 1000);
      return results;
    }

    console.log(`   ✅ gh CLI installed: ${ghCheck.version}`);

    // Step 2: Get recent commits
    console.log('\n📋 Step 2: Commit History');
    const commits = await getRecentCommits(sdId);
    results.metadata.commits = commits;

    if (!commits.found) {
      results.warnings.push({
        warning: 'No commits found',
        message: commits.message
      });
      results.recommendations.push('Verify SD ID is correct and commits include SD ID in message');
    }

    // Step 3: Query workflow runs
    console.log('\n📋 Step 3: GitHub Actions Workflow Runs');
    const workflowRuns = await getWorkflowRuns(5);
    results.metadata.workflow_runs = workflowRuns;

    if (!workflowRuns.success) {
      results.verdict = 'BLOCKED';
      results.confidence = 0;
      results.critical_issues.push({
        issue: 'Failed to query GitHub Actions',
        message: workflowRuns.message
      });
      results.detailed_analysis = `Cannot query GitHub Actions: ${workflowRuns.message}. Verify gh CLI is authenticated: gh auth status`;
      results.execution_time = Math.floor((Date.now() - startTime) / 1000);
      return results;
    }

    // Step 4: Analyze workflow runs
    console.log('\n📋 Step 4: Analyzing Workflow Results');
    const analysis = analyzeWorkflowRuns(workflowRuns.runs);

    results.verdict = analysis.verdict;
    results.confidence = analysis.confidence;
    results.critical_issues = analysis.critical_issues;
    results.warnings = analysis.warnings;
    results.recommendations = analysis.recommendations;
    results.metadata.analysis = analysis.analysis;

    // Step 5: Generate detailed analysis
    results.detailed_analysis = `
GitHub Actions Verification for ${sdId}

Commits: ${commits.found ? `${commits.commits.length} found` : 'None found'}
Workflow Runs: ${workflowRuns.runs.length} recent runs

Analysis:
- Total runs: ${analysis.analysis.total_runs}
- Success: ${analysis.analysis.success}
- Failed: ${analysis.analysis.failed}
- Cancelled: ${analysis.analysis.cancelled}
- In Progress: ${analysis.analysis.in_progress}

Verdict: ${analysis.verdict}
Confidence: ${analysis.confidence}%
Message: ${analysis.message}

${analysis.critical_issues.length > 0 ? `\nCritical Issues:\n${analysis.critical_issues.map(i => `- ${i.workflow}: ${i.conclusion}`).join('\n')}` : ''}
${analysis.warnings.length > 0 ? `\nWarnings:\n${analysis.warnings.map(w => `- ${w.message || w.workflow}`).join('\n')}` : ''}
${analysis.recommendations.length > 0 ? `\nRecommendations:\n${analysis.recommendations.map(r => `- ${r}`).join('\n')}` : ''}
    `.trim();

    results.execution_time = Math.floor((Date.now() - startTime) / 1000);

    // Display final verdict
    console.log('\n' + '═'.repeat(60));
    console.log('🎯 VERIFICATION RESULT');
    console.log('═'.repeat(60));
    console.log(`Verdict: ${results.verdict}`);
    console.log(`Confidence: ${results.confidence}%`);
    console.log(`Execution Time: ${results.execution_time}s`);
    console.log(`Message: ${analysis.message}`);

    if (results.critical_issues.length > 0) {
      console.log(`\n❌ Critical Issues: ${results.critical_issues.length}`);
    }
    if (results.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${results.warnings.length}`);
    }
    if (results.recommendations.length > 0) {
      console.log(`💡 Recommendations: ${results.recommendations.length}`);
    }

    console.log('═'.repeat(60));

    return results;

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    results.verdict = 'FAIL';
    results.confidence = 0;
    results.critical_issues.push({
      issue: 'Verification error',
      message: error.message,
      stack: error.stack
    });
    results.detailed_analysis = `GitHub Actions verification failed: ${error.message}`;
    results.execution_time = Math.floor((Date.now() - startTime) / 1000);
    return results;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node scripts/github-actions-verifier.js <SD-ID>');
    console.error('\nExample:');
    console.error('  node scripts/github-actions-verifier.js SD-TEST-001');
    process.exit(1);
  }

  const sdId = args[0];

  try {
    const result = await verify(sdId);

    // Print JSON result for programmatic consumption
    if (process.env.JSON_OUTPUT === 'true') {
      console.log('\n' + JSON.stringify(result, null, 2));
    }

    // Exit code: 0 if PASS, 1 if FAIL/BLOCKED
    process.exit(['PASS', 'CONDITIONAL_PASS', 'WARNING'].includes(result.verdict) ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for use in other scripts
export { verify };
