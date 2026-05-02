/**
 * Worktree Manager - Multi-WorkType Isolation
 * SD-LEO-INFRA-REFACTOR-WORKTREE-MANAGER-001
 * SD-LEO-INFRA-EXTEND-WORKTREE-ISOLATION-001
 *
 * Manages git worktree lifecycle keyed by work identifier.
 * Supports SD, QF, and ad-hoc work types.
 * Worktrees live at .worktrees/<workType>/<workKey>/ for cross-session persistence.
 * Legacy flat layout (.worktrees/<sdKey>/) is still supported.
 *
 * Legacy session-keyed API is supported via deprecation adapter.
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { enforceWorktreeQuota } from './worktree-quota.js';

const WORKTREES_DIR = '.worktrees';

// SD-LEO-INFRA-START-WORKTREE-BRANCH-001: default base ref for new worktree branches.
// Without an explicit base, `git worktree add -b` forks from the main repo's current
// HEAD, which silently inherits commits from whatever branch the operator was on
// (docs branches, stale feat branches, unmerged QF branches). Override via env var
// LEO_WORKTREE_BASE_REF (e.g., origin/release-2026-q2 for release-branch experiments).
const DEFAULT_WORKTREE_BASE_REF = 'origin/main';

/**
 * Thrown when fetching the configured worktree base ref fails. Callers
 * (sd-start.js, fix-agent.js) translate this to a deterministic refusal —
 * fail-closed is the whole point of the fix; falling back to current HEAD
 * IS the bug.
 */
export class WorktreeBaseFetchFailedError extends Error {
  constructor({ baseRef, gitOutput, exitCode }) {
    super(
      `Failed to fetch worktree base ref '${baseRef}'. ` +
      `Worktree creation refused (fail-closed). ` +
      `Verify network access to origin or set LEO_WORKTREE_BASE_REF.`
    );
    this.name = 'WorktreeBaseFetchFailedError';
    this.code = 'WORKTREE_BASE_FETCH_FAILED';
    this.baseRef = baseRef;
    this.gitOutput = gitOutput;
    this.exitCode = exitCode;
    this.cause = 'fetch_failed';
  }
}

/**
 * Thrown when reusing a branch that has drifted significantly behind the
 * configured base ref. Worktree open is refused — opening the worktree at a
 * stale fork-point and merging from there silently undoes intervening work
 * on origin. Operator must rebase, cherry-pick, or abandon the branch.
 * SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-2).
 */
export class WorktreeForkDriftError extends Error {
  constructor({ branch, baseRef, driftBehind, driftAhead, threshold, kind, sampleSubjects = [] }) {
    const sample = sampleSubjects.length
      ? `\n  Recently merged commits NOT in your branch (sample of ${sampleSubjects.length}):\n` +
        sampleSubjects.map(s => `    - ${s}`).join('\n')
      : '';
    const reasonLine = kind === 'hours'
      ? `Branch '${branch}' tip predates ${baseRef} by more than the configured ${threshold}h threshold (with ${driftBehind} commits behind).`
      : `Branch '${branch}' is ${driftBehind} commits behind ${baseRef} (threshold: ${threshold}).`;
    super(
      `${reasonLine} ` +
      `Reusing it would silently undo merged work.${sample}\n` +
      `\n  Remediation (pick one):\n` +
      `    1. Rebase: git checkout ${branch} && git fetch origin && git rebase ${baseRef}\n` +
      `    2. Cherry-pick: list your commits via 'git log ${baseRef}..${branch}', then cherry-pick each onto a fresh branch off ${baseRef}\n` +
      `    3. Abandon-and-reset: git branch -D ${branch} && rerun sd-start (recreates from ${baseRef})\n` +
      `\n  Override (NOT recommended for normal flow):\n` +
      `    LEO_FORK_DRIFT_THRESHOLD_COMMITS=<higher> LEO_FORK_DRIFT_THRESHOLD_HOURS=<higher> rerun the operation.`
    );
    this.name = 'WorktreeForkDriftError';
    this.code = 'WORKTREE_FORK_DRIFT';
    this.cause = 'fork_drift';
    this.branch = branch;
    this.baseRef = baseRef;
    this.driftBehind = driftBehind;
    this.driftAhead = driftAhead;
    this.threshold = threshold;
    this.kind = kind;
    this.sampleSubjects = sampleSubjects;
  }
}

/**
 * Resolve the base ref for new worktree branches. Reads env var at call time
 * (not at import) so test environments and ad-hoc overrides take effect.
 * @returns {string} Base ref, e.g. 'origin/main' or 'origin/release-2026-q2'
 */
export function resolveWorktreeBaseRef() {
  const fromEnv = process.env.LEO_WORKTREE_BASE_REF;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return DEFAULT_WORKTREE_BASE_REF;
}

/**
 * Fetch the configured base ref so the subsequent `git worktree add` sees an
 * up-to-date tip. Throws WorktreeBaseFetchFailedError on failure (fail-closed).
 * @param {string} repoRoot
 * @param {string} baseRef e.g. 'origin/main'
 */
export function fetchBaseRef(repoRoot, baseRef) {
  const slashIdx = baseRef.indexOf('/');
  if (slashIdx < 0) {
    throw new WorktreeBaseFetchFailedError({
      baseRef,
      gitOutput: `baseRef must be of the form '<remote>/<branch>'`,
      exitCode: -1
    });
  }
  const remote = baseRef.substring(0, slashIdx);
  const refName = baseRef.substring(slashIdx + 1);
  try {
    execSync(`git fetch ${remote} ${refName}`, {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    });
  } catch (err) {
    throw new WorktreeBaseFetchFailedError({
      baseRef,
      gitOutput: (err.stderr || err.stdout || err.message || '').toString(),
      exitCode: err.status ?? -1
    });
  }
}

/**
 * Read drift thresholds from env. SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-2).
 * Defaults: 5 commits, 24 hours.
 */
function resolveForkDriftThresholds() {
  const commitsRaw = process.env.LEO_FORK_DRIFT_THRESHOLD_COMMITS;
  const hoursRaw = process.env.LEO_FORK_DRIFT_THRESHOLD_HOURS;
  const commits = commitsRaw && /^\d+$/.test(commitsRaw) ? parseInt(commitsRaw, 10) : 5;
  const hours = hoursRaw && /^\d+$/.test(hoursRaw) ? parseInt(hoursRaw, 10) : 24;
  return { commits, hours };
}

/**
 * Compute commits-behind / commits-ahead of `branch` relative to `baseRef`.
 * Best-effort: failures from `git rev-list` (e.g., unreachable ref) treat the
 * counts as 0 to avoid blocking on transient git errors. The drift evaluator
 * decides whether the result warrants a block. SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-1).
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} baseRef e.g. 'origin/main'
 * @returns {{ driftBehind: number, driftAhead: number, branchTipAgeHours: number|null, sampleSubjects: string[] }}
 */
export function checkBranchForkDrift(repoRoot, branch, baseRef) {
  const execOpts = { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' };
  const result = { driftBehind: 0, driftAhead: 0, branchTipAgeHours: null, sampleSubjects: [] };
  try {
    const behind = execSync(`git rev-list --count ${branch}..${baseRef}`, execOpts).toString().trim();
    result.driftBehind = parseInt(behind, 10) || 0;
  } catch { /* unreachable ref → treat as 0; evaluator will not block */ }
  try {
    const ahead = execSync(`git rev-list --count ${baseRef}..${branch}`, execOpts).toString().trim();
    result.driftAhead = parseInt(ahead, 10) || 0;
  } catch { /* same — count failures fail-open */ }
  try {
    const ts = execSync(`git log -1 --format=%ct ${branch}`, execOpts).toString().trim();
    const epoch = parseInt(ts, 10);
    if (!Number.isNaN(epoch) && epoch > 0) {
      result.branchTipAgeHours = (Date.now() / 1000 - epoch) / 3600;
    }
  } catch { /* tip age is informational; missing is fine */ }
  if (result.driftBehind > 0) {
    try {
      const log = execSync(`git log --oneline --no-merges -5 ${branch}..${baseRef}`, execOpts).toString().trim();
      result.sampleSubjects = log ? log.split('\n').slice(0, 5) : [];
    } catch { /* sample is informational */ }
  }
  return result;
}

/**
 * Decide allow|block based on drift counts and configured thresholds. Returns
 * the threshold that decided the outcome so callers and tests can introspect.
 * Pure function (no I/O) — env reads are inside resolveForkDriftThresholds.
 */
export function evaluateDriftDecision(drift) {
  const thresholds = resolveForkDriftThresholds();
  if (drift.driftBehind >= thresholds.commits) {
    return { decision: 'block', threshold: thresholds.commits, kind: 'commits' };
  }
  if (drift.driftBehind > 0 && drift.branchTipAgeHours !== null && drift.branchTipAgeHours >= thresholds.hours) {
    return { decision: 'block', threshold: thresholds.hours, kind: 'hours' };
  }
  return { decision: 'allow', threshold: thresholds.commits, kind: 'none' };
}

/**
 * Best-effort audit-log writer for drift decisions. Lazy-imports supabase,
 * runs async without blocking the synchronous worktree path, and never
 * surfaces errors. SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-3).
 */
function recordDriftAuditEvent({ sdKey, branch, baseRef, drift, decision, threshold, kind }) {
  Promise.resolve().then(async () => {
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(url, key);
      await sb.from('audit_log').insert({
        action_type: 'worktree_fork_drift_check',
        metadata: {
          sdKey: sdKey || null,
          branch,
          baseRef,
          driftBehind: drift.driftBehind,
          driftAhead: drift.driftAhead,
          branchTipAgeHours: drift.branchTipAgeHours,
          threshold,
          kind,
          decision,
          sessionId: process.env.CLAUDE_SESSION_ID || null
        }
      });
    } catch { /* fail-open — audit must never block worktree creation */ }
  });
}

// Transient git errors that warrant retry (e.g., index.lock from concurrent git ops)
const TRANSIENT_GIT_PATTERNS = [
  /unable to create.*\.lock/i,
  /index\.lock.*exists/i,
  /cannot lock ref/i,
  /another git process seems to be running/i,
];

/**
 * Classify a git worktree error for actionable messaging.
 * @param {string} msg - Error message from git
 * @returns {{ transient: boolean, hint: string }}
 */
export function classifyWorktreeError(msg) {
  if (TRANSIENT_GIT_PATTERNS.some(p => p.test(msg))) {
    return { transient: true, hint: 'Git lock contention — another git operation is running. Retrying.' };
  }
  if (/already checked out/i.test(msg)) {
    return { transient: false, hint: 'Branch is checked out in another worktree. Run: git worktree list' };
  }
  if (/already exists/i.test(msg) && /not a valid path/i.test(msg)) {
    return { transient: false, hint: 'Stale worktree reference. Run: git worktree prune' };
  }
  if (/ENOSPC|no space/i.test(msg)) {
    return { transient: false, hint: 'Disk full — free space before retrying.' };
  }
  return { transient: false, hint: '' };
}

/**
 * Synchronous sleep using spawnSync (no async needed).
 * @param {number} ms - Milliseconds to sleep
 */
function sleepSync(ms) {
  if (process.platform === 'win32') {
    spawnSync('ping', ['-n', String(Math.ceil(ms / 1000) + 1), '127.0.0.1'], { stdio: 'ignore' });
  } else {
    spawnSync('sleep', [String(ms / 1000)], { stdio: 'ignore' });
  }
}

/**
 * Execute a git command with retry on transient failures.
 * @param {string} cmd - Shell command
 * @param {object} opts - execSync options
 * @param {{ maxRetries?: number, baseDelayMs?: number }} [retryOpts]
 * @returns {string} stdout
 */
function execSyncWithRetry(cmd, opts, { maxRetries = 3, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return execSync(cmd, opts);
    } catch (err) {
      lastErr = err;
      const msg = (err.stderr || err.message || '').toString();
      const { transient } = classifyWorktreeError(msg);
      if (!transient || attempt === maxRetries) break;
      // Exponential backoff: 500ms, 1s, 2s
      sleepSync(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

/** @typedef {'SD'|'QF'|'ADHOC'} WorkType */

/**
 * @typedef {Object} WorktreeResult
 * @property {'worktree'|'main-fallback'} mode - Whether a worktree was used or fell back to main
 * @property {string} path - Absolute path to working directory
 * @property {string} branch - Branch name
 * @property {WorkType} workType - Type of work
 * @property {string} workKey - Work identifier (SD key, QF ID, or ad-hoc token)
 * @property {boolean} [created] - Whether worktree was freshly created
 * @property {boolean} [reused] - Whether an existing worktree was reused
 * @property {string} [reason] - Reason for fallback (only when mode='main-fallback')
 */

// Rate-limit deprecation warnings to once per process
let _deprecationWarningEmitted = false;

// Regex: alphanumeric, hyphens, underscores only. Max 128 chars.
const SD_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validate an sdKey for filesystem safety.
 * Rejects path traversal characters, empty strings, and overly long keys.
 *
 * @param {string} sdKey
 * @throws {Error} with code INVALID_SD_KEY if invalid
 */
export function validateSdKey(sdKey) {
  if (!sdKey || typeof sdKey !== 'string') {
    const err = new Error('invalid sdKey: must be a non-empty string');
    err.code = 'INVALID_SD_KEY';
    throw err;
  }
  if (!SD_KEY_PATTERN.test(sdKey)) {
    const err = new Error(
      `invalid sdKey: "${sdKey}" contains disallowed characters. ` +
      'Only alphanumeric, hyphens, and underscores are allowed (max 128 chars).'
    );
    err.code = 'INVALID_SD_KEY';
    throw err;
  }
}

/**
 * SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001:
 * Post-condition verification for worktree creation. Confirms path appears
 * in `git worktree list --porcelain` and `.git` pointer file exists.
 * Bounded retry: 10 × 100ms (total 1s) for Windows metadata propagation.
 */
function verifyWorktreeRegisteredSync(worktreePath, repoRoot) {
  const expected = path.resolve(worktreePath).replace(/\\/g, '/');
  const maxAttempts = 10;
  const delayMs = 100;
  let lastListed = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const listed = execSync('git worktree list --porcelain', {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
      lastListed = listed
        .split('\n')
        .filter((l) => l.startsWith('worktree '))
        .map((l) => path.resolve(l.replace('worktree ', '').trim()).replace(/\\/g, '/'));

      if (lastListed.includes(expected)) {
        if (!fs.existsSync(path.join(worktreePath, '.git'))) {
          throw new Error(
            `git worktree add reported success but ${worktreePath} has no .git pointer. ` +
            `Remediation: rm -rf "${worktreePath}" && git worktree prune`
          );
        }
        return true;
      }
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
    }
    const deadline = Date.now() + delayMs;
    while (Date.now() < deadline) { /* spin */ }
  }

  const err = new Error(
    `Worktree post-condition failed: ${worktreePath} not in git worktree list after creation. ` +
    `Remediation: rm -rf "${worktreePath}" && git worktree prune`
  );
  err.errorCode = 'WORKTREE_POST_CONDITION_FAILED';
  throw err;
}

/**
 * SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-3):
 * Synchronous filesystem rollback with bounded retry. Used at the
 * verifyWorktreeRegisteredSync call sites to avoid leaving an orphan
 * directory when the post-condition check throws. Three attempts:
 * `git worktree remove --force` with backoff (100ms, 500ms, 2s) on
 * Windows file-lock errors; falls back to `fs.rmSync` if every attempt
 * fails.
 *
 * @param {string} worktreePath
 * @param {string} repoRoot
 * @param {object} [opts]
 * @param {number[]} [opts.delaysMs] - Override for the retry backoff sequence
 *                                     (kept short by default so tests can
 *                                     drive the path without long waits).
 * @returns {{ ok: boolean, attempts: number, lastError: string|null, fellBackToRmSync: boolean }}
 */
export function rollbackWorktreeFilesystemSync(worktreePath, repoRoot, opts = {}) {
  const delaysMs = Array.isArray(opts.delaysMs) ? opts.delaysMs : [100, 500, 2000];
  const maxAttempts = delaysMs.length;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      execSync(`git worktree remove --force "${worktreePath}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return { ok: true, attempts: attempt + 1, lastError: null, fellBackToRmSync: false };
    } catch (err) {
      lastError = err?.message || String(err);
      if (attempt < maxAttempts - 1) {
        const wait = delaysMs[attempt];
        const deadline = Date.now() + wait;
        while (Date.now() < deadline) { /* spin — sync caller, no sleep available */ }
      }
    }
  }

  // Step 2: brute-force directory removal if git worktree remove never succeeded.
  try {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Best-effort prune; orphan ref is a follow-up reaper concern.
    }
    return { ok: true, attempts: maxAttempts, lastError, fellBackToRmSync: true };
  } catch (rmErr) {
    return {
      ok: false,
      attempts: maxAttempts,
      lastError: `git worktree remove failed (${lastError}); fs.rmSync also failed: ${rmErr?.message || rmErr}`,
      fellBackToRmSync: true
    };
  }
}

/**
 * SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-3):
 * Full async rollback: filesystem cleanup via rollbackWorktreeFilesystemSync,
 * followed by clearWorktreeState through lib/lifecycle/worktree-state-writer.
 * Persistent filesystem failure emits a WORKTREE_ROLLBACK_DEFERRED row to
 * session_lifecycle_events and returns deferred=true; callers can continue
 * — the orphan sweep / worktree-quota reaper will pick it up later.
 *
 * Caller (e.g., sd-start.js after catching WORKTREE_POST_CONDITION_FAILED)
 * is expected to provide sessionId so the DB-side state can be cleared
 * atomically with the filesystem cleanup.
 *
 * @param {string} worktreePath
 * @param {string} sessionId            - claude_sessions.session_id (text PK)
 * @param {object} [opts]
 * @param {string} [opts.repoRoot]
 * @param {object} [opts.supabase]      - Injectable client; defaults to a fresh service-role client
 * @param {Error}  [opts.originalError] - The error that triggered the rollback (for telemetry)
 * @param {number[]} [opts.delaysMs]
 * @returns {Promise<{ ok: boolean, deferred: boolean, attempts: number, lastError: string|null }>}
 */
export async function rollbackWorktreeCreation(worktreePath, sessionId, opts = {}) {
  const repoRoot = opts.repoRoot || getRepoRoot();
  const fsResult = rollbackWorktreeFilesystemSync(worktreePath, repoRoot, { delaysMs: opts.delaysMs });

  // DB-side: clear partial state so a stale (sd_key, worktree_*) row never
  // outlives the failed creation.
  if (sessionId) {
    try {
      const { clearWorktreeState } = await import('./lifecycle/worktree-state-writer.mjs');
      await clearWorktreeState(sessionId, {
        supabase: opts.supabase,
        reason: 'rollback_post_condition_failed'
      });
    } catch {
      // DB clear is best-effort; the FR-5 CHECK constraint is the runtime guard.
    }
  }

  if (!fsResult.ok) {
    // Persistent failure — emit telemetry and let the caller continue.
    try {
      const { createSupabaseServiceClient } = await import('../scripts/lib/supabase-connection.js');
      const supabase = opts.supabase || await createSupabaseServiceClient('engineer');
      await supabase.from('session_lifecycle_events').insert({
        event_type: 'WORKTREE_ROLLBACK_DEFERRED',
        session_id: sessionId || null,
        reason: 'rollback_persistent_failure',
        metadata: {
          path: worktreePath,
          original_error: opts.originalError?.message || null,
          attempts_made: fsResult.attempts,
          last_error: fsResult.lastError
        }
      });
    } catch {
      // Audit emission is best-effort; never let a logging failure mask the
      // original rollback failure to the operator.
    }
    return { ok: false, deferred: true, attempts: fsResult.attempts, lastError: fsResult.lastError };
  }

  return { ok: true, deferred: false, attempts: fsResult.attempts, lastError: fsResult.lastError };
}

/**
 * Get the repository root (where .git lives).
 * When called from inside a worktree, navigates up past .worktrees/ to the
 * actual repo root. Without this, createWorktree() would nest worktrees
 * inside existing worktrees (e.g., .worktrees/SD-A/.worktrees/SD-B/).
 * @returns {string} Absolute path to repo root
 */
export function getRepoRoot() {
  let toplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const normalized = toplevel.replace(/\\/g, '/');
  const wtIdx = normalized.indexOf('/' + WORKTREES_DIR + '/');
  if (wtIdx >= 0) {
    toplevel = toplevel.substring(0, wtIdx);
  }
  return toplevel;
}

/**
 * Get the worktrees directory path
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string} Absolute path to .worktrees/
 */
export function getWorktreesDir(repoRoot) {
  const root = repoRoot || getRepoRoot();
  return path.join(root, WORKTREES_DIR);
}

/**
 * @deprecated Use getWorktreesDir instead
 */
export function getSessionsDir(repoRoot) {
  return getWorktreesDir(repoRoot);
}

/**
 * Create a git worktree keyed by SD.
 *
 * @param {Object} options
 * @param {string} [options.sdKey] - SD key (primary, used as directory name under .worktrees/)
 * @param {string} [options.session] - DEPRECATED: Session name. Maps to sdKey='session-<sanitized>'.
 * @param {string} options.branch - Branch to check out in the worktree
 * @param {boolean} [options.force=false] - Force recreate if exists with different branch
 * @param {string} [options.repoRoot] - SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Override repo root for venture repos
 * @returns {{ path: string, branch: string, sdKey: string, created: boolean, reused: boolean }}
 */
export function createWorktree({ sdKey, session, branch, force = false, repoRoot: repoRootOverride }) {
  // Resolve sdKey: explicit sdKey wins, then legacy session adapter
  const resolvedKey = resolveSdKey(sdKey, session);
  validateSdKey(resolvedKey);

  const repoRoot = repoRootOverride || getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);
  const worktreePath = path.join(worktreesDir, resolvedKey);

  // Ensure .worktrees/ directory exists
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    const existingBranch = getWorktreeBranch(worktreePath);

    if (existingBranch === branch) {
      return { path: worktreePath, branch, sdKey: resolvedKey, created: false, reused: true };
    }

    if (!force) {
      throw new Error(
        `Worktree '${resolvedKey}' already exists on branch '${existingBranch}'. ` +
        `Expected '${branch}'. Use --force to recreate or choose a different sdKey.`
      );
    }

    removeWorktree(resolvedKey);
  }

  // Check if branch exists (local or remote)
  const branchExists = branchExistsLocally(branch) || branchExistsRemotely(branch);

  // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: when creating a NEW branch, fork
  // explicitly from baseRef (default origin/main) so the worktree does not
  // silently inherit commits from whatever branch the main repo is on.
  // Re-claim path (branchExists) keeps existing semantics — the branch already
  // carries its own ref.
  const execOpts = { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' };
  let baseRef = null;
  if (branchExists) {
    // SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-1, FR-2, FR-3): existing local
    // branches may have been forked from a stale main HEAD days earlier.
    // Reusing them at the old fork-point is the destructive-merge bug: 1919
    // stale-fork deletions on SD-LEO-INFRA-LEO-INFRA-SESSION-001, 9184 on
    // SD-FDBK-ENH-SESSION-WORKTREE-CLEANUP-001 (both 2026-05-02). Fetch base ref,
    // measure drift, refuse if drift exceeds threshold.
    baseRef = resolveWorktreeBaseRef();
    fetchBaseRef(repoRoot, baseRef);
    const drift = checkBranchForkDrift(repoRoot, branch, baseRef);
    const { decision, threshold, kind } = evaluateDriftDecision(drift);
    recordDriftAuditEvent({ sdKey: resolvedKey, branch, baseRef, drift, decision, threshold, kind });
    logWorktreeEvent('worktree.fork_drift_detected', {
      sdKey: resolvedKey, branch, baseRef,
      driftBehind: drift.driftBehind, driftAhead: drift.driftAhead,
      branchTipAgeHours: drift.branchTipAgeHours, threshold, decision, kind
    });
    if (decision === 'block') {
      throw new WorktreeForkDriftError({
        branch, baseRef,
        driftBehind: drift.driftBehind,
        driftAhead: drift.driftAhead,
        threshold, kind,
        sampleSubjects: drift.sampleSubjects
      });
    }
    execSyncWithRetry(`git worktree add "${worktreePath}" "${branch}"`, execOpts);
  } else {
    baseRef = resolveWorktreeBaseRef();
    fetchBaseRef(repoRoot, baseRef);
    execSyncWithRetry(`git worktree add -b "${branch}" "${worktreePath}" "${baseRef}"`, execOpts);
  }

  // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001: Post-condition verify (parity)
  // SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-3): on POST_CONDITION_FAILED, run
  // synchronous filesystem rollback so we never leave an orphan directory.
  // DB-side state clear happens in the async caller (sd-start.js) via
  // rollbackWorktreeCreation.
  try {
    verifyWorktreeRegisteredSync(worktreePath, repoRoot);
  } catch (verifyErr) {
    if (verifyErr?.errorCode === 'WORKTREE_POST_CONDITION_FAILED') {
      const r = rollbackWorktreeFilesystemSync(worktreePath, repoRoot);
      verifyErr.rollback = r;
    }
    throw verifyErr;
  }

  // Write .worktree.json metadata
  const worktreeConfig = {
    sdKey: resolvedKey,
    expectedBranch: branch,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    repoRoot,
    baseRef
  };
  fs.writeFileSync(
    path.join(worktreePath, '.worktree.json'),
    JSON.stringify(worktreeConfig, null, 2)
  );

  // SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Propagate .env to worktree
  propagateEnvFile(repoRoot, worktreePath);

  return { path: worktreePath, branch, sdKey: resolvedKey, created: true, reused: false };
}

/**
 * Create a worktree for any work type (SD, QF, or ADHOC).
 * Returns a structured result with fallback semantics.
 *
 * @param {Object} options
 * @param {WorkType} options.workType - Type of work: 'SD', 'QF', or 'ADHOC'
 * @param {string} options.workKey - Identifier (SD key, QF ID, or ad-hoc token)
 * @param {string} [options.branch] - Branch name (auto-generated if not provided)
 * @param {boolean} [options.force=false] - Force recreate if exists with different branch
 * @param {string} [options.repoRoot] - SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Override repo root for venture repos
 * @returns {WorktreeResult}
 */
export function createWorkTypeWorktree({ workType, workKey, branch, force = false, repoRoot: repoRootOverride }) {
  if (!['SD', 'QF', 'ADHOC'].includes(workType)) {
    throw new Error(`Invalid workType: ${workType}. Must be SD, QF, or ADHOC`);
  }
  if (!workKey || typeof workKey !== 'string') {
    throw new Error('workKey must be a non-empty string');
  }

  const startTime = Date.now();
  const sanitizedKey = workKey.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 128);

  // Auto-generate branch if not provided
  const resolvedBranch = branch || generateBranchName(workType, sanitizedKey);

  // Determine worktree subdirectory based on work type
  const subDir = workType.toLowerCase(); // sd, qf, or adhoc
  const repoRoot = repoRootOverride || getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);

  // US-005: Hard cap on total worktree count to prevent unbounded growth.
  // SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001: parity fix — both quota call sites
  // now use the shared helper in lib/worktree-quota.js, which counts
  // git-registered worktrees (via `git worktree list --porcelain`) instead of
  // filesystem directories. Orphan directories no longer inflate the count.
  // Error contract (message text + errorCode WORKTREE_QUOTA_EXCEEDED) is
  // preserved by the helper. Non-quota errors (e.g., permission issues) are
  // swallowed here to match prior behavior and not block creation.
  try {
    enforceWorktreeQuota(repoRoot, worktreesDir);
  } catch (e) {
    if (e.errorCode === 'WORKTREE_QUOTA_EXCEEDED') throw e;
    // Ignore other errors (e.g., permission issues) — don't block creation
  }
  const worktreeDir = path.join(worktreesDir, subDir);
  const worktreePath = path.join(worktreeDir, sanitizedKey);

  // For SD type, also check legacy flat layout (.worktrees/<sdKey>/)
  if (workType === 'SD') {
    const legacyPath = path.join(worktreesDir, sanitizedKey);
    if (fs.existsSync(legacyPath) && !fs.existsSync(worktreePath)) {
      // Legacy worktree exists - reuse it
      const existingBranch = safeGetWorktreeBranch(legacyPath);
      logWorktreeEvent('worktree.reuse_legacy', { workType, workKey: sanitizedKey, path: legacyPath, durationMs: Date.now() - startTime });
      return {
        mode: 'worktree',
        path: legacyPath,
        branch: existingBranch || resolvedBranch,
        workType,
        workKey: sanitizedKey,
        created: false,
        reused: true
      };
    }
  }

  try {
    // Ensure subdirectory exists
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      const existingBranch = safeGetWorktreeBranch(worktreePath);

      if (!existingBranch) {
        // Invalid worktree - return fallback
        logWorktreeEvent('worktree.invalid', { workType, workKey: sanitizedKey, reason: 'cannot-resolve-HEAD', durationMs: Date.now() - startTime });
        return {
          mode: 'main-fallback',
          path: repoRoot,
          branch: resolvedBranch,
          workType,
          workKey: sanitizedKey,
          reason: 'invalid-worktree'
        };
      }

      if (existingBranch === resolvedBranch || !force) {
        logWorktreeEvent('worktree.reuse', { workType, workKey: sanitizedKey, mode: 'worktree', durationMs: Date.now() - startTime });
        return {
          mode: 'worktree',
          path: worktreePath,
          branch: existingBranch,
          workType,
          workKey: sanitizedKey,
          created: false,
          reused: true
        };
      }

      // Force recreate
      removeWorktree(path.relative(worktreesDir, worktreePath).replace(/\\/g, '/'));
    }

    // Create worktree (with retry on transient git lock contention)
    // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: parity fix with createWorktree —
    // new branches fork explicitly from resolved baseRef (default origin/main).
    const branchExists = branchExistsLocally(resolvedBranch) || branchExistsRemotely(resolvedBranch);
    const execOpts = { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' };
    let baseRef = null;

    if (branchExists) {
      // SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-1, FR-2, FR-3): drift check
      // (parity with createWorktree above). Same destructive-fork class.
      baseRef = resolveWorktreeBaseRef();
      fetchBaseRef(repoRoot, baseRef);
      const drift = checkBranchForkDrift(repoRoot, resolvedBranch, baseRef);
      const { decision, threshold, kind } = evaluateDriftDecision(drift);
      recordDriftAuditEvent({ sdKey: sanitizedKey, branch: resolvedBranch, baseRef, drift, decision, threshold, kind });
      logWorktreeEvent('worktree.fork_drift_detected', {
        workType, workKey: sanitizedKey, branch: resolvedBranch, baseRef,
        driftBehind: drift.driftBehind, driftAhead: drift.driftAhead,
        branchTipAgeHours: drift.branchTipAgeHours, threshold, decision, kind
      });
      if (decision === 'block') {
        throw new WorktreeForkDriftError({
          branch: resolvedBranch, baseRef,
          driftBehind: drift.driftBehind,
          driftAhead: drift.driftAhead,
          threshold, kind,
          sampleSubjects: drift.sampleSubjects
        });
      }
      execSyncWithRetry(`git worktree add "${worktreePath}" "${resolvedBranch}"`, execOpts);
    } else {
      baseRef = resolveWorktreeBaseRef();
      fetchBaseRef(repoRoot, baseRef);
      execSyncWithRetry(`git worktree add -b "${resolvedBranch}" "${worktreePath}" "${baseRef}"`, execOpts);
    }

    // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001: Post-condition verify (parity)
    // SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-3): wrap in synchronous rollback.
    // The outer try/catch (line ~527) falls back to main-fallback mode, so we
    // need filesystem cleanup BEFORE throwing into that fallback path.
    try {
      verifyWorktreeRegisteredSync(worktreePath, repoRoot);
    } catch (verifyErr) {
      if (verifyErr?.errorCode === 'WORKTREE_POST_CONDITION_FAILED') {
        const r = rollbackWorktreeFilesystemSync(worktreePath, repoRoot);
        verifyErr.rollback = r;
      }
      throw verifyErr;
    }

    // Write metadata file
    const metadataFile = path.join(worktreePath, '.ehg-session.json');
    fs.writeFileSync(metadataFile, JSON.stringify({
      workType,
      workKey: sanitizedKey,
      expectedBranch: resolvedBranch,
      createdAt: new Date().toISOString(),
      hostname: os.hostname()
    }, null, 2));

    // Also write .worktree.json for backward compatibility
    fs.writeFileSync(path.join(worktreePath, '.worktree.json'), JSON.stringify({
      sdKey: sanitizedKey,
      workType,
      workKey: sanitizedKey,
      expectedBranch: resolvedBranch,
      createdAt: new Date().toISOString(),
      hostname: os.hostname(),
      repoRoot
    }, null, 2));

    // SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Propagate .env to worktree
    propagateEnvFile(repoRoot, worktreePath);

    logWorktreeEvent('worktree.create', { workType, workKey: sanitizedKey, mode: 'worktree', baseRef, durationMs: Date.now() - startTime });

    return {
      mode: 'worktree',
      path: worktreePath,
      branch: resolvedBranch,
      workType,
      workKey: sanitizedKey,
      created: true,
      reused: false,
      baseRef
    };
  } catch (err) {
    // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: fail-closed on base-ref fetch.
    // The whole point of the fix is to refuse silent fallback when the base
    // ref cannot be confirmed — main-fallback would re-introduce the bug.
    if (err instanceof WorktreeBaseFetchFailedError) {
      logWorktreeEvent('worktree.base_fetch_failed', {
        workType, workKey: sanitizedKey, baseRef: err.baseRef,
        exitCode: err.exitCode, durationMs: Date.now() - startTime
      });
      throw err;
    }
    if (err instanceof WorktreeForkDriftError) {
      // SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-2): fail-closed on fork-drift.
      // Same rationale as WorktreeBaseFetchFailedError above — main-fallback
      // would silently re-introduce the destructive-merge bug we are guarding
      // against. Surface the typed error so callers can route to remediation.
      logWorktreeEvent('worktree.fork_drift_block', {
        workType, workKey: sanitizedKey, branch: err.branch,
        baseRef: err.baseRef, driftBehind: err.driftBehind, driftAhead: err.driftAhead,
        threshold: err.threshold, kind: err.kind, durationMs: Date.now() - startTime
      });
      throw err;
    }
    logWorktreeEvent('worktree.fallback', { workType, workKey: sanitizedKey, mode: 'main-fallback', reason: err.message, durationMs: Date.now() - startTime });

    return {
      mode: 'main-fallback',
      path: repoRoot,
      branch: resolvedBranch,
      workType,
      workKey: sanitizedKey,
      reason: err.message
    };
  }
}

/**
 * Generate a branch name based on work type and key.
 * @param {WorkType} workType
 * @param {string} workKey
 * @returns {string}
 */
function generateBranchName(workType, workKey) {
  switch (workType) {
    case 'SD': return `feat/${workKey}`;
    case 'QF': return `qf/${workKey}`;
    case 'ADHOC': return `adhoc/${workKey}`;
    default: return `work/${workKey}`;
  }
}

/**
 * Propagate .env file from repo root to worktree.
 * SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Worktrees need .env for Supabase connections.
 * Copies the file (symlinks unreliable on Windows).
 * @param {string} repoRoot - Repo root path
 * @param {string} worktreePath - Worktree destination path
 */
function propagateEnvFile(repoRoot, worktreePath) {
  const sourceEnv = path.join(repoRoot, '.env');
  const destEnv = path.join(worktreePath, '.env');
  try {
    if (fs.existsSync(sourceEnv) && !fs.existsSync(destEnv)) {
      fs.copyFileSync(sourceEnv, destEnv);
    }
  } catch (err) {
    // Non-fatal: log but don't fail worktree creation
    console.error(`Warning: Could not copy .env to worktree: ${err.message}`);
  }
}

/**
 * Safely get a worktree's current branch without throwing.
 * @param {string} worktreePath
 * @returns {string|null}
 */
function safeGetWorktreeBranch(worktreePath) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Emit a single-line JSON log for worktree operations.
 * @param {string} event
 * @param {Object} fields
 */
function logWorktreeEvent(event, fields = {}) {
  const entry = { event, timestamp: new Date().toISOString(), ...fields };
  console.error(JSON.stringify(entry));
}

/**
 * Symlink or junction node_modules into a worktree
 *
 * @param {string} worktreePath - Path to the worktree
 * @param {string} [repoRoot] - Optional repo root override
 */
export function symlinkNodeModules(worktreePath, repoRoot) {
  const root = repoRoot || getRepoRoot();
  const sourceModules = path.join(root, 'node_modules');
  const targetModules = path.join(worktreePath, 'node_modules');

  if (!fs.existsSync(sourceModules)) {
    throw new Error(
      'node_modules not found; run npm ci in repo root first'
    );
  }

  // Skip if already linked
  if (fs.existsSync(targetModules)) {
    try {
      const stat = fs.lstatSync(targetModules);
      if (stat.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(targetModules);
        if (path.resolve(path.dirname(targetModules), linkTarget) === path.resolve(sourceModules)) {
          return; // Already correctly linked
        }
      }
    } catch {
      // If we can't read the link, remove and recreate
    }
    fs.rmSync(targetModules, { recursive: true, force: true });
  }

  // On Windows, use junction (doesn't require elevation)
  // On Unix, use symlink
  if (process.platform === 'win32') {
    try {
      fs.symlinkSync(sourceModules, targetModules, 'junction');
    } catch (err) {
      throw new Error(
        `Failed to create junction for node_modules: ${err.message}. ` +
        'On Windows, ensure you have permission to create junctions or run as administrator.'
      );
    }
  } else {
    fs.symlinkSync(sourceModules, targetModules, 'dir');
  }
}

/**
 * Remove an SD worktree and deregister it from git.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: checks for unpushed commits before deletion.
 *
 * @param {string} sdKey - SD key identifying the worktree
 * @returns {{ removed: boolean, reason?: string, archivePath?: string } | undefined}
 */
export function removeWorktree(sdKey) {
  const repoRoot = getRepoRoot();
  const worktreePath = path.join(getWorktreesDir(repoRoot), sdKey);

  if (!fs.existsSync(worktreePath)) {
    return; // Already gone - idempotent
  }

  // SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: Block if unpushed commits exist
  try {
    const log = execSync('git log origin/main..HEAD --oneline', {
      cwd: worktreePath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (log) {
      const commits = log.split('\n').filter(Boolean);
      console.warn(`[worktree-manager] BLOCKED removal of ${sdKey}: ${commits.length} unpushed commit(s)`);
      const archiveResult = _archiveWorktreeDir(worktreePath, sdKey, repoRoot);
      return { removed: false, reason: 'unpushed_commits', commits, ...archiveResult };
    }
  } catch {
    // Cannot determine remote state — proceed cautiously with archive
    try {
      const log = execSync('git log @{upstream}..HEAD --oneline', {
        cwd: worktreePath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      if (log) {
        console.warn(`[worktree-manager] BLOCKED removal of ${sdKey}: unpushed commits (upstream check)`);
        const archiveResult = _archiveWorktreeDir(worktreePath, sdKey, repoRoot);
        return { removed: false, reason: 'unpushed_commits', ...archiveResult };
      }
    } catch {
      // No remote tracking — safe to proceed with normal removal
    }
  }

  try {
    execSync(`git worktree remove --force "${worktreePath}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch {
    // If git worktree remove fails, clean up manually
    fs.rmSync(worktreePath, { recursive: true, force: true });
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }
  return { removed: true };
}

/**
 * Archive a worktree directory to .worktrees/_archive/ for recovery.
 * SD-MAN-INFRA-WORKTREE-CODE-LOSS-001
 * @private
 */
function _archiveWorktreeDir(wtPath, sdKey, repoRoot) {
  const archiveDir = path.join(repoRoot, '.worktrees', '_archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(archiveDir, `${sdKey}-${timestamp}`);
  try {
    fs.renameSync(wtPath, archivePath);
  } catch {
    fs.cpSync(wtPath, archivePath, { recursive: true });
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
  try { execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' }); } catch { /* best effort */ }
  console.warn(JSON.stringify({ event: 'worktree.archived', sdKey, archivePath, timestamp: new Date().toISOString() }));
  return { archived: true, archivePath };
}

/**
 * Clean up an SD worktree on SD completion.
 * Aborts if uncommitted changes exist unless force is true.
 *
 * @param {string} sdKey - SD key identifying the worktree
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Force cleanup even with dirty worktree
 * @returns {{ cleaned: boolean, reason: string }}
 */
export function cleanupWorktree(sdKey, { force = false } = {}) {
  validateSdKey(sdKey);
  const repoRoot = getRepoRoot();
  const worktreePath = path.join(getWorktreesDir(repoRoot), sdKey);

  if (!fs.existsSync(worktreePath)) {
    return { cleaned: false, reason: 'worktree_not_found' };
  }

  // Check for uncommitted changes
  if (!force) {
    try {
      const status = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (status.length > 0) {
        console.warn(`[worktree-manager] Cleanup aborted for ${sdKey}: uncommitted changes detected`);
        // SD-MAN-INFRA-WORKTREE-CODE-LOSS-001: archive dirty worktrees
        const archiveResult = _archiveWorktreeDir(worktreePath, sdKey, repoRoot);
        return { cleaned: false, reason: 'dirty_worktree', ...archiveResult };
      }
    } catch {
      // If git status fails, the worktree may be corrupt - proceed with cleanup
    }
  }

  console.info(`[worktree-manager] Cleanup started for sdKey=${sdKey}`);
  removeWorktree(sdKey);

  // Verify removal
  const porcelain = execSync('git worktree list --porcelain', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const stillExists = porcelain.includes(worktreePath);

  if (stillExists) {
    console.warn(`[worktree-manager] Worktree ${sdKey} still listed after removal`);
    return { cleaned: false, reason: 'removal_incomplete' };
  }

  return { cleaned: true, reason: 'success' };
}

/**
 * List all active SD worktrees.
 *
 * @returns {Array<{ sdKey: string, path: string, branch: string, exists: boolean }>}
 */
export function listWorktrees() {
  const repoRoot = getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);

  if (!fs.existsSync(worktreesDir)) {
    return [];
  }

  const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const wtPath = path.join(worktreesDir, e.name);
      const configPath = path.join(wtPath, '.worktree.json');
      // Also check legacy .session.json
      const legacyConfigPath = path.join(wtPath, '.session.json');
      let branch = null;
      let exists = true;

      // Try .worktree.json first, then legacy .session.json
      for (const cfgPath of [configPath, legacyConfigPath]) {
        if (branch) break;
        if (fs.existsSync(cfgPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            branch = config.expectedBranch;
          } catch {
            // Fall through
          }
        }
      }

      // Validate it's a real worktree
      try {
        branch = branch || getWorktreeBranch(wtPath);
      } catch {
        exists = false;
      }

      return {
        sdKey: e.name,
        path: wtPath,
        branch: branch || 'unknown',
        exists
      };
    });
}

/**
 * Resolve expected branch for a working directory.
 * Used by branch guard to determine what branch a worktree should be on.
 *
 * Resolution order:
 * 1. .worktree.json in the worktree
 * 2. .session.json in the worktree (legacy)
 * 3. v_active_sessions lookup (if supabase provided)
 * 4. null (cannot determine)
 *
 * @param {string} workdir - Working directory to check
 * @param {Object} [supabase] - Optional Supabase client for v_active_sessions lookup
 * @returns {Promise<string|null>} Expected branch name or null
 */
export async function resolveExpectedBranch(workdir, supabase) {
  // 1. Check .worktree.json, then legacy .session.json
  for (const filename of ['.worktree.json', '.session.json']) {
    const configPath = path.join(workdir, filename);
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.expectedBranch) return config.expectedBranch;
      } catch {
        // Fall through
      }
    }
  }

  // 2. Check v_active_sessions by worktree path
  if (supabase) {
    try {
      const { data } = await supabase
        .from('v_active_sessions')
        .select('sd_id, branch')
        .eq('worktree_path', workdir)
        .in('computed_status', ['active'])
        .limit(1);

      if (data && data.length > 0 && data[0].branch) {
        return data[0].branch;
      }
    } catch {
      // DB unavailable - fail-open
    }
  }

  return null;
}

// ── Internal helpers ──

/**
 * Resolve sdKey from explicit value or legacy session adapter.
 * sdKey always wins over session.
 */
function resolveSdKey(sdKey, session) {
  if (sdKey) return sdKey;

  if (session) {
    if (!_deprecationWarningEmitted) {
      console.warn(
        '[worktree-manager] WARNING: session-keyed worktrees are deprecated. ' +
        "Use '--sd-key' instead of '--session'."
      );
      _deprecationWarningEmitted = true;
    }
    // Deterministic mapping: sanitize session name
    const sanitized = session.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 120);
    return `session-${sanitized}`;
  }

  const err = new Error('Either sdKey or session must be provided');
  err.code = 'INVALID_SD_KEY';
  throw err;
}

function getWorktreeBranch(worktreePath) {
  return execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: worktreePath,
    encoding: 'utf8',
    stdio: 'pipe'
  }).trim();
}

function branchExistsLocally(branch) {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function branchExistsRemotely(branch) {
  try {
    const result = execSync(`git ls-remote --heads origin ${branch}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * SD-LEO-INFRA-STALE-WORKTREE-LIFECYCLE-001
 * Detect stale worktrees eligible for cleanup.
 *
 * Stale criteria:
 * - concurrent-auto-* worktrees older than maxAgeMs (default 24h)
 * - SD worktrees where the SD is completed in the database
 * - Orphaned git worktree entries (directory missing)
 *
 * Never touches Cursor IDE worktrees (.cursor/worktrees/).
 *
 * @param {Object} [options]
 * @param {number} [options.maxAgeMs=86400000] - Max age in ms for concurrent-auto-* worktrees (default 24h)
 * @param {Object} [options.supabase] - Supabase client for checking SD completion status
 * @returns {Promise<Array<{ key: string, path: string, reason: string, age?: number, isCursor?: boolean }>>}
 */
export async function detectStaleWorktrees({ maxAgeMs = 24 * 60 * 60 * 1000, supabase } = {}) {
  const repoRoot = getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);
  const stale = [];
  const cursorWarnings = [];

  // 1. Check .worktrees/ directory entries
  if (fs.existsSync(worktreesDir)) {
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true })
      .filter(e => e.isDirectory());

    for (const entry of entries) {
      const wtPath = path.join(worktreesDir, entry.name);

      // Check age from metadata files
      let createdAt = null;
      for (const metaFile of ['.worktree.json', '.ehg-session.json']) {
        const metaPath = path.join(wtPath, metaFile);
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.createdAt) createdAt = new Date(meta.createdAt);
          } catch { /* ignore */ }
          break;
        }
      }

      // Fallback: use directory mtime
      if (!createdAt) {
        try {
          const stat = fs.statSync(wtPath);
          createdAt = stat.mtime;
        } catch { /* ignore */ }
      }

      const ageMs = createdAt ? Date.now() - createdAt.getTime() : Infinity;

      // concurrent-auto-* worktrees: stale if older than maxAgeMs
      if (entry.name.startsWith('concurrent-auto-') && ageMs > maxAgeMs) {
        stale.push({ key: entry.name, path: wtPath, reason: 'concurrent-auto-expired', age: ageMs });
        continue;
      }

      // SD worktrees: stale if SD is completed
      if (entry.name.startsWith('SD-') && supabase) {
        try {
          const { data } = await supabase.from('strategic_directives_v2')
            .select('status')
            .eq('sd_key', entry.name)
            .single();
          if (data && (data.status === 'completed' || data.status === 'cancelled')) {
            stale.push({ key: entry.name, path: wtPath, reason: `sd-${data.status}`, age: ageMs });
          }
        } catch { /* DB unavailable or SD not found - skip */ }
      }
    }
  }

  // 2. Check git worktree list for orphaned entries
  try {
    const porcelain = execSync('git worktree list --porcelain', {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    });
    const blocks = porcelain.split('\n\n').filter(b => b.trim());
    for (const block of blocks) {
      const lines = block.split('\n');
      const wtLine = lines.find(l => l.startsWith('worktree '));
      if (!wtLine) continue;
      const wtPath = wtLine.replace('worktree ', '');

      // Detect Cursor worktrees - warn but never touch
      if (wtPath.includes('.cursor') || wtPath.includes('cursor/worktrees')) {
        cursorWarnings.push({ key: path.basename(wtPath), path: wtPath, reason: 'cursor-worktree', isCursor: true });
        continue;
      }

      // Check if directory still exists
      if (!fs.existsSync(wtPath)) {
        stale.push({ key: path.basename(wtPath), path: wtPath, reason: 'orphaned-directory-missing' });
      }
    }
  } catch { /* git worktree list failed - skip */ }

  return { stale, cursorWarnings };
}

/**
 * SD-LEO-INFRA-STALE-WORKTREE-LIFECYCLE-001
 * Clean up stale worktrees identified by detectStaleWorktrees.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, only report what would be cleaned
 * @param {number} [options.maxAgeMs=86400000] - Max age for concurrent-auto-* worktrees
 * @param {Object} [options.supabase] - Supabase client
 * @returns {Promise<{ cleaned: string[], skipped: string[], cursorWarnings: string[], errors: string[] }>}
 */
export async function cleanupStaleWorktrees({ dryRun = false, maxAgeMs, supabase } = {}) {
  const { stale, cursorWarnings } = await detectStaleWorktrees({ maxAgeMs, supabase });
  const repoRoot = getRepoRoot();
  const result = { cleaned: [], skipped: [], cursorWarnings: cursorWarnings.map(w => w.path), errors: [] };

  for (const item of stale) {
    if (dryRun) {
      result.cleaned.push(`[DRY RUN] ${item.key} (${item.reason})`);
      continue;
    }

    try {
      // Check for uncommitted changes before removing
      if (fs.existsSync(item.path)) {
        try {
          const status = execSync('git status --porcelain', {
            cwd: item.path, encoding: 'utf8', stdio: 'pipe'
          }).trim();
          if (status.length > 0) {
            result.skipped.push(`${item.key}: uncommitted changes`);
            continue;
          }
        } catch {
          // Can't check status - proceed with removal
        }
      }

      // Remove worktree
      try {
        execSync(`git worktree remove --force "${item.path}"`, {
          cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
        });
      } catch {
        // If git worktree remove fails, clean up manually
        if (fs.existsSync(item.path)) {
          fs.rmSync(item.path, { recursive: true, force: true });
        }
      }
      result.cleaned.push(`${item.key} (${item.reason})`);
    } catch (err) {
      result.errors.push(`${item.key}: ${err.message}`);
    }
  }

  // Run git worktree prune to clean up orphaned entries
  if (!dryRun && stale.length > 0) {
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch { /* best effort */ }
  }

  return result;
}

/**
 * QF-20260424-674: Assert the given session holds the DB claim for a work item
 * before its worktree is materialized. Pure function — caller supplies the
 * current claim state (no DB coupling in lib/).
 *
 * Philosophy: unclaimed QF/SD work MUST NOT have a pre-registered worktree.
 * Otherwise two sessions running `/leo next` can land in the same directory
 * before the DB claim race resolves.
 *
 * @param {Object} opts
 * @param {WorkType} opts.workType   - 'SD' | 'QF' | 'ADHOC'
 * @param {string|null} opts.claimedBy - Session ID currently holding the claim, or null
 * @param {string} [opts.sessionId]  - Session attempting to create the worktree
 * @throws {Error} code=CLAIM_NOT_HELD when the claim is missing or mismatched
 */
export function assertClaimForWorktree({ workType, claimedBy, sessionId }) {
  if (workType === 'ADHOC') return;
  if (!sessionId || claimedBy !== sessionId) {
    const err = new Error(
      `Worktree creation for ${workType} requires a held claim: ` +
      `sessionId=${sessionId || 'MISSING'}, claimedBy=${claimedBy || 'UNCLAIMED'}`
    );
    err.code = 'CLAIM_NOT_HELD';
    throw err;
  }
}

/**
 * Reset deprecation warning state (for testing).
 * @internal
 */
export function _resetDeprecationWarning() {
  _deprecationWarningEmitted = false;
}
