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

import { execSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * SD-LEO-INFRA-POST-MERGE-AUTO-001 FR-3: invoke the post-merge handoff orchestrator
 * after a successful gh-api-PUT merge so SDs merged via this fallback path receive
 * the same auto-pipeline (status flip → retro generation → claim release → learning
 * capture) as the /ship Step 6 path. Skipped for QF branches (handled by
 * complete-quick-fix.js elsewhere).
 *
 * Honors LEO_AUTOHANDOFF_ENABLED for emergency disable parity with ship.md Step 6.5.
 *
 * Failure here is logged but does NOT propagate as an exit-1 — the merge itself
 * already succeeded and the post-merge layer is reconcilable by orphan-qf-reaper /
 * future post-merge sweep. Operators can re-run the orchestrator manually if needed.
 */
function invokePostMergeOrchestrator(headRefName) {
  if (process.env.LEO_AUTOHANDOFF_ENABLED === 'false') {
    console.log('ℹ️  LEO_AUTOHANDOFF_ENABLED=false — skipping post-merge orchestrator');
    return;
  }
  // QF skip parity with ship.md Step 6.3 → Step 6.5 (second-block) flow.
  if (/^(qf|quick-fix)\//.test(headRefName)) {
    return;
  }
  // Derive SD_KEY from branch name with the same regex shape as ship.md Step 6.5
  // (sed -nE 's|^(feat|fix|refactor|docs|test)/(SD-[^-]+(-[^-/]+)*)/?.*|\2|p').
  const sdKeyMatch = headRefName.match(/^(?:feat|fix|refactor|docs|test)\/(SD-[^-]+(?:-[^-/]+)*)\/?/);
  if (!sdKeyMatch) {
    return;
  }
  const sdKey = sdKeyMatch[1];
  console.log(`🔁 Post-merge orchestrator: ${sdKey} (merged_branch=${headRefName})`);
  const r = spawnSync(
    'node',
    [
      'scripts/post-merge-handoff-orchestrator.js',
      `--sd-key=${sdKey}`,
      `--merged-branch=${headRefName}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );
  if (r.status !== 0) {
    console.error(
      `⚠️  Post-merge orchestrator exited ${r.status} (non-blocking): ${(r.stderr || '').trim().slice(0, 500)}`,
    );
  }
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

  // Detect already-merged PRs up front to be idempotent. gh pr view does not expose
  // baseRepository, so resolve owner/name via gh repo view (works because the wrapper
  // already requires being inside the repo's working tree).
  const preview = JSON.parse(sh(`gh pr view ${prNumber} --json state,mergeCommit,headRefName`));
  const repoInfo = JSON.parse(sh(`gh repo view --json owner,name`));
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;

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

  // SD-LEO-INFRA-POST-MERGE-AUTO-001 FR-3: invoke post-merge orchestrator BEFORE
  // optional branch deletion so we still have a live local ref if the orchestrator
  // needs it for any future enrichment. Branch-name string is preserved either way.
  invokePostMergeOrchestrator(preview.headRefName);

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
