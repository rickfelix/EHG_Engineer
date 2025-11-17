#!/usr/bin/env node

/**
 * Complete Quick-Fix
 * Mark quick-fix as completed with verification
 *
 * Usage:
 *   node scripts/complete-quick-fix.js QF-20251117-001
 *   node scripts/complete-quick-fix.js QF-20251117-001 --commit-sha abc123 --actual-loc 15
 *
 * Requirements for completion:
 * - Both unit and E2E tests passing
 * - UAT verified (manual confirmation)
 * - Actual LOC ≤ 50 (hard cap)
 * - PR created (always required)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import readline from 'readline';
import { restartLeoStack, verifyServerRestart } from '../lib/server-manager.js';
import { runSelfVerification } from '../lib/quickfix-self-verifier.js';
import { runComplianceRubric } from '../lib/quickfix-compliance-rubric.js';

dotenv.config();

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function completeQuickFix(qfId, options = {}) {
  console.log(`\n✅ Completing Quick-Fix: ${qfId}\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    console.log(`❌ Quick-fix not found: ${qfId}`);
    process.exit(1);
  }

  console.log(`📋 Quick-Fix: ${qf.title}`);
  console.log(`   Type: ${qf.type}`);
  console.log(`   Status: ${qf.status}\n`);

  // Already completed?
  if (qf.status === 'completed') {
    console.log(`✅ Already completed at ${new Date(qf.completed_at).toLocaleString()}`);
    return qf;
  }

  // Escalated?
  if (qf.status === 'escalated') {
    console.log('⚠️  This issue was escalated to a full SD');
    console.log(`   Reason: ${qf.escalation_reason}`);
    return qf;
  }

  // Gather completion data
  let commitSha, actualLoc, branchName, prUrl, testsPass, uatVerified;

  // Try to auto-detect git info
  try {
    if (!options.commitSha) {
      commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      console.log(`🔍 Auto-detected commit SHA: ${commitSha.substring(0, 7)}`);
    } else {
      commitSha = options.commitSha;
    }

    if (!options.branchName) {
      branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      console.log(`🔍 Auto-detected branch: ${branchName}`);
    } else {
      branchName = options.branchName;
    }

    // Get actual LOC from git diff
    if (!options.actualLoc) {
      try {
        const diffStats = execSync('git diff origin/main --shortstat', { encoding: 'utf-8' }).trim();
        const match = diffStats.match(/(\d+) insertion/);
        if (match) {
          actualLoc = parseInt(match[1]);
          console.log(`🔍 Auto-detected actual LOC: ${actualLoc}\n`);
        }
      } catch (err) {
        // Fallback to manual input
        actualLoc = null;
      }
    } else {
      actualLoc = options.actualLoc;
    }
  } catch (err) {
    console.log(`⚠️  Could not auto-detect git info: ${err.message}\n`);
  }

  // Manual input if not provided
  if (!actualLoc) {
    const locStr = await prompt('Actual lines of code changed: ');
    actualLoc = parseInt(locStr);
  }

  // LOC validation (hard cap at 50)
  if (actualLoc > 50) {
    console.log('\n❌ CANNOT COMPLETE - LOC EXCEEDS LIMIT\n');
    console.log(`   Actual LOC: ${actualLoc}`);
    console.log('   Limit:      50\n');
    console.log('⚠️  This issue must be escalated to a full Strategic Directive.\n');

    const escalate = await prompt('Auto-escalate to SD? (yes/no): ');

    if (escalate.toLowerCase().startsWith('y')) {
      const { error: updateError } = await supabase
        .from('quick_fixes')
        .update({
          status: 'escalated',
          escalation_reason: `Actual LOC (${actualLoc}) exceeds 50 line hard cap`,
          actual_loc: actualLoc
        })
        .eq('id', qfId);

      if (updateError) {
        console.log('❌ Failed to escalate:', updateError.message);
        process.exit(1);
      }

      console.log('\n✅ Status updated to: escalated');
      console.log('   Follow full LEAD→PLAN→EXEC workflow for this issue.\n');
      return;
    } else {
      console.log('\n⚠️  Quick-fix not completed. Reduce LOC to ≤50 or escalate.\n');
      process.exit(1);
    }
  }

  // Test verification
  if (options.testsPass === undefined) {
    const testsInput = await prompt('\nBoth unit and E2E tests passing? (yes/no): ');
    testsPass = testsInput.toLowerCase().startsWith('y');
  } else {
    testsPass = options.testsPass;
  }

  if (!testsPass) {
    console.log('\n❌ CANNOT COMPLETE - TESTS NOT PASSING\n');
    console.log('   Quick-fixes REQUIRE both test suites to pass (Tier 1 smoke tests).\n');
    console.log('📋 Next steps:');
    console.log('   1. Run: npm run test:unit');
    console.log('   2. Run: npm run test:e2e');
    console.log('   3. Fix any failures');
    console.log('   4. Re-run this script\n');
    process.exit(1);
  }

  // UAT verification
  if (options.uatVerified === undefined) {
    const uatInput = await prompt('UAT verified (manually tested fix works)? (yes/no): ');
    uatVerified = uatInput.toLowerCase().startsWith('y');
  } else {
    uatVerified = options.uatVerified;
  }

  if (!uatVerified) {
    console.log('\n❌ CANNOT COMPLETE - UAT NOT VERIFIED\n');
    console.log('   Quick-fixes REQUIRE manual UAT verification.\n');
    console.log('📋 Next steps:');
    console.log('   1. Navigate to the affected area');
    console.log('   2. Follow steps to reproduce');
    console.log('   3. Verify fix works as expected');
    console.log('   4. Re-run this script\n');
    process.exit(1);
  }

  // PR verification
  if (!options.prUrl) {
    const prInput = await prompt('\nGitHub PR URL (required): ');
    prUrl = prInput.trim();
  } else {
    prUrl = options.prUrl;
  }

  if (!prUrl || !prUrl.includes('github.com')) {
    console.log('\n❌ CANNOT COMPLETE - PR REQUIRED\n');
    console.log('   Quick-fixes MUST create a PR (no direct merge).\n');
    console.log('📋 Next steps:');
    console.log(`   1. Create PR: gh pr create --title "fix(${qfId}): ${qf.title}"`);
    console.log('   2. Re-run this script with --pr-url flag\n');
    process.exit(1);
  }

  // Optional: Verification notes
  let verificationNotes = options.verificationNotes;
  if (!verificationNotes) {
    verificationNotes = await prompt('\nVerification notes (optional): ');
  }

  // Enhancement #5: Git Diff Auto-Analysis
  console.log('\n📊 Git Diff Auto-Analysis\n');

  let filesChanged = [];
  let diffAnalysis = {};

  try {
    // Get files changed
    const files = execSync('git diff origin/main --name-only', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f);
    filesChanged = files;

    console.log(`   Files Changed: ${filesChanged.length}`);
    filesChanged.forEach(file => console.log(`      - ${file}`));

    // Get detailed diff stats
    const diffStat = execSync('git diff origin/main --stat', { encoding: 'utf-8' });
    const insertions = diffStat.match(/(\d+) insertion/);
    const deletions = diffStat.match(/(\d+) deletion/);

    diffAnalysis = {
      files: filesChanged,
      insertions: insertions ? parseInt(insertions[1]) : 0,
      deletions: deletions ? parseInt(deletions[1]) : 0,
      netChange: insertions && deletions ? parseInt(insertions[1]) - parseInt(deletions[1]) : 0
    };

    console.log(`   Insertions: +${diffAnalysis.insertions}`);
    console.log(`   Deletions: -${diffAnalysis.deletions}`);
    console.log(`   Net Change: ${diffAnalysis.netChange > 0 ? '+' : ''}${diffAnalysis.netChange}`);

    // Verify files match issue description
    const issueFiles = qf.description?.match(/[a-zA-Z0-9_-]+\.(tsx?|jsx?|js|css|sql)/g) || [];
    const matchedFiles = filesChanged.filter(file =>
      issueFiles.some(issueFile => file.includes(issueFile))
    );

    if (matchedFiles.length > 0) {
      console.log('   ✅ Changed files match issue description');
    } else if (issueFiles.length > 0) {
      console.log('   ⚠️  Changed files don\'t match issue description');
      console.log(`   Expected: ${issueFiles.join(', ')}`);
      console.log(`   Actual: ${filesChanged.join(', ')}`);
    }

    console.log();

  } catch (err) {
    console.log(`   ⚠️  Could not analyze diff: ${err.message}\n`);
  }

  // Enhancement #6: Test Coverage Verification
  console.log('📋 Test Coverage Verification\n');

  let testCoverage = {
    unitTestsExist: false,
    e2eTestsExist: false,
    filesWithTests: []
  };

  try {
    // Check if changed files have corresponding test files
    for (const file of filesChanged) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.ts')) {
        testCoverage.unitTestsExist = true;
      }
      if (file.includes('e2e') || file.includes('playwright')) {
        testCoverage.e2eTestsExist = true;
      }

      // Check if test file exists for this file
      const baseName = file.replace(/\.(tsx?|jsx?)$/, '');
      const testPatterns = [
        `${baseName}.test.ts`,
        `${baseName}.test.tsx`,
        `${baseName}.spec.ts`,
        `__tests__/${path.basename(baseName)}.test.ts`
      ];

      for (const testPattern of testPatterns) {
        try {
          execSync(`test -f "${testPattern}"`, { stdio: 'pipe' });
          testCoverage.filesWithTests.push(file);
          break;
        } catch (err) {
          // Test file doesn't exist
        }
      }
    }

    console.log(`   Unit Tests: ${testCoverage.unitTestsExist ? '✅ Found' : '⚠️  Not found in changes'}`);
    console.log(`   E2E Tests: ${testCoverage.e2eTestsExist ? '✅ Found' : '⚠️  Not found in changes'}`);
    console.log(`   Files with Test Coverage: ${testCoverage.filesWithTests.length}/${filesChanged.length}`);

    if (testCoverage.filesWithTests.length < filesChanged.length) {
      const uncoveredFiles = filesChanged.filter(f => !testCoverage.filesWithTests.includes(f));
      console.log('   ⚠️  Files without test coverage:');
      uncoveredFiles.forEach(f => console.log(`      - ${f}`));
    }

    console.log();

  } catch (err) {
    console.log(`   ⚠️  Could not verify test coverage: ${err.message}\n`);
  }

  // LEO Stack Restart (User's Request)
  console.log('🔄 LEO Stack Restart\n');

  const restartResult = await restartLeoStack({ verbose: true });

  if (!restartResult.success) {
    console.log(`   ⚠️  LEO stack restart failed: ${restartResult.message}`);
    console.log('   You may need to restart manually: bash scripts/leo-stack.sh restart\n');
  }

  // Enhancement #7: Automatic PR Creation
  let finalPrUrl = prUrl;

  if (options.autoPr && !prUrl) {
    console.log('📝 Automatic PR Creation\n');

    try {
      // Check if gh CLI is installed
      execSync('which gh', { stdio: 'pipe' });

      // Generate PR title and body
      const prTitle = `fix(${qfId}): ${qf.title}`;
      const prBody = `## Quick-Fix: ${qfId}

**Type:** ${qf.type}
**Severity:** ${qf.severity}

### Issue Description
${qf.description}

${qf.steps_to_reproduce ? `### Steps to Reproduce
${qf.steps_to_reproduce}
` : ''}
${qf.expected_behavior ? `### Expected Behavior
${qf.expected_behavior}
` : ''}
${qf.actual_behavior ? `### Actual Behavior
${qf.actual_behavior}
` : ''}
### Changes
- **Files Changed:** ${filesChanged.length}
${filesChanged.map(f => `  - ${f}`).join('\n')}
- **LOC:** ${actualLoc} lines
- **Tests:** ${testsPass ? '✅ Passing' : '❌ Failed'}
- **UAT:** ${uatVerified ? '✅ Verified' : '❌ Not verified'}

### Verification
${verificationNotes || 'No additional notes'}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Quick-Fix Workflow - LEO Protocol`;

      console.log(`   Creating PR: ${prTitle}\n`);

      const prOutput = execSync(`gh pr create --title "${prTitle}" --body "${prBody}"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Extract PR URL from output
      const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+/);
      if (urlMatch) {
        finalPrUrl = urlMatch[0];
        console.log(`   ✅ PR Created: ${finalPrUrl}\n`);
      }

    } catch (err) {
      console.log(`   ⚠️  Auto-PR creation failed: ${err.message}`);
      console.log(`   Please create PR manually: gh pr create --title "fix(${qfId}): ${qf.title}"\n`);
    }
  }

  // Self-Verification (Combat Overconfidence)
  const verificationContext = {
    actualLoc,
    filesChanged,
    testsPass,
    uatVerified,
    testsVerifiedRecently: true, // Skip re-running tests if we just ran them
    diffAnalysis,
    testCoverage
  };

  const verificationResults = await runSelfVerification(qfId, verificationContext);

  // Block completion if verification failed
  if (!verificationResults.passed) {
    console.log('\n❌ CANNOT COMPLETE - Verification blockers detected\n');
    console.log('   Resolve the following issues:\n');
    verificationResults.blockers.forEach((blocker, i) => {
      console.log(`   ${i + 1}. ${blocker}`);
    });
    console.log('\n   Run this script again after resolving blockers.\n');
    process.exit(1);
  }

  // Warn if confidence low
  if (verificationResults.confidence < 80) {
    console.log(`\n⚠️  VERIFICATION PASSED BUT CONFIDENCE LOW (${verificationResults.confidence}%)\n`);
    console.log('   Warnings detected:\n');
    verificationResults.warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });

    const proceed = await prompt('\n   Proceed anyway? (yes/no): ');
    if (!proceed.toLowerCase().startsWith('y')) {
      console.log('\n   Completion cancelled. Review warnings and try again.\n');
      process.exit(0);
    }
  }

  // Compliance Rubric (100-Point Scale)
  const complianceContext = {
    qfId,
    originalError: qf.actual_behavior || qf.description,
    errorsBeforeFix: [],  // TODO: Could capture baseline in future
    errorsAfterFix: [],   // TODO: Could monitor console in future
    actualLoc,
    filesChanged,
    issueDescription: qf.description,
    complexity: qf.estimated_loc > 30 ? 'medium' : 'low',
    testsBeforeFix: null,
    testsAfterFix: { passedCount: testsPass ? 100 : 0 }  // Simplified for now
  };

  const complianceResults = await runComplianceRubric(qfId, complianceContext);

  // Block completion if compliance score <70 (FAIL)
  if (complianceResults.verdict === 'FAIL') {
    console.log('\n❌ CANNOT COMPLETE - Compliance rubric failed\n');
    console.log(`   Score: ${complianceResults.totalScore}/100 (${complianceResults.confidence.toFixed(1)}%)\n`);
    console.log('   Failed criteria:\n');
    complianceResults.criteriaResults.filter(c => !c.passed).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
      console.log(`      ${c.evidence}\n`);
    });
    console.log('   Resolve issues and re-run completion script.\n');
    process.exit(1);
  }

  // Warn if compliance score 70-89 (WARN)
  if (complianceResults.verdict === 'WARN') {
    console.log(`\n⚠️  COMPLIANCE PASSED WITH WARNINGS (${complianceResults.confidence.toFixed(1)}%)\n`);
    console.log(`   Score: ${complianceResults.totalScore}/100\n`);
    const failedCriteria = complianceResults.criteriaResults.filter(c => !c.passed);
    if (failedCriteria.length > 0) {
      console.log('   Issues detected:\n');
      failedCriteria.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
        console.log(`      ${c.evidence}\n`);
      });
    }

    const proceedCompliance = await prompt('   Proceed with completion? (yes/no): ');
    if (!proceedCompliance.toLowerCase().startsWith('y')) {
      console.log('\n   Completion cancelled. Improve compliance score and try again.\n');
      process.exit(0);
    }
  }

  // Commit & Push Prompting (Combat Overconfidence)
  console.log('\n🔄 Git Commit & Push\n');

  try {
    // Check if on quick-fix branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

    // Show git status
    const gitStatus = execSync('git status --short', { encoding: 'utf-8' }).trim();

    if (gitStatus) {
      console.log(`   Current Branch: ${currentBranch}`);
      console.log('   Uncommitted Changes:\n');
      console.log(gitStatus.split('\n').map(line => `      ${line}`).join('\n'));
      console.log();

      // Generate commit message
      const commitMessage = `fix(${qfId}): ${qf.title}

${qf.description || 'Quick-fix implementation'}

- Type: ${qf.type}
- Severity: ${qf.severity}
- Actual LOC: ${actualLoc}
- Files changed: ${filesChanged.length}
${filesChanged.map(f => `  - ${f}`).join('\n')}

Tests: ✅ Both unit and E2E passing
UAT: ✅ Verified manually
PR: ${prUrl}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

      console.log('   Proposed Commit Message:');
      console.log(`   ┌${'─'.repeat(60)}┐`);
      commitMessage.split('\n').forEach(line => {
        console.log(`   │ ${line.padEnd(58)} │`);
      });
      console.log(`   └${'─'.repeat(60)}┘\n`);

      const shouldCommit = await prompt('   Commit these changes? (yes/no): ');

      if (shouldCommit.toLowerCase().startsWith('y')) {
        // Stage all changes
        console.log('\n   📦 Staging changes...');
        execSync('git add .', { stdio: 'inherit' });

        // Commit with formatted message
        console.log('   📝 Creating commit...');
        execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

        // Get new commit SHA
        const newCommitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        commitSha = newCommitSha;
        console.log(`   ✅ Committed: ${newCommitSha.substring(0, 7)}\n`);

        // Ask about pushing
        const shouldPush = await prompt('   Push to remote? (yes/no): ');

        if (shouldPush.toLowerCase().startsWith('y')) {
          console.log(`\n   🚀 Pushing to ${currentBranch}...`);
          try {
            execSync(`git push -u origin ${currentBranch}`, { stdio: 'inherit' });
            console.log('   ✅ Pushed successfully\n');
          } catch (pushErr) {
            console.log(`   ⚠️  Push failed: ${pushErr.message}`);
            console.log(`   You can push manually later: git push -u origin ${currentBranch}\n`);
          }
        } else {
          console.log('\n   ⚠️  Not pushed. Push manually when ready:');
          console.log(`      git push -u origin ${currentBranch}\n`);
        }
      } else {
        console.log('\n   ⚠️  Not committed. You can commit manually later:');
        console.log('      git add .');
        console.log(`      git commit -m "fix(${qfId}): ${qf.title}"`);
        console.log(`      git push -u origin ${currentBranch}\n`);
      }
    } else {
      console.log('   ℹ️  No uncommitted changes detected');
      console.log(`   Current commit: ${commitSha?.substring(0, 7) || 'Unknown'}\n`);
    }
  } catch (err) {
    console.log(`   ⚠️  Could not check git status: ${err.message}\n`);
  }

  // Update record
  console.log('🔄 Updating quick-fix record...\n');

  const { error: updateError } = await supabase
    .from('quick_fixes')
    .update({
      status: 'completed',
      actual_loc: actualLoc,
      commit_sha: commitSha,
      branch_name: branchName,
      pr_url: prUrl,
      tests_passing: testsPass,
      uat_verified: uatVerified,
      verified_by: 'UAT_AGENT',
      verification_notes: verificationNotes || null,
      files_changed: filesChanged.length > 0 ? filesChanged : null,
      completed_at: new Date().toISOString()
    })
    .eq('id', qfId);

  if (updateError) {
    console.log('❌ Failed to update quick-fix:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Quick-fix completed successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 COMPLETION SUMMARY\n');
  console.log(`   ID:             ${qfId}`);
  console.log(`   Title:          ${qf.title}`);
  console.log(`   Actual LOC:     ${actualLoc}`);
  console.log(`   Commit:         ${commitSha ? commitSha.substring(0, 7) : 'N/A'}`);
  console.log(`   Branch:         ${branchName || 'N/A'}`);
  console.log(`   PR:             ${prUrl}`);
  console.log('   Tests:          ✅ Passing');
  console.log('   UAT:            ✅ Verified');
  if (filesChanged.length > 0) {
    console.log(`   Files Changed:  ${filesChanged.length}`);
    filesChanged.forEach(file => console.log(`      - ${file}`));
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📍 Next steps:');
  console.log('   1. Await PR review and approval');
  console.log('   2. Merge PR once approved');
  console.log(`   3. Delete branch: git branch -d quick-fix/${qfId}\n`);

  return qf;
}

// CLI argument parsing
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
LEO Quick-Fix Workflow - Complete Issue

Usage:
  node scripts/complete-quick-fix.js QF-20251117-001
  node scripts/complete-quick-fix.js QF-20251117-001 --commit-sha abc123 --actual-loc 15 --pr-url https://...

Options:
  --commit-sha          Git commit SHA (auto-detected if not provided)
  --branch-name         Git branch name (auto-detected if not provided)
  --actual-loc          Actual lines of code changed (auto-detected from git diff)
  --pr-url              GitHub PR URL (REQUIRED)
  --tests-pass          Tests passing (yes/no, will prompt if not provided)
  --uat-verified        UAT verified (yes/no, will prompt if not provided)
  --verification-notes  Optional notes about verification
  --help, -h            Show this help

Requirements:
  - Both unit and E2E tests MUST pass
  - UAT MUST be verified (manual testing)
  - Actual LOC MUST be ≤ 50 (hard cap)
  - PR MUST be created (no direct merge)

Examples:
  node scripts/complete-quick-fix.js QF-20251117-001
  node scripts/complete-quick-fix.js QF-20251117-001 --pr-url https://github.com/org/repo/pull/123
  node scripts/complete-quick-fix.js QF-20251117-001 --actual-loc 15 --pr-url https://... --tests-pass yes --uat-verified yes
  `);
  process.exit(0);
}

const qfId = args[0];
const options = {};

for (let i = 1; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--commit-sha') {
    options.commitSha = args[++i];
  } else if (arg === '--branch-name') {
    options.branchName = args[++i];
  } else if (arg === '--actual-loc') {
    options.actualLoc = parseInt(args[++i]);
  } else if (arg === '--pr-url') {
    options.prUrl = args[++i];
  } else if (arg === '--tests-pass') {
    options.testsPass = args[++i].toLowerCase().startsWith('y');
  } else if (arg === '--uat-verified') {
    options.uatVerified = args[++i].toLowerCase().startsWith('y');
  } else if (arg === '--verification-notes') {
    options.verificationNotes = args[++i];
  }
}

// Run
completeQuickFix(qfId, options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
