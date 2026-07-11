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
import { existsSync, realpathSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeReapEligibleMarker } from '../../../lib/worktree-reaper/reap-eligible-marker.js';
import { observeMergeWorkLadder } from '../../../lib/ship/auto-merge.mjs';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch (e) {
    if (opts.allowFail) return e.stderr?.trim() || e.message;
    throw e;
  }
}

// SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-1): best-effort, never-throws observation
// of a merge that just landed via `gh pr merge` in this lane. TR-1: must never
// block or fail the merge -- all failures caught and logged only.
export async function observeWorktreeMerge(prNumber) {
  try {
    const [repoOwner, repoName] = run('gh repo view --json owner,name --jq "[.owner.login,.name] | @tsv"', { allowFail: true }).split('\t');
    const { createSupabaseServiceClient } = await import('../../../lib/supabase-client.js');
    const supabase = createSupabaseServiceClient();
    await observeMergeWorkLadder({
      prNumber,
      repoOwner,
      repoName,
      tier: 'standard',
      lane: 'worktree-merge',
      merged: true,
      supabase,
      logger: console,
    });
  } catch (e) {
    console.log(`   ⚠️  merge-witness observation skipped (non-fatal): ${e?.message || e}`);
  }
}

async function main() {
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
  await observeWorktreeMerge(prNumber);

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

    // SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 (FR-3): this flow runs IN-PROCESS
    // from inside the worktree right after the merge — deleting it here is the
    // exact post-merge self-reap vector. Mark reap-eligible instead; the
    // scheduled reaper collects it out-of-band once residency clears.
    if (existsSync(worktreePath)) {
      const marker = writeReapEligibleMarker(worktreePath, { sd_key: worktreeRelative, merged_pr: prNumber });
      console.log(`   🏷️  Worktree marked reap-eligible${marker.written ? '' : ' (marker write failed: ' + marker.error + ')'} — scheduled reaper collects it out-of-band`);
    }

    // Delete local branch reference
    run(`git branch -D ${branch}`, { cwd: mainRepoPath, allowFail: true });

    console.log('');
    console.log(JSON.stringify({
      merged: true,
      pr: parseInt(prNumber),
      branch,
      worktreeCleaned: false,
      worktreeMarkedReapEligible: true,
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

// Only run the CLI when invoked directly, so importing this module in a test
// (e.g. to test observeWorktreeMerge in isolation) does not also execute main().
const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  });
}
