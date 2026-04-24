#!/usr/bin/env node
/**
 * gh-merge-safe — merge a PR via the GitHub API without triggering gh's
 * post-merge local `git checkout main`.
 *
 * Background: `gh pr merge --squash` succeeds on GitHub but fails locally
 * (exit 1) whenever a sibling worktree already holds `main` — e.g.
 * .worktrees/parent-rollup-session. The merge is fine; the error is cosmetic
 * but operator-confusing. This wrapper merges via `gh api` and skips the local
 * checkout entirely.
 *
 * Usage:
 *   gh-merge-safe <PR#> [--squash|--merge|--rebase] [--delete-branch]
 *
 * Defaults: --squash, no branch deletion.
 */

import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function main() {
  const { values, positionals } = parseArgs({
    options: {
      squash: { type: 'boolean', default: false },
      merge: { type: 'boolean', default: false },
      rebase: { type: 'boolean', default: false },
      'delete-branch': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const prNumber = positionals[0];
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    console.error('Usage: gh-merge-safe <PR#> [--squash|--merge|--rebase] [--delete-branch]');
    process.exit(2);
  }

  let method = 'squash';
  if (values.merge) method = 'merge';
  if (values.rebase) method = 'rebase';

  // Detect already-merged PRs up front to be idempotent.
  const preview = JSON.parse(sh(`gh pr view ${prNumber} --json state,mergeCommit,headRefName,baseRepository`));
  const { owner: { login: owner }, name: repo } = preview.baseRepository;

  if (preview.state === 'MERGED') {
    const sha = preview.mergeCommit?.oid || 'unknown';
    console.log(`PR #${prNumber} already merged: ${sha}`);
    process.exit(0);
  }

  const apiPath = `repos/${owner}/${repo}/pulls/${prNumber}/merge`;
  let mergeCommitSha;
  try {
    const raw = sh(`gh api --method PUT ${apiPath} -f merge_method=${method}`);
    const result = JSON.parse(raw);
    mergeCommitSha = result.sha;
    console.log(`Merged PR #${prNumber} (${method}): ${mergeCommitSha}`);
  } catch (e) {
    console.error(`Merge failed for PR #${prNumber}: ${e.stderr || e.message}`);
    process.exit(1);
  }

  if (values['delete-branch']) {
    try {
      sh(`gh api --method DELETE repos/${owner}/${repo}/git/refs/heads/${preview.headRefName}`);
      console.log(`Deleted branch: ${preview.headRefName}`);
    } catch (e) {
      // Not fatal — branch may already be gone, or deletion may be disabled.
      console.error(`Warning: could not delete branch ${preview.headRefName}: ${e.stderr || e.message}`);
    }
  }

  process.exit(0);
}

main();
