import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Quick-fix QF-20260211-111: Post-merge worktree cleanup for /ship
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

const _e = process.argv[1] || '', isMain = _e && (import.meta.url === `file://${_e}` ||
  import.meta.url === `file:///${_e.replace(/\\/g, '/')}`);
if (isMain) process.stdout.write(JSON.stringify(cleanupCurrentWorktree()));
export { isInsideWorktree, getWorktreeMetadata, getMainRepoPath, cleanupCurrentWorktree };
