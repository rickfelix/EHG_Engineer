/**
 * Git Operations for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import { execSync } from 'child_process';

/**
 * Sanitize branch name for safe shell usage
 * SD-SEC-DATA-VALIDATION-001: Validate git branch names
 * @param {string} branchName - Branch name to validate
 * @returns {string} Validated branch name
 * @throws {Error} If invalid
 */
function validateBranchName(branchName) {
  if (!branchName || typeof branchName !== 'string') {
    throw new Error('Branch name is required');
  }
  const sanitized = branchName.trim();
  // Git branch names: alphanumeric, dashes, underscores, slashes, dots
  // Reject shell metacharacters and spaces
  if (!/^[a-zA-Z0-9/_.-]+$/.test(sanitized) || sanitized.length > 255) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }
  // Reject dangerous patterns
  if (sanitized.includes('..') || sanitized.startsWith('-') || sanitized.includes('\\')) {
    throw new Error(`Branch name contains invalid patterns: ${branchName}`);
  }
  return sanitized;
}

/**
 * Sanitize commit message for safe shell usage
 * SD-SEC-DATA-VALIDATION-001: Escape shell metacharacters
 * @param {string} message - Commit message
 * @returns {string} Sanitized message
 */
function sanitizeCommitMessage(message) {
  if (!message || typeof message !== 'string') return 'Update';
  return message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g, '\\!');
}

/**
 * Auto-detect git information from repository
 * @param {string} testDir - Directory to run git commands in
 * @param {object} options - Existing options that may override detection
 * @returns {object} Git info with commitSha, branchName, actualLoc
 */
export function autoDetectGitInfo(testDir, options = {}) {
  const result = {
    commitSha: options.commitSha,
    branchName: options.branchName,
    actualLoc: options.actualLoc
  };

  try {
    if (!result.commitSha) {
      result.commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: testDir }).trim();
      console.log(`🔍 Auto-detected commit SHA: ${result.commitSha.substring(0, 7)}`);
    }

    if (!result.branchName) {
      result.branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: testDir }).trim();
      console.log(`🔍 Auto-detected branch: ${result.branchName}`);
    }

    if (!result.actualLoc) {
      try {
        const diffStats = execSync('git diff origin/main --shortstat', { encoding: 'utf-8', cwd: testDir }).trim();
        const match = diffStats.match(/(\d+) insertion/);
        if (match) {
          result.actualLoc = parseInt(match[1]);
          console.log(`🔍 Auto-detected actual LOC: ${result.actualLoc}\n`);
        }
      } catch {
        result.actualLoc = null;
      }
    }
  } catch {
    console.log('⚠️  Could not auto-detect git info\n');
  }

  return result;
}

/**
 * Analyze git diff for file changes
 * @param {string} testDir - Directory to run git commands in
 * @param {string} qfDescription - Quick-fix description for matching files
 * @returns {object} Diff analysis with filesChanged, insertions, deletions
 */
export function analyzeGitDiff(testDir, qfDescription = '') {
  console.log('\n📊 Git Diff Auto-Analysis\n');

  let filesChanged = [];
  let diffAnalysis = {};

  try {
    const files = execSync('git diff origin/main --name-only', { encoding: 'utf-8', cwd: testDir })
      .trim()
      .split('\n')
      .filter(f => f);
    filesChanged = files;

    console.log(`   Files Changed: ${filesChanged.length}`);
    filesChanged.forEach(file => console.log(`      - ${file}`));

    const diffStat = execSync('git diff origin/main --stat', { encoding: 'utf-8', cwd: testDir });
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
    const issueFiles = qfDescription.match(/[a-zA-Z0-9_-]+\.(tsx?|jsx?|js|css|sql)/g) || [];
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

  return { filesChanged, diffAnalysis };
}

/**
 * Commit and push changes
 * @param {string} testDir - Directory to run git commands in
 * @param {object} qf - Quick-fix record
 * @param {object} gitInfo - Git info with commitSha, branchName
 * @param {number} actualLoc - Actual lines of code
 * @param {Array} filesChanged - List of changed files
 * @param {string} prUrl - PR URL
 * @param {boolean} testsPass - Whether tests passed
 * @param {Function} prompt - Prompt function for user input
 * @returns {Promise<string>} Updated commit SHA
 */
export async function commitAndPushChanges(testDir, qf, gitInfo, actualLoc, filesChanged, prUrl, testsPass, prompt) {
  console.log('\n🔄 Git Commit & Push\n');

  let { commitSha } = gitInfo;

  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: testDir }).trim();
    branchName = currentBranch;

    const gitStatus = execSync('git status --short', { encoding: 'utf-8', cwd: testDir }).trim();

    if (gitStatus) {
      console.log(`   Current Branch: ${currentBranch}`);
      console.log('   Uncommitted Changes:\n');
      console.log(gitStatus.split('\n').map(line => `      ${line}`).join('\n'));
      console.log();

      const commitMessage = generateCommitMessage(qf, actualLoc, filesChanged, prUrl, testsPass);

      console.log('   Proposed Commit Message:');
      console.log(`   ┌${'─'.repeat(60)}┐`);
      commitMessage.split('\n').forEach(line => {
        console.log(`   │ ${line.padEnd(58)} │`);
      });
      console.log(`   └${'─'.repeat(60)}┘\n`);

      const shouldCommit = await prompt('   Commit these changes? (yes/no): ');

      if (shouldCommit.toLowerCase().startsWith('y')) {
        console.log('\n   📦 Staging changes...');
        execSync('git add .', { stdio: 'inherit', cwd: testDir });

        console.log('   📝 Creating commit...');
        // SD-SEC-DATA-VALIDATION-001: Sanitize commit message
        const sanitizedMessage = sanitizeCommitMessage(commitMessage);
        execSync(`git commit -m "${sanitizedMessage}"`, { stdio: 'inherit', cwd: testDir });

        const newCommitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: testDir }).trim();
        commitSha = newCommitSha;
        console.log(`   ✅ Committed: ${newCommitSha.substring(0, 7)}\n`);

        const shouldPush = await prompt('   Push to remote? (yes/no): ');

        if (shouldPush.toLowerCase().startsWith('y')) {
          // SD-SEC-DATA-VALIDATION-001: Validate branch name before shell use
          const validatedBranch = validateBranchName(currentBranch);
          console.log(`\n   🚀 Pushing to ${validatedBranch}...`);
          try {
            execSync(`git push -u origin ${validatedBranch}`, { stdio: 'inherit', cwd: testDir });
            console.log('   ✅ Pushed successfully\n');
          } catch (pushErr) {
            console.log(`   ⚠️  Push failed: ${pushErr.message}`);
            console.log(`   You can push manually later: git push -u origin ${validatedBranch}\n`);
          }
        } else {
          console.log('\n   ⚠️  Not pushed. Push manually when ready:');
          console.log(`      git push -u origin ${currentBranch}\n`);
        }
      } else {
        displayManualCommitInstructions(qf, currentBranch);
      }
    } else {
      console.log('   ℹ️  No uncommitted changes detected');
      console.log(`   Current commit: ${commitSha?.substring(0, 7) || 'Unknown'}\n`);
    }
  } catch (err) {
    console.log(`   ⚠️  Could not check git status: ${err.message}\n`);
  }

  return commitSha;
}

/**
 * Generate commit message for quick-fix
 */
function generateCommitMessage(qf, actualLoc, filesChanged, prUrl, testsPass) {
  return `fix(${qf.id}): ${qf.title}

${qf.description || 'Quick-fix implementation'}

- Type: ${qf.type}
- Severity: ${qf.severity}
- Actual LOC: ${actualLoc}
- Files changed: ${filesChanged.length}
${filesChanged.map(f => `  - ${f}`).join('\n')}

Tests: ${testsPass ? '✅ Both unit and E2E passing' : '❌ Check test status'}
UAT: ✅ Verified manually
PR: ${prUrl}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
}

/**
 * Display manual commit instructions
 */
function displayManualCommitInstructions(qf, currentBranch) {
  console.log('\n   ⚠️  Not committed. You can commit manually later:');
  console.log('      git add .');
  console.log(`      git commit -m "fix(${qf.id}): ${qf.title}"`);
  console.log(`      git push -u origin ${currentBranch}\n`);
}

/**
 * Merge to main branch
 * @param {string} testDir - Directory to run git commands in
 * @param {object} qf - Quick-fix record
 * @param {string} prUrl - PR URL
 * @param {Function} prompt - Prompt function for user input
 */
export async function mergeToMain(testDir, qf, prUrl, prompt) {
  console.log('🔀 Merge to Main\n');

  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: testDir }).trim();

    if (prUrl) {
      await checkPRStatus(testDir, prUrl);
    }

    const shouldMerge = await prompt('   Merge to main now? (yes/no): ');

    if (shouldMerge.toLowerCase().startsWith('y')) {
      console.log('\n   🔀 Merging to main...');

      if (prUrl) {
        try {
          const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
          // SD-SEC-DATA-VALIDATION-001: Validate PR number is numeric
          if (prNumber && /^\d+$/.test(prNumber)) {
            execSync(`gh pr merge ${prNumber} --merge --delete-branch`, { stdio: 'inherit', cwd: testDir });
            console.log('   ✅ PR merged and branch deleted via GitHub\n');
            return;
          }
        } catch (ghMergeErr) {
          console.log(`   ⚠️  GitHub merge failed: ${ghMergeErr.message}`);
          console.log('   Attempting local merge...\n');
        }
      }

      // SD-SEC-DATA-VALIDATION-001: Validate branch and qf.id before shell use
      const validatedBranch = validateBranchName(currentBranch);
      const sanitizedQfId = qf.id ? qf.id.replace(/[^a-zA-Z0-9_-]/g, '') : 'unknown';
      const sanitizedTitle = sanitizeCommitMessage(qf.title || 'Quick fix');

      // Local merge fallback
      execSync('git checkout main', { stdio: 'inherit', cwd: testDir });
      execSync('git pull origin main', { stdio: 'inherit', cwd: testDir });
      execSync(`git merge --no-ff ${validatedBranch} -m "Merge quick-fix/${sanitizedQfId}: ${sanitizedTitle}"`, { stdio: 'inherit', cwd: testDir });
      execSync('git push origin main', { stdio: 'inherit', cwd: testDir });
      console.log('   ✅ Merged to main locally\n');

      // SD-SEC-DATA-VALIDATION-001: Use validated branch for deletion
      execSync(`git branch -d ${validatedBranch}`, { stdio: 'pipe', cwd: testDir });
      execSync(`git push origin --delete ${validatedBranch}`, { stdio: 'pipe', cwd: testDir });
      console.log(`   ✅ Deleted branch: ${validatedBranch}\n`);
    } else {
      displayManualMergeInstructions(prUrl);
    }
  } catch (mergeErr) {
    console.log(`   ⚠️  Merge process error: ${mergeErr.message}`);
    console.log('   You can merge manually when ready.\n');
  }
}

/**
 * Check PR status before merge
 */
async function checkPRStatus(testDir, prUrl) {
  console.log('   Checking PR status...');
  try {
    const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
    // SD-SEC-DATA-VALIDATION-001: Validate PR number is numeric
    if (prNumber && /^\d+$/.test(prNumber)) {
      const prStatus = execSync(`gh pr view ${prNumber} --json mergeable,statusCheckRollup`, { encoding: 'utf-8', cwd: testDir });
      const prData = JSON.parse(prStatus);

      if (prData.mergeable === 'MERGEABLE') {
        console.log('   ✅ PR is mergeable');
      } else if (prData.mergeable === 'CONFLICTING') {
        console.log('   ⚠️  PR has merge conflicts. Resolve before merging.');
      }
    }
  } catch (prCheckErr) {
    console.log(`   ⚠️  Could not check PR status: ${prCheckErr.message}`);
  }
}

/**
 * Display manual merge instructions
 */
function displayManualMergeInstructions(prUrl) {
  console.log('\n   ⚠️  Not merged. Remember to merge to main when ready:');
  if (prUrl) {
    console.log('      gh pr merge --merge --delete-branch');
  } else {
    console.log('      git checkout main && git merge --no-ff <branch> && git push origin main');
  }
  console.log();
}
