/**
 * Worktree-Aware PR Merge
 *
 * Handles the gh + worktree interaction smoothly:
 * - Merges PR via GitHub API (no local checkout needed)
 * - Deletes remote branch via API
 * - Removes worktree and prunes references
 * - Returns to main repo with latest code
 *
 * Usage: node scripts/modules/shipping/worktree-merge.js <PR_NUMBER>
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { removeWorktreeViaGit } from '../../../lib/worktree-manager.js';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch (e) {
    if (opts.allowFail) return e.stderr?.trim() || e.message;
    throw e;
  }
}

function main() {
  const prNumber = process.argv[2];
  if (!prNumber) {
    console.error('Usage: node worktree-merge.js <PR_NUMBER>');
    process.exit(1);
  }

  // Detect worktree context
  const cwd = process.cwd().replace(/\\/g, '/');
  const gitTopLevel = run('git rev-parse --show-toplevel').replace(/\\/g, '/');
  const gitCommonDir = run('git rev-parse --git-common-dir').replace(/\\/g, '/');
  const isWorktree = gitTopLevel !== resolve(gitCommonDir, '..').replace(/\\/g, '/');

  const branch = run('git branch --show-current');

  console.log(`📦 Merging PR #${prNumber}${isWorktree ? ' (from worktree)' : ''}`);
  console.log(`   Branch: ${branch}`);

  // Step 1: Merge via gh API (works regardless of local state)
  console.log('   🔀 Merging PR on GitHub...');
  run(`gh pr merge ${prNumber} --merge`);
  console.log('   ✅ PR merged');

  // Step 2: Delete remote branch (gh doesn't need local checkout for this)
  console.log(`   🗑️  Deleting remote branch: ${branch}...`);
  run(`git push origin --delete ${branch}`, { allowFail: true });
  console.log('   ✅ Remote branch deleted');

  if (isWorktree) {
    // Step 3: Find main repo path
    const mainRepoPath = resolve(gitCommonDir, '..').replace(/\\/g, '/');
    console.log(`   📂 Main repo: ${mainRepoPath}`);

    // Step 4: Pull latest in main repo
    console.log('   ⬇️  Pulling latest main...');
    run('git pull', { cwd: mainRepoPath });

    // Step 5: Identify worktree path for removal
    const worktreePath = gitTopLevel;
    const worktreeRelative = worktreePath.replace(mainRepoPath + '/', '');

    // Step 6: Prune and clean (worktree branch was deleted on remote)
    console.log('   🧹 Pruning worktree references...');
    run('git worktree prune', { cwd: mainRepoPath });

    // Try to remove the worktree directory if it still exists.
    // QF-20260511-446: route through removeWorktreeViaGit so the node_modules
    // symlink is unlinked first — bare `git worktree remove --force` follows
    // MSYS bash symlinks on Windows and wipes the main repo's node_modules.
    if (existsSync(worktreePath)) {
      removeWorktreeViaGit(worktreePath, mainRepoPath, { allowFail: true });
    }

    // Delete local branch reference
    run(`git branch -D ${branch}`, { cwd: mainRepoPath, allowFail: true });

    console.log('');
    console.log(JSON.stringify({
      merged: true,
      pr: parseInt(prNumber),
      branch,
      worktreeCleaned: true,
      mainRepoPath,
      action: 'cd_to_main'
    }));
    console.log('');
    console.log(`   ✅ Done. cd to: ${mainRepoPath}`);
  } else {
    // Not in worktree — standard flow
    console.log('   ⬇️  Pulling latest main...');
    run('git checkout main');
    run('git pull');
    // Delete local branch
    run(`git branch -D ${branch}`, { allowFail: true });

    console.log('');
    console.log(JSON.stringify({
      merged: true,
      pr: parseInt(prNumber),
      branch,
      worktreeCleaned: false,
      mainRepoPath: cwd,
      action: 'already_on_main'
    }));
    console.log('');
    console.log('   ✅ Done. On main with latest.');
  }
}

main();
