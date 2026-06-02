#!/usr/bin/env node

/**
 * Quick Git State Check
 * SD-LEO-STREAMS-001 Retrospective: Pre-flight git state validation
 *
 * Provides fast validation of git state before handoff attempts.
 * Use with the precheck command to catch git issues early.
 *
 * Usage:
 *   node scripts/check-git-state.js
 *   node scripts/check-git-state.js --json
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { pathToFileURL } from 'url';

const execAsync = promisify(exec);

// QF-20260529-729 (backlog a23355c1): .worktree.json + .worktree-nm-mode are deliberately
// TRACKED per-worktree metadata (see the .gitignore note) that worktree provisioning rewrites
// for each worktree, so inside a worktree they ALWAYS appear "modified". That is git noise,
// not real uncommitted work — it must not block a handoff (it tripped STEP 1 at every
// LEAD-TO-PLAN handoff run from a worktree). Excluded from the blocking classification below;
// this does NOT untrack them (honors the deliberate tracking decision).
const PER_WORKTREE_METADATA = ['.worktree.json', '.worktree-nm-mode'];
function isPerWorktreeMetadata(file) {
  return PER_WORKTREE_METADATA.includes((file || '').trim());
}

async function gitCommand(command, cwd) {
  try {
    const { stdout, stderr } = await execAsync(command, cwd ? { cwd } : undefined);
    // trimEnd() — NOT trim(): leading whitespace is SIGNIFICANT for `git status
    // --porcelain` (its first line begins with the 2-char status code, e.g.
    // " M .worktree.json"). A bare .trim() strips the first line's leading space,
    // shifting the parse (status " M"→"M ", file ".worktree.json"→"worktree.json")
    // so per-worktree metadata misses the skip-list and wrongly blocks the handoff.
    return { stdout: stdout.trimEnd(), stderr: stderr.trim(), success: true };
  } catch (error) {
    return {
      stdout: error.stdout?.trimEnd() || '',
      stderr: error.stderr?.trim() || error.message,
      success: false
    };
  }
}

async function checkGitState(options = {}) {
  // FR-2 (SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001): run git in the resolved target repo
  // for cross-repo/venture SDs. No cwd => process.cwd() (platform behavior byte-identical).
  const cwd = options.cwd || options.repoPath || null;
  const result = {
    passed: true,
    issues: [],
    warnings: [],
    details: {
      currentBranch: '',
      uncommittedFiles: [],
      unpushedCommits: 0,
      stagedFiles: [],
      modifiedFiles: [],
      untrackedFiles: []
    }
  };

  console.log('🔍 GIT STATE QUICK CHECK');
  console.log('='.repeat(50));

  // 1. Get current branch
  const branchResult = await gitCommand('git branch --show-current', cwd);
  result.details.currentBranch = branchResult.stdout || 'unknown';
  console.log(`   Branch: ${result.details.currentBranch}`);

  // 2. Check for uncommitted changes
  const statusResult = await gitCommand('git status --porcelain', cwd);
  if (statusResult.stdout) {
    const lines = statusResult.stdout.split('\n').filter(Boolean);
    lines.forEach(line => {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      // QF-20260529-729: skip per-worktree metadata noise — never blocks a handoff.
      if (isPerWorktreeMetadata(file)) return;

      // Classify by status
      if (status[0] === '?' && status[1] === '?') {
        result.details.untrackedFiles.push(file);
      } else if (status[0] !== ' ') {
        // Staged change
        result.details.stagedFiles.push(file);
        result.details.uncommittedFiles.push(file);
      } else if (status[1] !== ' ') {
        // Unstaged modification
        result.details.modifiedFiles.push(file);
        result.details.uncommittedFiles.push(file);
      }
    });

    if (result.details.stagedFiles.length > 0) {
      result.passed = false;
      result.issues.push({
        type: 'UNCOMMITTED_STAGED',
        message: `${result.details.stagedFiles.length} staged file(s) not committed`,
        files: result.details.stagedFiles,
        remediation: 'Run: git commit -m "Your message" or git stash'
      });
      console.log(`   ❌ Staged files: ${result.details.stagedFiles.length}`);
      result.details.stagedFiles.forEach(f => console.log(`      - ${f}`));
    }

    if (result.details.modifiedFiles.length > 0) {
      result.passed = false;
      result.issues.push({
        type: 'UNCOMMITTED_MODIFIED',
        message: `${result.details.modifiedFiles.length} modified file(s) not staged`,
        files: result.details.modifiedFiles,
        remediation: 'Run: git add <files> && git commit -m "Your message"'
      });
      console.log(`   ❌ Modified files: ${result.details.modifiedFiles.length}`);
      result.details.modifiedFiles.forEach(f => console.log(`      - ${f}`));
    }

    if (result.details.untrackedFiles.length > 0) {
      // Untracked files are warnings, not blockers
      // Filter out session files that shouldn't block
      const blockingUntracked = result.details.untrackedFiles.filter(f => {
        // Ignore common session/temp files
        const ignorable = [
          '.claude/',
          'session-state',
          '.env.local',
          'node_modules/',
          '.next/',
          '__pycache__/'
        ];
        return !ignorable.some(pattern => f.includes(pattern));
      });

      if (blockingUntracked.length > 0) {
        result.warnings.push({
          type: 'UNTRACKED_FILES',
          message: `${blockingUntracked.length} untracked file(s) - consider adding to .gitignore or committing`,
          files: blockingUntracked
        });
        console.log(`   ⚠️  Untracked files: ${blockingUntracked.length}`);
      }
    }
  } else {
    console.log('   ✅ Working directory clean');
  }

  // 3. Check for unpushed commits
  const unpushedResult = await gitCommand('git log @{u}..HEAD --oneline 2>/dev/null', cwd);
  if (unpushedResult.success && unpushedResult.stdout) {
    const commits = unpushedResult.stdout.split('\n').filter(Boolean);
    result.details.unpushedCommits = commits.length;
    if (commits.length > 0) {
      result.warnings.push({
        type: 'UNPUSHED_COMMITS',
        message: `${commits.length} commit(s) not pushed to remote`,
        commits: commits,
        remediation: 'Run: git push'
      });
      console.log(`   ⚠️  Unpushed commits: ${commits.length}`);
    }
  } else {
    console.log('   ✅ All commits pushed');
  }

  // 4. Check if on main branch (warning)
  if (result.details.currentBranch === 'main' || result.details.currentBranch === 'master') {
    result.warnings.push({
      type: 'ON_MAIN_BRANCH',
      message: 'Currently on main branch - consider using a feature branch for changes',
      remediation: 'Run: git checkout -b feature/SD-XXX-001'
    });
    console.log('   ⚠️  On main branch');
  }

  // Summary
  console.log('');
  console.log('─'.repeat(50));
  if (result.passed) {
    console.log('✅ GIT STATE: READY FOR HANDOFF');
  } else {
    console.log('❌ GIT STATE: ISSUES MUST BE RESOLVED');
    console.log('');
    console.log('REMEDIATION:');
    result.issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue.message}`);
      console.log(`      ${issue.remediation}`);
    });
  }
  if (result.warnings.length > 0) {
    console.log('');
    console.log('WARNINGS:');
    result.warnings.forEach((warning, idx) => {
      console.log(`   ${idx + 1}. ${warning.message}`);
      if (warning.remediation) {
        console.log(`      ${warning.remediation}`);
      }
    });
  }
  console.log('='.repeat(50));

  return result;
}

export { checkGitState, isPerWorktreeMetadata, PER_WORKTREE_METADATA };

// CLI execution — only when run directly (node scripts/check-git-state.js), NOT when
// imported. Without this guard, importing the module (e.g. from the handoff precheck CLI
// at scripts/modules/handoff/cli/cli-main.js) runs checkGitState() + process.exit() in the
// HOST process, halting it on dirty git. Regression exposed by QF-20260523-481 (which fixed
// the precheck's import path); guarded here so import is side-effect-free.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  checkGitState().then(result => {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.passed ? 0 : 1);
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
