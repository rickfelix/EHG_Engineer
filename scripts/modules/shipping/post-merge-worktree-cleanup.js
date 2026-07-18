import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { safeRecursiveRm, safeRecursiveCp, removeWorktreeViaGit } from '../../../lib/worktree-manager.js';
import { writeReapEligibleMarker } from '../../../lib/worktree-reaper/reap-eligible-marker.js';
import { detectOrphanWorktreeFromMerge } from '../../../lib/exec-context-guard.mjs';

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
 * Schema-correct VIEW projection (v_active_sessions does not expose
 * worktree_path or last_heartbeat_at — QF-20260510-WT-CLAIM-PROTECT-001 P0
 * lesson): session_id, sd_key, qf_id, current_branch, heartbeat_at,
 * computed_status. worktree_path is read by the SECOND query below from the
 * claude_sessions BASE TABLE, where the column exists (QF-20260712-249
 * live-cwd guard). FAIL-LOUD on any postgrest error. Fail-soft only when no
 * supabase client can be constructed at all (transport-level absence).
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

  const targetPath = _normalizePath(wtPath);
  if (!targetPath) return null;
  const worktreesDir = _normalizePath(path.join(mainRepoPath || '', '.worktrees'));
  const now = Date.now();

  for (const row of data || []) {
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

  // QF-20260712-249 (signal fbe71ad2) — LIVE-CWD GUARD. All three candidates above
  // derive from the CLAIM (sd_key / qf_id / current_branch): a session whose claim
  // released moments ago but is still cwd'd in the worktree running its
  // post-completion tail matches none of them (and may be absent from
  // v_active_sessions entirely), so cleanup destroyed the directory under its feet —
  // the orphaned shell then resolved git ops to the shared main root and one
  // `git checkout -b` hijacked HEAD for 5+ concurrent sessions. claude_sessions
  // (BASE TABLE — v_active_sessions does not expose worktree_path; the QF-20260510
  // schema-projection lesson applies to the VIEW only, the column verified present
  // on the base table) records where each live session actually lives; match on it
  // directly. Same fail-loud doctrine as the claim query above.
  // NB: qf_id is a VIEW-only column (v_active_sessions joins it in) — the base table
  // does not have it; selecting it here would 42703 and degrade every cleanup to the
  // fail-safe archive path. Schema verified against information_schema 2026-07-12.
  const { data: pathRows, error: pathError } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_key, current_branch, heartbeat_at, worktree_path')
    .in('status', ['active', 'idle'])
    .gte('heartbeat_at', new Date(now - heartbeatThresholdMs).toISOString())
    .not('worktree_path', 'is', null);

  if (pathError) {
    throw new Error(
      `[post-merge-worktree-cleanup] live-cwd guard query failed: ${pathError.message}` +
      (pathError.code ? ` (code=${pathError.code})` : '') +
      " — refusing to proceed; silent failure here destroys a live session's working directory."
    );
  }

  for (const row of pathRows || []) {
    if (_normalizePath(row.worktree_path) === targetPath) {
      return {
        session_id: row.session_id,
        sd_key: row.sd_key,
        qf_id: null, // base table carries no qf_id; the path match itself is the evidence
        current_branch: row.current_branch,
        heartbeat_at: row.heartbeat_at,
        matched_by: 'worktree_path'
      };
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
  // SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 (FR-2/FR-3): the former
  // QF-20260404-445 warn-and-proceed branch here DELETED the resident
  // worktree anyway (Golf-4 self-reap, 2026-07-11 20:09Z). Cwd-inside-target
  // is now a HARD refusal: mark reap-eligible and hand off to the scheduled
  // reaper, which collects once residency clears. Deleting the CWD corrupts
  // the resident shell (ERR_MODULE_NOT_FOUND on every subsequent command).
  const cwd = process.cwd().replace(/\\/g, '/');
  const normalized = wtPath.replace(/\\/g, '/');
  if (cwd === normalized || cwd.startsWith(normalized + '/')) {
    const meta = getWorktreeMetadata(wtPath);
    const marker = writeReapEligibleMarker(wtPath, { sd_key: meta?.workKey || meta?.sdKey || path.basename(wtPath) });
    return {
      cleaned: false,
      reason: 'REAP_BLOCKED_RESIDENT',
      marked: marker.written,
      hint: 'worktree marked reap-eligible; the scheduled reaper collects it once no session is resident',
    };
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
    // P0 fix (feedback 65ef1075, Golf-3 2026-07-17): on unknown DB state we fail SAFE
    // by treating the worktree as if a live claim is held — which means LEAVE IT
    // COMPLETELY IN PLACE. The prior behavior archived here, but archiveWorktree()
    // MOVES the tree (fs.renameSync → _archive) + `git worktree prune`, destroying a
    // live session's working directory out from under it. Not touching it preserves
    // both the work AND the live session; a genuinely-dead worktree is reaped later
    // via the stale-heartbeat path. Archiving is only correct on the actual
    // delete-abort path (unpushed_commits below), where no live session is present.
    console.warn(JSON.stringify({
      event: 'worktree.cleanup_blocked_by_db_error',
      wtPath, sdKey, error: err.message,
      action: 'left_in_place',
      timestamp: new Date().toISOString()
    }));
    return { cleaned: false, reason: 'db_error_fail_safe', error: err.message, mainRepoPath, workKey: sdKey };
  }
  if (claim) {
    // P0 fix (feedback 65ef1075, Golf-3 2026-07-17): a live worker still holds the
    // claim (fresh heartbeat) or is cwd'd here (live-cwd guard) → LEAVE THE WORKTREE
    // COMPLETELY IN PLACE. Do NOT archive: archiveWorktree() moves the tree to
    // _archive and prunes it from git, which yanked the active session's working dir
    // out from under it (witnessed: dir gone from disk + `git worktree list`, copy in
    // _archive, cleaned:false reported all the same). For a live claim there is nothing
    // to "preserve" by moving — the owner is alive and will clean up / ship normally.
    const blockedEntry = {
      event: 'worktree.cleanup_blocked_by_claim',
      wtPath,
      sdKey,
      claim,
      action: 'left_in_place',
      timestamp: new Date().toISOString()
    };
    console.warn(JSON.stringify(blockedEntry));
    return { cleaned: false, reason: 'active_claim_protect', claim, mainRepoPath, workKey: sdKey };
  }

  // SD-MAN-INFRA-WORKTREE-CODE-LOSS-001 (FR-2): Block cleanup if unpushed commits
  const { unpushed, commits } = hasUnpushedCommits(wtPath);
  if (unpushed) {
    const archive = archiveWorktree(wtPath, sdKey);
    return { cleaned: false, reason: 'unpushed_commits', commits, ...archive, mainRepoPath, workKey: sdKey };
  }

  // QF-20260511-446: pre-unlink node_modules symlink so git doesn't follow it
  // and wipe main repo's node_modules (MSYS-symlink-on-Windows wipe vector).
  const gitRemove = removeWorktreeViaGit(wtPath, mainRepoPath, { allowFail: true });
  // SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001: a residency BLOCK must never be
  // force-deleted around via the fs fallback — mark reap-eligible instead.
  if (gitRemove.blocked) {
    const marker = writeReapEligibleMarker(wtPath, { sd_key: sdKey });
    return { cleaned: false, reason: gitRemove.reason, marked: marker.written, mainRepoPath, workKey: sdKey };
  }
  if (!gitRemove.ok && fs.existsSync(wtPath)) {
    safeRecursiveRm(wtPath);
    execSync('git worktree prune', { cwd: mainRepoPath, stdio: 'pipe' });
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

/**
 * SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001 (FR-2): wire the previously-dead
 * detectOrphanWorktreeFromMerge detector to a real consumer. Given the stdout
 * of a `gh pr merge --delete-branch` (or gh-merge-safe.mjs) run, detect the
 * deleted branch, map it to its worktree dir, and route that orphaned worktree
 * through the claim-aware cleanupWorktreeByPath (archive-on-live-claim /
 * archive-on-unpushed / else clean remove). Resolves the writer/consumer
 * asymmetry (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001): the detector was
 * shipped by SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 FR-5 but never consumed.
 *
 * @param {string} mergeOutput - stdout/stderr from the merge command
 * @param {object} [options] - forwarded to cleanupWorktreeByPath (supabase,
 *   heartbeatThresholdMs); options.mainRepoPath overrides repo-root resolution.
 * @returns {Promise<object>} cleanup result annotated with {branch, candidate, source}
 */
async function cleanupOrphanFromMergeOutput(mergeOutput, options = {}) {
  const { detected, branch } = detectOrphanWorktreeFromMerge(mergeOutput);
  if (!detected || !branch) {
    return { cleaned: false, reason: 'no_orphan_detected' };
  }

  // Resolve the main repo root (strip any /.worktrees/<key> suffix so this works
  // whether invoked from the main repo or a sibling worktree).
  let mainRepoPath = options.mainRepoPath || null;
  if (!mainRepoPath) {
    try {
      const top = gitExec('git rev-parse --show-toplevel').replace(/\\/g, '/');
      const idx = top.indexOf('/.worktrees/');
      mainRepoPath = idx === -1 ? top : top.slice(0, idx);
    } catch {
      return { cleaned: false, reason: 'cannot_resolve_main_repo', branch };
    }
  }

  // Map branch -> worktree dir (mirrors hasActiveClaimOnBranch candidate logic).
  const base = _branchToBasename(branch) || String(branch).replace(/^refs\/heads\//, '');
  if (!base) return { cleaned: false, reason: 'cannot_map_branch_to_worktree', branch };
  const worktreesDir = path.join(mainRepoPath, '.worktrees');
  const candidate = /^QF-/.test(base)
    ? path.join(worktreesDir, 'qf', base)
    : path.join(worktreesDir, base);

  if (!fs.existsSync(candidate)) {
    // Branch was deleted but no orphaned worktree dir remains — nothing to clean.
    return { cleaned: false, reason: 'orphan_worktree_not_present', branch, candidate };
  }

  const result = await cleanupWorktreeByPath(candidate, options);
  return { ...result, branch, candidate, source: 'merge_output_detector' };
}

// CLI entry point
const _e = process.argv[1] || '', isMain = _e && (import.meta.url === `file://${_e}` ||
  import.meta.url === `file:///${_e.replace(/\\/g, '/')}`);

if (isMain) {
  // Parse --sdKey / --merge-output arguments
  const args = process.argv.slice(2);
  let sdKey = null;
  let mergeOutputArg = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sdKey' && args[i + 1]) { sdKey = args[++i]; }
    else if (args[i] === '--merge-output' && args[i + 1]) { mergeOutputArg = args[++i]; }
  }

  const emit = (p) => p.then(result => {
    process.stdout.write(JSON.stringify(result));
  }).catch(err => {
    process.stdout.write(JSON.stringify({ cleaned: false, reason: 'error', error: err.message }));
  });

  if (mergeOutputArg !== null) {
    // FR-2: detect-orphan-from-merge mode. '-' reads stdin; otherwise literal.
    const mergeOutput = mergeOutputArg === '-' ? fs.readFileSync(0, 'utf8') : mergeOutputArg;
    emit(cleanupOrphanFromMergeOutput(mergeOutput));
  } else if (sdKey) {
    // FR-5: External caller mode - resolve worktree from DB/scan and clean up
    emit(cleanupBySDKey(sdKey));
  } else {
    // Original mode - clean up current worktree (if running inside one)
    emit(cleanupCurrentWorktree());
  }
}

export { isInsideWorktree, getWorktreeMetadata, getMainRepoPath, cleanupCurrentWorktree, cleanupBySDKey, cleanupWorktreeByPath, hasUnpushedCommits, archiveWorktree, hasActiveClaimOnBranch, cleanupOrphanFromMergeOutput };
