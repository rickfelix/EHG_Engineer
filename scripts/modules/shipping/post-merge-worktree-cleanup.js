import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Quick-fix QF-20260211-111: Post-merge worktree cleanup for /ship
// FR-5: Added --sdKey support for external callers (SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001)
// SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: Pre-cleanup commit check + archive-on-conflict
const gitExec = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }).trim();

/**
 * Check if a worktree has commits that have not been pushed to the remote.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001 (FR-1).
 *
 * QF-20260424-803: After `gh pr merge --delete-branch`, the local branch is
 * gone, so a naive `git log origin/main..HEAD` either returns the now-orphaned
 * commits (false unpushed) or throws (silently fell back to "treat as safe").
 * Filter the listed commits through `git cherry` (patch-id match — handles
 * squash merges) with a per-commit `merge-base --is-ancestor` fallback so a
 * shipped commit is correctly recognized as not-unpushed.
 */
function hasUnpushedCommits(wtPath) {
  const opts = { cwd: wtPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] };
  let commits = [];
  try {
    const log = execSync('git log origin/main..HEAD --oneline', opts).trim();
    if (log) commits = log.split('\n').filter(Boolean);
  } catch {
    try {
      const log = execSync('git log @{upstream}..HEAD --oneline', opts).trim();
      if (log) commits = log.split('\n').filter(Boolean);
    } catch {
      // Cannot resolve any upstream from this worktree (branch deleted, etc.).
      // If origin/main is reachable at all, treat as clean — there is nothing
      // to compare to. Otherwise fail safe.
      try {
        execSync('git rev-parse --verify --quiet origin/main', opts);
        return { unpushed: false, commits: [] };
      } catch {
        return { unpushed: true, commits: ['(unable to determine remote state)'] };
      }
    }
  }
  if (commits.length === 0) return { unpushed: false, commits: [] };

  // QF-20260424-803: filter out commits already on origin/main (by patch-id
  // for squash-merge cases, then by ancestor as a belt-and-suspenders check).
  try {
    const cherry = execSync('git cherry origin/main HEAD', opts).trim();
    if (cherry) {
      const truly = cherry.split('\n').filter(l => l.startsWith('+ ')).map(l => l.slice(2).trim()).filter(Boolean);
      if (truly.length === 0) return { unpushed: false, commits: [] };
      return { unpushed: true, commits: truly };
    }
  } catch { /* fall through to per-commit ancestor check */ }

  const truly = commits.filter(line => {
    const sha = line.split(/\s+/)[0];
    try {
      execSync(`git merge-base --is-ancestor ${sha} origin/main`, opts);
      return false; // ancestor of origin/main -> already shipped
    } catch {
      return true; // genuinely not on origin/main
    }
  });
  if (truly.length === 0) return { unpushed: false, commits: [] };
  return { unpushed: true, commits: truly };
}

/**
 * Archive a worktree to .worktrees/_archive/ instead of deleting it.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001 (FR-3, FR-4)
 */
function archiveWorktree(wtPath, sdKey) {
  const mainRepoPath = getMainRepoPath(getWorktreeMetadata(wtPath), wtPath);
  if (!mainRepoPath) return { archived: false, reason: 'cannot_resolve_main_repo' };

  const archiveDir = path.join(mainRepoPath, '.worktrees', '_archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `${sdKey || path.basename(wtPath)}-${timestamp}`;
  const archivePath = path.join(archiveDir, archiveName);

  try {
    fs.renameSync(wtPath, archivePath);
  } catch {
    // Cross-device move on Windows — copy then delete
    fs.cpSync(wtPath, archivePath, { recursive: true });
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  // Prune git worktree references for the moved path
  try {
    execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
  } catch { /* best effort */ }

  const logEntry = { event: 'worktree.archived', sdKey, reason: 'code_loss_prevention', archivePath, timestamp: new Date().toISOString() };
  console.warn(JSON.stringify(logEntry));

  return { archived: true, archivePath };
}

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
  // QF-20260404-445: Warn if CWD is inside the worktree about to be deleted.
  // On Windows, deleting the CWD directory corrupts the shell — subsequent
  // commands (handoffs, node module resolution) fail with ERR_MODULE_NOT_FOUND.
  const cwd = process.cwd().replace(/\\/g, '/');
  const normalized = wtPath.replace(/\\/g, '/');
  if (cwd.startsWith(normalized)) {
    const result = cleanupWorktreeByPath(wtPath);
    return { ...result, warning: 'CWD_INSIDE_TARGET', hint: 'cd to main repo BEFORE running cleanup to avoid shell corruption' };
  }
  return cleanupWorktreeByPath(wtPath);
}

/**
 * Clean up a worktree by its absolute path.
 * Used by --sdKey mode after resolving from DB/scan.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: checks for unpushed commits before deletion.
 */
function cleanupWorktreeByPath(wtPath) {
  if (!fs.existsSync(wtPath)) return { cleaned: false, reason: 'worktree_not_found' };
  const meta = getWorktreeMetadata(wtPath);
  const mainRepoPath = getMainRepoPath(meta, wtPath);
  if (!mainRepoPath) return { cleaned: false, reason: 'cannot_resolve_main_repo' };
  const sdKey = meta?.workKey || meta?.sdKey || path.basename(wtPath);

  // SD-MAN-INFRA-WORKTREE-CODE-LOSS-001 (FR-2): Block cleanup if unpushed commits
  const { unpushed, commits } = hasUnpushedCommits(wtPath);
  if (unpushed) {
    const archive = archiveWorktree(wtPath, sdKey);
    return { cleaned: false, reason: 'unpushed_commits', commits, ...archive, mainRepoPath, workKey: sdKey };
  }

  try {
    execSync(`git worktree remove --force "${wtPath}"`, { cwd: mainRepoPath, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
      execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
    }
  }
  return { cleaned: true, mainRepoPath, workKey: sdKey };
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

export { isInsideWorktree, getWorktreeMetadata, getMainRepoPath, cleanupCurrentWorktree, cleanupBySDKey, cleanupWorktreeByPath, hasUnpushedCommits, archiveWorktree };
