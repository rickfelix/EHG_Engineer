import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { safeRecursiveRm, safeRecursiveCp } from '../../../lib/worktree-manager.js';

// Quick-fix QF-20260211-111: Post-merge worktree cleanup for /ship
// FR-5: Added --sdKey support for external callers (SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001)
// SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: Pre-cleanup commit check + archive-on-conflict
// SD-FDBK-ENH-SESSION-WORKTREE-CLEANUP-001: junction-safe rm/cp prevents node_modules wipe on Windows
// SD-FDBK-INFRA-POST-MERGE-WORKTREE-001: claim-aware guard mirrors PR #3677 worktree-reaper loadClaimMap
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
    // Cross-device move on Windows — copy then delete (junction-safe to avoid wiping shared node_modules)
    safeRecursiveCp(wtPath, archivePath, { recursive: true });
    safeRecursiveRm(wtPath);
  }

  // Prune git worktree references for the moved path
  try {
    execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
  } catch { /* best effort */ }

  const logEntry = { event: 'worktree.archived', sdKey, reason: 'code_loss_prevention', archivePath, timestamp: new Date().toISOString() };
  console.warn(JSON.stringify(logEntry));

  return { archived: true, archivePath };
}

// SD-FDBK-INFRA-POST-MERGE-WORKTREE-001 helpers — claim-aware guard.
// Mirrors PR #3677 (scripts/worktree-reaper.mjs:233-280, loadClaimMap) so the
// post-merge cleanup path inherits the same active-claim protection as the
// reaper. Witnessed P0 incident: SD-LEO-INFRA-POST-MERGE-AUTO-001 session
// 3992f7cc had its gitdir removed mid-EXEC, causing PR #3670 to be tied to the
// wrong head_ref → reopened as PR #3674. PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 18th-witness.
function _normalizePath(p) {
  if (!p) return null;
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

function _branchToBasename(branch) {
  if (!branch) return null;
  const m = String(branch).match(/^(?:refs\/heads\/)?(?:feat|qf|fix|chore|hotfix)\/(.+)$/);
  return m ? m[1] : null;
}

function _getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch { return null; }
}

/**
 * Check whether any active claude_session is currently claiming this worktree.
 *
 * SD-FDBK-INFRA-POST-MERGE-WORKTREE-001 — leaf-level guard preventing the
 * cleanup from destroying a worktree another session is actively using.
 *
 * Schema-correct projection (do NOT add worktree_path or last_heartbeat_at —
 * QF-20260510-WT-CLAIM-PROTECT-001 P0 lesson): session_id, sd_key, qf_id,
 * current_branch, heartbeat_at, computed_status. FAIL-LOUD on any postgrest
 * error. Fail-soft only when no supabase client can be constructed at all
 * (transport-level absence).
 *
 * Returns the matching claim {session_id, sd_key, qf_id, current_branch,
 * heartbeat_at} or null.
 */
async function hasActiveClaimOnBranch(wtPath, mainRepoPath, options = {}) {
  const {
    supabase: injected,
    heartbeatThresholdMs = 2 * 60 * 60 * 1000
  } = options;

  const supabase = injected ?? _getSupabaseServiceClient();
  if (!supabase) {
    console.warn('[post-merge-worktree-cleanup] hasActiveClaimOnBranch: no supabase client — skipping claim-protect (fail-soft)');
    return null;
  }

  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, qf_id, current_branch, heartbeat_at, computed_status')
    .eq('computed_status', 'active');

  if (error) {
    throw new Error(
      `[post-merge-worktree-cleanup] hasActiveClaimOnBranch query failed: ${error.message}` +
      (error.code ? ` (code=${error.code})` : '') +
      ' — refusing to proceed; silent failure here destroys actively-claimed worktrees.'
    );
  }
  if (!data || data.length === 0) return null;

  const targetPath = _normalizePath(wtPath);
  if (!targetPath) return null;
  const worktreesDir = _normalizePath(path.join(mainRepoPath || '', '.worktrees'));
  const now = Date.now();

  for (const row of data) {
    if (row.heartbeat_at) {
      const hb = new Date(row.heartbeat_at).getTime();
      if (!Number.isFinite(hb) || now - hb > heartbeatThresholdMs) continue;
    } else {
      continue; // null heartbeat → exclude defensively (database-agent G6)
    }

    const candidates = [];
    if (row.sd_key && worktreesDir) candidates.push(`${worktreesDir}/${row.sd_key}`);
    if (row.qf_id && worktreesDir) candidates.push(`${worktreesDir}/qf/${row.qf_id}`);
    const branchBase = _branchToBasename(row.current_branch);
    if (branchBase && worktreesDir) {
      if (/^QF-/.test(branchBase)) candidates.push(`${worktreesDir}/qf/${branchBase}`);
      else candidates.push(`${worktreesDir}/${branchBase}`);
    }

    for (const candidate of candidates) {
      if (_normalizePath(candidate) === targetPath) {
        return {
          session_id: row.session_id,
          sd_key: row.sd_key,
          qf_id: row.qf_id,
          current_branch: row.current_branch,
          heartbeat_at: row.heartbeat_at
        };
      }
    }
  }
  return null;
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

async function cleanupCurrentWorktree(options = {}) {
  if (!isInsideWorktree()) return { cleaned: false, reason: 'not_in_worktree' };
  const wtPath = gitExec('git rev-parse --show-toplevel');
  // QF-20260404-445: Warn if CWD is inside the worktree about to be deleted.
  // On Windows, deleting the CWD directory corrupts the shell — subsequent
  // commands (handoffs, node module resolution) fail with ERR_MODULE_NOT_FOUND.
  const cwd = process.cwd().replace(/\\/g, '/');
  const normalized = wtPath.replace(/\\/g, '/');
  if (cwd.startsWith(normalized)) {
    const result = await cleanupWorktreeByPath(wtPath, options);
    return { ...result, warning: 'CWD_INSIDE_TARGET', hint: 'cd to main repo BEFORE running cleanup to avoid shell corruption' };
  }
  return cleanupWorktreeByPath(wtPath, options);
}

/**
 * Clean up a worktree by its absolute path.
 * Used by --sdKey mode after resolving from DB/scan.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: checks for unpushed commits before deletion.
 * SD-FDBK-INFRA-POST-MERGE-WORKTREE-001: claim-protect runs FIRST — if any
 * active claude_session is on this worktree's branch (matched via sd_key /
 * qf_id / branch-base), archive instead of delete. Static-guard test pins
 * the ordering: hasActiveClaimOnBranch must precede hasUnpushedCommits and
 * the destructive `git worktree remove`.
 */
async function cleanupWorktreeByPath(wtPath, options = {}) {
  if (!fs.existsSync(wtPath)) return { cleaned: false, reason: 'worktree_not_found' };
  const meta = getWorktreeMetadata(wtPath);
  const mainRepoPath = getMainRepoPath(meta, wtPath);
  if (!mainRepoPath) return { cleaned: false, reason: 'cannot_resolve_main_repo' };
  const sdKey = meta?.workKey || meta?.sdKey || path.basename(wtPath);

  // SD-FDBK-INFRA-POST-MERGE-WORKTREE-001 (FR-2 + R-6 mitigation): claim-protect
  // BEFORE any destructive op. Witnessed P0: SD-LEO-INFRA-POST-MERGE-AUTO-001
  // session 3992f7cc had its gitdir wiped mid-EXEC → PR #3670 wrong head_ref.
  // R-6: hasActiveClaimOnBranch FAIL-LOUD throws on PostgrestError. Catch here
  // and translate to a fail-SAFE result (treat unknown DB state as if a claim
  // is held). This keeps the unit-test signal at the helper while preventing
  // an uncaught throw from escaping /ship CLI on a transient DB blip.
  let claim;
  try {
    claim = await hasActiveClaimOnBranch(wtPath, mainRepoPath, options);
  } catch (err) {
    const archive = archiveWorktree(wtPath, sdKey);
    console.warn(JSON.stringify({
      event: 'worktree.cleanup_blocked_by_db_error',
      wtPath, sdKey, error: err.message,
      archivePath: archive.archivePath,
      timestamp: new Date().toISOString()
    }));
    return { cleaned: false, reason: 'db_error_fail_safe', error: err.message, ...archive, mainRepoPath, workKey: sdKey };
  }
  if (claim) {
    const archive = archiveWorktree(wtPath, sdKey);
    const blockedEntry = {
      event: 'worktree.cleanup_blocked_by_claim',
      wtPath,
      sdKey,
      claim,
      archivePath: archive.archivePath,
      timestamp: new Date().toISOString()
    };
    console.warn(JSON.stringify(blockedEntry));
    return { cleaned: false, reason: 'active_claim_protect', claim, ...archive, mainRepoPath, workKey: sdKey };
  }

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
      safeRecursiveRm(wtPath);
      execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
    }
  }
  return { cleaned: true, mainRepoPath, workKey: sdKey };
}

/**
 * Resolve worktree for an SD key using the central resolver, then clean it up.
 * This allows /ship to clean up worktrees when NOT running inside one.
 */
async function cleanupBySDKey(sdKey, options = {}) {
  try {
    const { resolve } = await import('../../resolve-sd-workdir.js');
    const repoRoot = gitExec('git rev-parse --show-toplevel');
    const result = await resolve(sdKey, 'ship', repoRoot);

    if (result.success && result.worktree?.exists && result.worktree.path) {
      const cleanup = await cleanupWorktreeByPath(result.worktree.path, options);
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
    cleanupCurrentWorktree().then(result => {
      process.stdout.write(JSON.stringify(result));
    }).catch(err => {
      process.stdout.write(JSON.stringify({ cleaned: false, reason: 'error', error: err.message }));
    });
  }
}

export { isInsideWorktree, getWorktreeMetadata, getMainRepoPath, cleanupCurrentWorktree, cleanupBySDKey, cleanupWorktreeByPath, hasUnpushedCommits, archiveWorktree, hasActiveClaimOnBranch };
