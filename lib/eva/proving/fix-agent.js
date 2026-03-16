/**
 * Fix Agent — Applies pattern-based fixes in git worktrees for proving runs.
 *
 * Creates isolated worktree, applies fix from pattern template, runs tests,
 * commits only if tests pass. Supports cross-repo fixes (EHG_Engineer + EHG).
 * Logs before/after assessment scores for regression detection.
 *
 * @module lib/eva/proving/fix-agent
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEFAULT_REPO_ROOT = process.cwd();
const WORKTREE_PREFIX = '.worktrees/proving-fix';

/**
 * Resolve the local path for a target repository.
 *
 * @param {string} repoTarget - 'EHG_Engineer' or 'ehg'
 * @param {string} [fallbackRoot] - Fallback root path
 * @returns {string} Absolute path to the repo root
 */
export function resolveRepoPath(repoTarget, fallbackRoot = DEFAULT_REPO_ROOT) {
  if (!repoTarget || repoTarget === 'EHG_Engineer') return fallbackRoot;

  // Try applications/registry.json for repo path lookup
  const registryPath = path.join(fallbackRoot, 'applications', 'registry.json');
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const entry = registry.applications?.find(a =>
        a.name?.toLowerCase() === repoTarget.toLowerCase() ||
        a.repo?.toLowerCase().includes(repoTarget.toLowerCase())
      );
      if (entry?.local_path && fs.existsSync(entry.local_path)) return entry.local_path;
    } catch { /* fall through */ }
  }

  // Conventional sibling path
  const siblingPath = path.resolve(fallbackRoot, '..', repoTarget);
  if (fs.existsSync(siblingPath)) return siblingPath;

  return fallbackRoot;
}

/**
 * Create an isolated git worktree for fix application.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string} fixId - Unique fix identifier
 * @returns {{ worktreePath: string, branch: string }}
 */
export function createFixWorktree(repoRoot, fixId) {
  const branch = `proving-fix/${fixId}-${Date.now()}`;
  const worktreePath = path.join(repoRoot, WORKTREE_PREFIX, fixId);

  if (fs.existsSync(worktreePath)) {
    execSync(`git worktree remove "${worktreePath}" --force`, { cwd: repoRoot, stdio: 'pipe' });
  }

  execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
    cwd: repoRoot, stdio: 'pipe', timeout: 30000,
  });

  return { worktreePath, branch };
}

/**
 * Remove a fix worktree and its branch.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string} worktreePath - Worktree path to remove
 * @param {string} branch - Branch to delete
 */
export function removeFixWorktree(repoRoot, worktreePath, branch) {
  try {
    execSync(`git worktree remove "${worktreePath}" --force`, { cwd: repoRoot, stdio: 'pipe' });
  } catch { /* already removed */ }
  try {
    execSync(`git branch -D "${branch}"`, { cwd: repoRoot, stdio: 'pipe' });
  } catch { /* branch may not exist */ }
}

/**
 * Apply a pattern-based fix to files in a worktree.
 *
 * @param {string} worktreePath - Worktree to apply fix in
 * @param {Object} pattern - Pattern template with file modifications
 * @param {Array<{filePath: string, content: string}>} pattern.files - Files to create/modify
 * @param {Array<{filePath: string, search: string, replace: string}>} [pattern.edits] - Search/replace edits
 * @returns {{ filesModified: number, filesCreated: number }}
 */
export function applyPattern(worktreePath, pattern) {
  let filesModified = 0;
  let filesCreated = 0;

  // Create/overwrite files
  if (pattern.files) {
    for (const { filePath, content } of pattern.files) {
      const fullPath = path.join(worktreePath, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const existed = fs.existsSync(fullPath);
      fs.writeFileSync(fullPath, content, 'utf8');
      if (existed) filesModified++;
      else filesCreated++;
    }
  }

  // Apply search/replace edits
  if (pattern.edits) {
    for (const { filePath, search, replace } of pattern.edits) {
      const fullPath = path.join(worktreePath, filePath);
      if (!fs.existsSync(fullPath)) continue;
      const original = fs.readFileSync(fullPath, 'utf8');
      const modified = original.replace(search, replace);
      if (modified !== original) {
        fs.writeFileSync(fullPath, modified, 'utf8');
        filesModified++;
      }
    }
  }

  return { filesModified, filesCreated };
}

/**
 * Run tests in a worktree.
 *
 * @param {string} worktreePath - Worktree path
 * @param {Object} [options]
 * @param {string} [options.testCommand='npx vitest run'] - Test command
 * @param {number} [options.timeout=60000] - Timeout in ms
 * @returns {{ passed: boolean, output: string }}
 */
export function runTests(worktreePath, options = {}) {
  const { testCommand = 'npx vitest run', timeout = 60000 } = options;
  try {
    const output = execSync(testCommand, {
      cwd: worktreePath, encoding: 'utf8', timeout, stdio: 'pipe',
    });
    return { passed: true, output };
  } catch (err) {
    return { passed: false, output: err.stdout || err.message };
  }
}

/**
 * Commit fix changes in a worktree.
 *
 * @param {string} worktreePath - Worktree path
 * @param {string} message - Commit message
 * @returns {string} Commit hash
 */
export function commitFix(worktreePath, message) {
  execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: worktreePath, stdio: 'pipe',
  });
  return execSync('git rev-parse HEAD', { cwd: worktreePath, encoding: 'utf8' }).trim();
}

/**
 * Apply a fix to a stage using pattern replication.
 *
 * Full workflow: create worktree -> apply pattern -> run tests -> commit/rollback -> cleanup.
 *
 * @param {Object} options
 * @param {string} options.fixId - Unique fix identifier
 * @param {Object} options.pattern - Pattern template to apply
 * @param {Object} [options.preScore] - Assessment score before fix
 * @param {string} [options.repoTarget='EHG_Engineer'] - Target repository
 * @param {string} [options.testCommand] - Custom test command
 * @param {Function} [options.postAssess] - Function to compute post-fix score
 * @returns {Promise<{ success: boolean, commitHash?: string, preScore?: Object, postScore?: Object, error?: string }>}
 */
export async function applyFix(options) {
  const { fixId, pattern, preScore, repoTarget = 'EHG_Engineer', testCommand, postAssess } = options;
  const repoRoot = resolveRepoPath(repoTarget);

  let worktreePath, branch;
  try {
    ({ worktreePath, branch } = createFixWorktree(repoRoot, fixId));
  } catch (err) {
    return { success: false, error: `Worktree creation failed: ${err.message}`, preScore };
  }

  try {
    const { filesModified, filesCreated } = applyPattern(worktreePath, pattern);
    if (filesModified === 0 && filesCreated === 0) {
      return { success: false, error: 'No files modified by pattern', preScore };
    }

    const { passed, output } = runTests(worktreePath, { testCommand });
    if (!passed) {
      return { success: false, error: 'Tests failed after fix', testOutput: output, preScore };
    }

    const commitHash = commitFix(worktreePath, `fix(proving): ${fixId} — pattern-based fix`);

    // Compute post-fix score if assessor provided
    let postScore;
    if (postAssess) {
      try { postScore = await postAssess(worktreePath); } catch { /* non-critical */ }
    }

    return { success: true, commitHash, filesModified, filesCreated, preScore, postScore };
  } finally {
    removeFixWorktree(repoRoot, worktreePath, branch);
  }
}
