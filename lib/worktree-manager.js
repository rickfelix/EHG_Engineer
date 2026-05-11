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
 *
 * ─── NODE_MODULES_LOCK is a phantom protocol (QF-20260508-403) ─────────────
 * Coordinator dashboards may show INFO broadcasts subjected `NODE_MODULES_LOCK`.
 * These are advisory narrative only. There is NO lock protocol:
 *   • `NODE_MODULES_LOCK` is not a value in the `coordination_message_type` enum
 *     (DB rejects `INSERT ... message_type='NODE_MODULES_LOCK'`).
 *   • Zero producer scripts broadcast a real lock.
 *   • Zero consumer scripts gate `npm install` / `node_modules` operations on it.
 * The actual blast-radius safety for concurrent npm install across worktrees is
 * filesystem-level: junction-safe recursive rm via `safeRecursiveRm` (below) plus
 * npm's atomic `.staging` swaps which keep concurrent installs on a junction-
 * symlinked tree safe in practice.
 * Do NOT add producer/consumer hooks expecting a coordination-channel lock; the
 * intent was never realized. RCA evidence: `sub_agent_execution_results.id =
 * 0b0168b7-1d0a-4e84-bb85-19ee25fffa38` (paired with QF-20260508-102).
 * ────────────────────────────────────────────────────────────────────────────
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { enforceWorktreeQuota } from './worktree-quota.js';

const WORKTREES_DIR = '.worktrees';

/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-001):
 * Single source of truth for the substrate items a healthy worktree must contain
 * at the moment sd-start records the claim. Both validateWorktreeSubstrate (this
 * file) and ensureWorktreeEssentials (scripts/resolve-sd-workdir.js) consume from
 * this list — see tests/unit/lib/worktree-manager-substrate-parity.test.js for
 * the parity guard.
 *
 * Items are checked via fs.existsSync — symlinks count as present. Order is
 * preserved in the missing[] return array for stable diagnostics.
 */
export const SUBSTRATE_ITEMS = Object.freeze([
  '.git',
  'package.json',
  'scripts',
  'lib',
  'node_modules',
  '.env'
]);

/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-002):
 * Pure synchronous substrate presence check for a worktree directory.
 * Iterates SUBSTRATE_ITEMS and returns the subset that does not exist.
 *
 * Witnessed 2026-05-02: a worktree was reported as successfully created but
 * contained only .claude/ and scripts/ — claim was recorded, every downstream
 * tool then failed with confusing module-not-found errors. This helper catches
 * that class at claim-record time.
 *
 * Uses fs.lstatSync (NOT fs.existsSync) so the check examines the link
 * itself rather than the target. This matters for node_modules, which is
 * typically a junction/symlink to the main repo's node_modules — during a
 * concurrent npm install at the main repo, the target can be transiently
 * absent (.staging/ swap), and fs.existsSync would falsely report the
 * junction as missing and tear down a healthy worktree. lstatSync sees the
 * link itself and reports present-as-junction. Adversarial review of PR
 * #3488 (finding 1) closed this race.
 *
 * @param {string} worktreePath - Absolute path to the worktree directory.
 * @returns {{ok: boolean, missing: string[]}} ok=true with empty missing[] when
 *   all 6 substrate items exist; ok=false with missing[] in SUBSTRATE_ITEMS order
 *   otherwise.
 * @throws {TypeError} if worktreePath is not a non-empty string.
 */
export function validateWorktreeSubstrate(worktreePath) {
  if (typeof worktreePath !== 'string' || worktreePath.length === 0) {
    throw new TypeError(
      `validateWorktreeSubstrate: worktreePath must be a non-empty string (got ${typeof worktreePath})`
    );
  }
  const missing = [];
  for (const item of SUBSTRATE_ITEMS) {
    const stat = fs.lstatSync(path.join(worktreePath, item), { throwIfNoEntry: false });
    if (!stat) {
      missing.push(item);
    }
  }
  return { ok: missing.length === 0, missing };
}

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
      'Worktree creation refused (fail-closed). ' +
      'Verify network access to origin or set LEO_WORKTREE_BASE_REF.'
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
      '\n  Remediation (pick one):\n' +
      `    1. Rebase: git checkout ${branch} && git fetch origin && git rebase ${baseRef}\n` +
      `    2. Cherry-pick: list your commits via 'git log ${baseRef}..${branch}', then cherry-pick each onto a fresh branch off ${baseRef}\n` +
      `    3. Abandon-and-reset: git branch -D ${branch} && rerun sd-start (recreates from ${baseRef})\n` +
      '\n  Override (NOT recommended for normal flow):\n' +
      '    LEO_FORK_DRIFT_THRESHOLD_COMMITS=<higher> LEO_FORK_DRIFT_THRESHOLD_HOURS=<higher> rerun the operation.'
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
      gitOutput: 'baseRef must be of the form \'<remote>/<branch>\'',
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
  // SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001: routes through safeRecursiveRm
  // (line 1052) instead of raw fs.rmSync — closes the 3rd unsafe Windows-junction site.
  // Prior fixes (PR #3471 introducing the helper, PR #3590 patching reaper + hook)
  // missed this brute-force fallback path.
  try {
    safeRecursiveRm(worktreePath, { force: true });
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

  // QF-20260509-235: emit telemetry on the brute-force success path so operators
  // can measure how often `git worktree remove` is refusing to remove (file
  // locks, dirty files, contention) and the brute-force fallback is rescuing.
  // Without this, only failures emit (WORKTREE_ROLLBACK_DEFERRED above) — successes
  // are invisible. Distinct event_type so dashboards separate "rescued" from "deferred".
  if (fsResult.fellBackToRmSync) {
    try {
      const { createSupabaseServiceClient } = await import('../scripts/lib/supabase-connection.js');
      const supabase = opts.supabase || await createSupabaseServiceClient('engineer');
      await supabase.from('session_lifecycle_events').insert({
        event_type: 'WORKTREE_BRUTE_FORCE_FALLBACK_OK',
        session_id: sessionId || null,
        reason: 'git_worktree_remove_refused_brute_force_rescued',
        metadata: {
          path: worktreePath,
          original_error: opts.originalError?.message || null,
          attempts_made: fsResult.attempts,
          last_error: fsResult.lastError,
        },
      });
    } catch {
      // Audit emission is best-effort; never let a logging failure mask the
      // original rollback success to the operator.
    }
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

  selfHealEmptyStaleWorktreeDir(worktreePath, repoRoot);

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

    selfHealEmptyStaleWorktreeDir(worktreePath, repoRoot);

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
 * Junction-safe recursive removal.
 * SD-FDBK-ENH-SESSION-WORKTREE-CLEANUP-001
 * QF-20260509-NESTED-JUNCTION: recursive walk for nested junctions
 *
 * On Windows, fs.rmSync({recursive:true,force:true}) can follow Windows junctions
 * (created via fs.symlinkSync(target, link, 'junction')) and delete the JUNCTION
 * TARGET's contents. For our worktrees, that target is the main repo's
 * node_modules — bricking every parallel session.
 *
 * Strategy:
 *  - If the path itself is a symlink/junction, fs.unlinkSync it (don't recurse).
 *  - If it's a directory, walk the FULL TREE and unlink every symlink/junction
 *    descendant FIRST, then fs.rmSync the remainder recursively. The recursive
 *    walk is required because junctions can be nested (e.g. wt/<sub>/node_modules);
 *    a single-level pre-pass (the original implementation) would miss them and
 *    rmSync would follow them. Witnessed 2026-05-09: reaper wiped repo-root
 *    node_modules via SD-LEO-INFRA-MAKE-SESSIONSTART-WORKTREE-001 archive.
 *
 * On Unix, Node already does not follow symlinks during recursive rm; the lstat
 * check is harmless. Cross-platform identical behavior for the symlink case.
 *
 * @param {string} targetPath - Path to remove
 * @param {{force?: boolean}} [options] - force=true (default) ignores ENOENT
 */
export function safeRecursiveRm(targetPath, options = {}) {
  const { force = true } = options;
  if (!fs.existsSync(targetPath)) {
    if (force) return;
    throw new Error(`safeRecursiveRm: path does not exist: ${targetPath}`);
  }
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (err) {
    if (force) return;
    throw err;
  }
  if (stat.isSymbolicLink()) {
    _unlinkSymOrJunction(targetPath);
    return;
  }
  if (stat.isDirectory()) {
    _unlinkLinksRecursive(targetPath, force);
  }
  fs.rmSync(targetPath, { recursive: true, force });
}

/**
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-1):
 * Synchronous junction-safe rm with bounded retry-with-backoff.
 * Wraps safeRecursiveRm in a 3-attempt loop on Windows file-handle EBUSY/EPERM/ENOTEMPTY.
 * Re-walks the tree on each attempt so a transient file appearance between attempts
 * (npm/antivirus/indexer) does not strand a partial removal (risk-agent R8 mitigation).
 *
 * Outer-envelope retry, NOT per-inode (risk-agent R2). Default delays mirror the
 * existing rollbackWorktreeFilesystemSync schedule [100,500,2000] for cross-site
 * consistency; total worst-case envelope ≤ 2.6s (well under the 15s shared budget).
 *
 * @param {string} targetPath
 * @param {{force?: boolean, delaysMs?: number[]}} [options]
 * @returns {{ ok: boolean, attempts: number, lastError: string|null }}
 */
export function safeRecursiveRmWithRetry(targetPath, options = {}) {
  const { force = true } = options;
  const delaysMs = Array.isArray(options.delaysMs) ? options.delaysMs : [100, 500, 2000];
  const maxAttempts = delaysMs.length;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      safeRecursiveRm(targetPath, { force });
      // Post-condition: path should be gone (force ignores ENOENT).
      if (!fs.existsSync(targetPath)) {
        return { ok: true, attempts: attempt + 1, lastError: null };
      }
      // Path still exists — partial removal. Treat as transient retryable.
      lastError = `path still exists after attempt ${attempt + 1}`;
    } catch (err) {
      lastError = err?.message || String(err);
      // ENOENT is benign — path is already gone.
      if (err?.code === 'ENOENT') {
        return { ok: true, attempts: attempt + 1, lastError: null };
      }
    }
    if (attempt < maxAttempts - 1) {
      const wait = delaysMs[attempt];
      const deadline = Date.now() + wait;
      while (Date.now() < deadline) { /* spin — sync caller, no sleep available */ }
    }
  }
  return { ok: false, attempts: maxAttempts, lastError };
}

/**
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-2 writer-side):
 * Async best-effort UPDATE claude_sessions SET cleanup_pending=NOW() for the
 * released session that owns this worktree. Used after safeRecursiveRmWithRetry
 * exhausts attempts; the orphan-worktree-reaper consumes cleanup_pending IS NOT NULL
 * rows on its own schedule (FR-3).
 *
 * Graceful degrade: if the column does not exist (deploy-order: code merged before
 * migration), the UPDATE returns PGRST204 and is logged to the existing
 * WORKTREE_ROLLBACK_DEFERRED audit row instead. No new failure mode introduced —
 * orphans accumulate at today's rate until migration applies, then begin to drain.
 *
 * @param {string} sdKey
 * @param {object} [opts]
 * @param {object} [opts.supabase]    - Injectable client; defaults to a fresh service-role client
 * @param {string} [opts.worktreePath] - Worktree path that failed to remove (for telemetry)
 * @param {string} [opts.lastError]   - Last filesystem error message
 * @param {number} [opts.attempts]    - Attempts made before giving up
 * @returns {Promise<{ marked: boolean, sessionId: string|null, reason: string }>}
 */
export async function markCleanupPendingBestEffort(sdKey, opts = {}) {
  if (!sdKey) {
    return { marked: false, sessionId: null, reason: 'missing_sd_key' };
  }
  let supabase = opts.supabase;
  try {
    if (!supabase) {
      const { createSupabaseServiceClient } = await import('../scripts/lib/supabase-connection.js');
      supabase = await createSupabaseServiceClient('engineer');
    }
  } catch (err) {
    return { marked: false, sessionId: null, reason: `client_init_failed:${err?.message || err}` };
  }

  // Find the most recent released session that owns this sdKey.
  let sessionRow = null;
  try {
    const { data } = await supabase
      .from('claude_sessions')
      .select('session_id, released_at, worktree_path, cleanup_pending')
      .eq('sd_key', sdKey)
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .limit(1);
    sessionRow = data && data[0] ? data[0] : null;
  } catch (err) {
    return { marked: false, sessionId: null, reason: `lookup_failed:${err?.message || err}` };
  }

  if (!sessionRow) {
    return { marked: false, sessionId: null, reason: 'no_released_session_for_sd_key' };
  }
  if (sessionRow.cleanup_pending) {
    return { marked: false, sessionId: sessionRow.session_id, reason: 'already_pending' };
  }

  // UPDATE — graceful degrade if column is missing (PGRST204).
  try {
    const { error } = await supabase
      .from('claude_sessions')
      .update({ cleanup_pending: new Date().toISOString() })
      .eq('session_id', sessionRow.session_id);

    if (error) {
      // PGRST204 = column not found in schema cache → migration not yet applied.
      const isColumnMissing = error.code === 'PGRST204' || /cleanup_pending/i.test(error.message || '');
      // Fall back to existing WORKTREE_ROLLBACK_DEFERRED audit row so the operator
      // still sees the persistent-failure event (graceful degrade — no new orphan
      // accumulation rate beyond today's baseline).
      try {
        await supabase.from('session_lifecycle_events').insert({
          event_type: 'WORKTREE_ROLLBACK_DEFERRED',
          session_id: sessionRow.session_id,
          reason: isColumnMissing ? 'cleanup_pending_column_missing' : 'cleanup_pending_update_failed',
          metadata: {
            sd_key: sdKey,
            path: opts.worktreePath || sessionRow.worktree_path || null,
            attempts_made: opts.attempts || null,
            last_error: opts.lastError || null,
            update_error: error.message,
            update_code: error.code,
          },
        });
      } catch { /* audit emission is best-effort */ }
      return { marked: false, sessionId: sessionRow.session_id, reason: isColumnMissing ? 'column_missing' : 'update_failed' };
    }

    return { marked: true, sessionId: sessionRow.session_id, reason: 'ok' };
  } catch (err) {
    return { marked: false, sessionId: sessionRow.session_id, reason: `update_threw:${err?.message || err}` };
  }
}

/**
 * Walk a directory tree and unlink every symlink/junction descendant.
 * Does not delete regular files or directories — caller is expected to
 * follow up with fs.rmSync({recursive:true}). Once all junctions/symlinks
 * are unlinked, that final rmSync cannot follow a junction target.
 *
 * @param {string} dir - Directory to walk
 * @param {boolean} force - Suppress per-entry errors when true
 */
function _unlinkLinksRecursive(dir, force) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const childPath = path.join(dir, entry.name);
    let childStat;
    try {
      childStat = fs.lstatSync(childPath);
    } catch {
      continue;
    }
    if (childStat.isSymbolicLink()) {
      try {
        _unlinkSymOrJunction(childPath);
      } catch (err) {
        if (!force) throw err;
      }
      continue;
    }
    if (childStat.isDirectory()) {
      _unlinkLinksRecursive(childPath, force);
    }
  }
}

/**
 * Junction-safe recursive copy. Symmetric to safeRecursiveRm.
 * SD-FDBK-ENH-SESSION-WORKTREE-CLEANUP-001
 * QF-20260509-NESTED-JUNCTION: recursive walk for nested junctions
 *
 * fs.cpSync({recursive:true}) on Windows can follow junctions and copy the
 * JUNCTION TARGET's multi-GB contents into the destination. For _archive of
 * worktrees, that means duplicating the main repo's node_modules into
 * .worktrees/_archive/<sd>-<ts> — wasted disk and slow archival.
 *
 * Strategy: walk entries recursively; for each symlink/junction at any depth,
 * recreate as a link at the destination (preserving the link itself, not the
 * target). Recursive descent is required to handle nested junctions —
 * delegating to fs.cpSync for any subdirectory (the original behavior) would
 * follow nested junctions on Windows.
 *
 * @param {string} srcPath
 * @param {string} destPath
 * @param {{recursive?: boolean, errorOnExist?: boolean}} [options]
 */
export function safeRecursiveCp(srcPath, destPath, options = {}) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`safeRecursiveCp: source does not exist: ${srcPath}`);
  }
  const stat = fs.lstatSync(srcPath);
  if (stat.isSymbolicLink()) {
    _recreateLinkAtDest(srcPath, destPath);
    return;
  }
  if (!stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: false, ...options });
    return;
  }
  fs.mkdirSync(destPath, { recursive: true });
  const entries = fs.readdirSync(srcPath, { withFileTypes: true });
  for (const entry of entries) {
    const srcChild = path.join(srcPath, entry.name);
    const destChild = path.join(destPath, entry.name);
    let childStat;
    try {
      childStat = fs.lstatSync(srcChild);
    } catch {
      continue;
    }
    if (childStat.isSymbolicLink()) {
      _recreateLinkAtDest(srcChild, destChild);
      continue;
    }
    if (childStat.isDirectory()) {
      safeRecursiveCp(srcChild, destChild, options);
    } else {
      fs.copyFileSync(srcChild, destChild);
    }
  }
}

/**
 * QF-20260511-446: Remove a worktree via `git worktree remove --force`, but
 * first unlink any `node_modules` symlink inside it so git does not follow
 * the link and wipe the main repo's node_modules.
 *
 * On Windows, worktree node_modules are sometimes MSYS bash symlinks rather
 * than Windows junctions; `git worktree remove --force` follows them and
 * deletes the target contents. Mirrors the pre-unlink pattern that
 * safeRecursiveRm uses for fs.rmSync sites (PR #3590 / #3654).
 *
 * @param {string} wtPath - Worktree directory path
 * @param {string} repoRoot - Main repo path (cwd for git)
 * @param {{ allowFail?: boolean }} [options] - allowFail returns {ok:false,error} instead of throwing
 * @returns {{ ok: boolean, error: string|null }}
 */
export function removeWorktreeViaGit(wtPath, repoRoot, options = {}) {
  const { allowFail = false } = options;
  try {
    const nmPath = `${wtPath}/node_modules`;
    try {
      const lst = fs.lstatSync(nmPath);
      if (lst.isSymbolicLink()) _unlinkSymOrJunction(nmPath);
    } catch { /* no node_modules or already gone */ }
    execSync(`git worktree remove --force "${wtPath}"`, { cwd: repoRoot, stdio: 'pipe' });
    return { ok: true, error: null };
  } catch (err) {
    if (allowFail) return { ok: false, error: err?.message || String(err) };
    throw err;
  }
}

function _unlinkSymOrJunction(p) {
  try {
    fs.unlinkSync(p);
  } catch (err) {
    // Windows: junctions to directories sometimes need rmdirSync to remove the
    // reparse point itself (without following).
    if (process.platform === 'win32' && (err.code === 'EPERM' || err.code === 'EISDIR')) {
      fs.rmdirSync(p);
      return;
    }
    throw err;
  }
}

function _recreateLinkAtDest(srcLink, destPath) {
  try {
    const target = fs.readlinkSync(srcLink);
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(target, destPath, linkType);
  } catch {
    // Best effort — caller wanted an archive, not a perfect mirror. Skip on failure.
  }
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
    // SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-1 site #1):
    // Routed through safeRecursiveRmWithRetry to survive transient EBUSY/EPERM
    // when npm/antivirus/indexer is holding the existing junction's child files.
    // Failure here is part of the create flow — surface as throw so the create
    // post-condition catches it (no cleanup_pending mark — never had a release).
    const result = safeRecursiveRmWithRetry(targetModules);
    if (!result.ok) {
      throw new Error(
        `symlinkNodeModules: failed to remove existing target after ${result.attempts} attempts: ${result.lastError}`
      );
    }
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
    // SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-1 site #2):
    // git worktree remove failed — fall back to retry-with-backoff. On exhaustion,
    // mark the owning released session as cleanup_pending (FR-2 writer) so the
    // orphan-worktree-reaper can sweep on its own schedule (FR-3).
    const result = safeRecursiveRmWithRetry(worktreePath);
    if (!result.ok) {
      // Best-effort persistent-state mark — fire-and-forget so caller is sync-safe.
      Promise.resolve(
        markCleanupPendingBestEffort(sdKey, {
          worktreePath,
          attempts: result.attempts,
          lastError: result.lastError,
        })
      ).catch(() => {});
      console.warn(JSON.stringify({
        event: 'worktree.remove_deferred',
        sdKey,
        path: worktreePath,
        attempts: result.attempts,
        lastError: result.lastError,
      }));
    }
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
    safeRecursiveCp(wtPath, archivePath, { recursive: true });
    // SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-1 site #3):
    // Source-side rm after archive copy. Routed through retry-with-backoff so
    // a transient EBUSY at archive time doesn't strand the original worktree
    // alongside its archive. On exhaustion, mark cleanup_pending for the reaper.
    const result = safeRecursiveRmWithRetry(wtPath);
    if (!result.ok) {
      Promise.resolve(
        markCleanupPendingBestEffort(sdKey, {
          worktreePath: wtPath,
          attempts: result.attempts,
          lastError: result.lastError,
        })
      ).catch(() => {});
      console.warn(JSON.stringify({
        event: 'worktree.archive_source_remove_deferred',
        sdKey,
        path: wtPath,
        archivePath,
        attempts: result.attempts,
        lastError: result.lastError,
      }));
    }
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

// Closes feedback f03f0f73 (QF-20260511-699): empty unregistered .worktrees/<key>/
// dirs blocked re-creation because getWorktreeBranch threw on the missing .git
// pointer, and the pre-tool hook denied the recommended `rm -rf` recovery step.
function selfHealEmptyStaleWorktreeDir(worktreePath, repoRoot) {
  try {
    if (!fs.existsSync(worktreePath)) return false;
    if (fs.readdirSync(worktreePath).length > 0) return false;
    const listed = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
    const expected = path.resolve(worktreePath).replace(/\\/g, '/');
    const registered = listed.split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => path.resolve(l.replace('worktree ', '').trim()).replace(/\\/g, '/'));
    if (registered.includes(expected)) return false;
    fs.rmdirSync(worktreePath);
    try { execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' }); } catch { /* non-fatal */ }
    return true;
  } catch {
    return false;
  }
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
        // SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-1 site #4):
        // cleanupOrphans inner-loop manual fallback. Route through retry helper
        // so a stale Windows lock doesn't pin orphans across consecutive sweeps.
        // On exhaustion, mark cleanup_pending so the next reaper pass picks it up.
        if (fs.existsSync(item.path)) {
          const rmResult = safeRecursiveRmWithRetry(item.path);
          if (!rmResult.ok) {
            Promise.resolve(
              markCleanupPendingBestEffort(item.key, {
                worktreePath: item.path,
                attempts: rmResult.attempts,
                lastError: rmResult.lastError,
              })
            ).catch(() => {});
          }
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
