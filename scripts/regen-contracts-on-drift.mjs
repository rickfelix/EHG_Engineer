#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A — the caller that makes regeneration follow a write to
 * leo_protocol_sections. Supplies the real dependencies to lib/protocol/regen-on-drift.js, which
 * holds the decision logic and is unit-tested without git, network or a database.
 *
 * The orchestration lives in the library and the side effects live here on purpose: a
 * well-tested function nobody calls is dead by construction while reading as wired, and a CLI
 * with the logic inline cannot be tested at all. This file is deliberately thin.
 *
 * USAGE
 *   node scripts/regen-contracts-on-drift.mjs [--dry-run]
 *
 * EXIT CODES, chosen to match the drift checker's own contract so callers can treat them alike:
 *   0  nothing to do, or regenerated and a PR was opened
 *   1  refused (shared root, or still drifted after regenerating) — a real finding
 *   2  the detector was unavailable — infra trouble, callers may fail open
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { regenerateOnDrift, REGEN_OUTCOME } from '../lib/protocol/regen-on-drift.js';
import { createWorktree, cleanupWorktree, getRepoRoot } from '../lib/worktree-manager.js';

const DRY_RUN = process.argv.includes('--dry-run');
const REGEN_KEY = 'REGEN-CONTRACTS-ON-DRIFT';
const REGEN_BRANCH = `chore/${REGEN_KEY.toLowerCase()}`;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** computeDrift lives in a CJS module; reach it through the default export. */
async function loadComputeDrift() {
  const mod = await import('./check-claude-md-drift.cjs');
  return (mod.default && mod.default.computeDrift) || mod.computeDrift;
}

/**
 * True when this process would operate on the SHARED checkout rather than an isolated worktree.
 * Keyed on the path containing a .worktrees/ segment, which is the same discriminator the ENF-17
 * shared-tree guard uses (WORKTREE_PATH_RE) — one definition of "isolated", not a second.
 */
function isSharedRoot(cwd = process.cwd()) {
  return !/[/\\]\.worktrees[/\\][^/\\]+/i.test(cwd);
}

async function main() {
  const repoRoot = getRepoRoot();
  const computeDrift = await loadComputeDrift();

  const result = await regenerateOnDrift({
    driftProbe: () => computeDrift({ baseDir: repoRoot }),
    isSharedRoot: () => isSharedRoot(),

    acquireWorktree: async () => {
      // ONE worktree, released in the library's finally. The pool has a hard cap and has been
      // observed saturated for an entire session, so a per-write worktree would block every
      // other seat.
      const created = createWorktree({ sdKey: REGEN_KEY, branch: REGEN_BRANCH, repoRoot });
      const worktreePath = created?.worktreePath || path.join(repoRoot, '.worktrees', REGEN_KEY);
      return {
        path: worktreePath,
        release: async () => { try { cleanupWorktree(worktreePath); } catch { /* reaper will collect it */ } },
      };
    },

    runGenerator: async (worktreePath) => {
      execFileSync('node', ['scripts/generate-claude-md-from-db.js'], { cwd: worktreePath, encoding: 'utf8', stdio: 'pipe' });
      // Ask git what actually changed rather than trusting the generator's own report: it is
      // skip-on-unchanged, so "ran" and "changed something" are different facts.
      const changed = git(['status', '--porcelain'], worktreePath)
        .split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
      return { changedFiles: changed };
    },

    // FR-3: the hook enforces zero drift as part of its own operation, in the WORKTREE it just
    // regenerated — not in the root, which this run never touched.
    verifyInWorktree: (worktreePath) => computeDrift({ baseDir: worktreePath }),

    openPullRequest: async ({ worktreePath, changedFiles }) => {
      if (DRY_RUN) return { url: `(dry-run: would open a PR for ${changedFiles.length} file(s))` };
      git(['add', '--', ...changedFiles], worktreePath);
      git(['commit', '-m', `chore: regenerate rendered contracts after a leo_protocol_sections write\n\nAutomated by scripts/regen-contracts-on-drift.mjs (SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A).\nDrift was detected against leo_protocol_sections and the regenerated tree verified clean\nbefore this PR was opened.`], worktreePath);
      git(['push', '-u', 'origin', REGEN_BRANCH], worktreePath);
      const url = execFileSync('gh', ['pr', 'create', '--base', 'main', '--head', REGEN_BRANCH,
        '--title', 'chore: regenerate rendered contracts after a leo_protocol_sections write',
        '--body', 'Automated regeneration. Drift was detected against `leo_protocol_sections`, the contracts were regenerated in an isolated worktree, and the tree was verified drift-free before this PR was opened.'],
      { cwd: worktreePath, encoding: 'utf8' }).trim();
      return { url };
    },
  });

  console.log(`regen-contracts-on-drift: ${result.outcome}${result.detail ? ` ${JSON.stringify(result.detail)}` : ''}`);

  if (result.outcome === REGEN_OUTCOME.REFUSED_SHARED_ROOT || result.outcome === REGEN_OUTCOME.REFUSED_STILL_DRIFTED) return 1;
  if (result.outcome === REGEN_OUTCOME.PROBE_UNAVAILABLE) return 2;
  return 0;
}

main().then((code) => { process.exitCode = code; }, (err) => {
  console.error(`regen-contracts-on-drift: ${err?.stack || err?.message || err}`);
  process.exitCode = 1;
});
