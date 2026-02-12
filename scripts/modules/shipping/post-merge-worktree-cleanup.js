import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Quick-fix QF-20260211-111: Post-merge worktree cleanup for /ship
// FR-5: Added --sdKey support for external callers (SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001)
const gitExec = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }).trim();

function isInsideWorktree() {
  try { return gitExec('git rev-parse --show-toplevel').includes('.worktrees'); }
  catch { return false; }
}

function getWorktreeMetadata(wtPath) {
  for (const name of ['.ehg-session.json', '.worktree.json']) {
    const fp = path.join(wtPath, name);
    if (fs.existsSync(fp)) {
      try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* skip */ }
    }
  }
  return null;
}

function getMainRepoPath(meta, wtPath) {
  if (meta?.repoRoot) return meta.repoRoot;
  const idx = wtPath.indexOf('.worktrees');
  return idx > 0 ? wtPath.slice(0, idx - 1) : null;
}

function cleanupCurrentWorktree() {
  if (!isInsideWorktree()) return { cleaned: false, reason: 'not_in_worktree' };
  const wtPath = gitExec('git rev-parse --show-toplevel');
  return cleanupWorktreeByPath(wtPath);
}

/**
 * Clean up a worktree by its absolute path.
 * Used by --sdKey mode after resolving from DB/scan.
 */
function cleanupWorktreeByPath(wtPath) {
  if (!fs.existsSync(wtPath)) return { cleaned: false, reason: 'worktree_not_found' };
  const meta = getWorktreeMetadata(wtPath);
  const mainRepoPath = getMainRepoPath(meta, wtPath);
  if (!mainRepoPath) return { cleaned: false, reason: 'cannot_resolve_main_repo' };
  try {
    execSync(`git worktree remove --force "${wtPath}"`, { cwd: mainRepoPath, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
      execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
    }
  }
  return { cleaned: true, mainRepoPath, workKey: meta?.workKey || meta?.sdKey || null };
}

/**
 * Resolve worktree for an SD key using the central resolver, then clean it up.
 * This allows /ship to clean up worktrees when NOT running inside one.
 */
async function cleanupBySDKey(sdKey) {
  try {
    const { resolve } = await import('../../resolve-sd-workdir.js');
    const repoRoot = gitExec('git rev-parse --show-toplevel');
    const result = await resolve(sdKey, 'ship', repoRoot);

    if (result.success && result.worktree?.exists && result.worktree.path) {
      const cleanup = cleanupWorktreeByPath(result.worktree.path);
      return { ...cleanup, sdKey, resolvedFrom: result.source };
    }

    return { cleaned: false, reason: 'no_worktree_found', sdKey };
  } catch (err) {
    return { cleaned: false, reason: 'resolve_failed', sdKey, error: err.message };
  }
}

// CLI entry point
const _e = process.argv[1] || '', isMain = _e && (import.meta.url === `file://${_e}` ||
  import.meta.url === `file:///${_e.replace(/\\/g, '/')}`);

if (isMain) {
  // Parse --sdKey argument
  const args = process.argv.slice(2);
  let sdKey = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sdKey' && args[i + 1]) { sdKey = args[++i]; }
  }

  if (sdKey) {
    // FR-5: External caller mode - resolve worktree from DB/scan and clean up
    cleanupBySDKey(sdKey).then(result => {
      process.stdout.write(JSON.stringify(result));
    }).catch(err => {
      process.stdout.write(JSON.stringify({ cleaned: false, reason: 'error', error: err.message }));
    });
  } else {
    // Original mode - clean up current worktree (if running inside one)
    process.stdout.write(JSON.stringify(cleanupCurrentWorktree()));
  }
}

export { isInsideWorktree, getWorktreeMetadata, getMainRepoPath, cleanupCurrentWorktree, cleanupBySDKey, cleanupWorktreeByPath };
