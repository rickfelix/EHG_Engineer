#!/usr/bin/env node
/**
 * resolve-sd-workdir.js - Single source of truth for SD working directory resolution
 *
 * SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001 (FR-1)
 *
 * Determines whether an SD has an existing git worktree, optionally creates one,
 * and outputs a machine-readable JSON result. Used by /leo start, sd:start, and /ship.
 *
 * Usage:
 *   node scripts/resolve-sd-workdir.js --sdKey SD-XXX-001 [--mode claim|ship] [--repoRoot /path] [--output json]
 *
 * Modes:
 *   claim - Used by /leo start and sd:start. Creates worktree if none exists.
 *   ship  - Used by /ship. Read-only resolution, never creates worktrees.
 *
 * Exit codes:
 *   0 - Success (JSON result on stdout)
 *   1 - Error (JSON error on stderr)
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { getVenturePath } from '../lib/venture-resolver.js';
import { resolveVentureRepoRoot } from '../lib/venture-repo-root.js';
import { resolveRepoPathDbFirst } from '../lib/repo-paths.js';
import { sanitizeBranchName, checkDirtyWorktree, verifyGitignore, acquireWorktreeLock, releaseLock } from '../lib/worktree-guards.js';
import { enforceWorktreeQuota, MAX_WORKTREE_COUNT, WORKTREE_QUOTA_HELPERS } from '../lib/worktree-quota.js';
// SD-LEO-INFRA-START-WORKTREE-BRANCH-001: delegate base-ref resolution + fetch
// to the single source of truth in lib/worktree-manager.js so this code path
// cannot drift away from the createWorktree behavior.
// SD-LEO-INFRA-LEO-INFRA-WORKTREE-001: SUBSTRATE_ITEMS + validateWorktreeSubstrate
// for the post-creation completeness gate.
import { resolveWorktreeBaseRef, fetchBaseRef, WorktreeBaseFetchFailedError, SUBSTRATE_ITEMS, VENTURE_SUBSTRATE_ITEMS, validateWorktreeSubstrate } from '../lib/worktree-manager.js';
import { provisionWorktreeNodeModules, getIsolationMode, getFreeDiskBytes, countActiveFreshSessions } from '../lib/worktree-provision.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const WORKTREES_DIR = '.worktrees';

/**
 * @typedef {Object} ResolveResult
 * @property {string} sdKey
 * @property {string} cwd - Absolute path to the working directory
 * @property {'db'|'scan'|'created'|'legacy'} source - How the worktree was found
 * @property {boolean} success
 * @property {{ exists: boolean, created?: boolean, path?: string, branch?: string }} worktree
 * @property {string} [sessionId]
 * @property {string} [errorCode]
 * @property {string} [error]
 */

function getRepoRoot(override) {
  if (override) return override;
  let toplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim();
  // If running inside a worktree, navigate up to the main repo root.
  // Worktree paths contain .worktrees/ (e.g., /repo/.worktrees/SD-XXX/),
  // so git show-toplevel returns the worktree root, not the main repo.
  const wtIdx = toplevel.replace(/\\/g, '/').indexOf('/' + WORKTREES_DIR + '/');
  if (wtIdx >= 0) {
    toplevel = toplevel.substring(0, wtIdx);
  }
  return toplevel;
}

function isValidWorktree(wtPath) {
  if (!fs.existsSync(wtPath)) return false;
  try {
    // Check git recognizes this as a work tree
    execSync('git rev-parse --is-inside-work-tree', { cwd: wtPath, encoding: 'utf8', stdio: 'pipe' });

    // Verify it's a *registered* git worktree, not just a directory inside
    // the main repo. After branch deletion or git worktree prune, the directory
    // may still exist but git no longer tracks it, causing module resolution
    // failures when scripts run from the orphaned directory.
    const absPath = path.resolve(wtPath).replace(/\\/g, '/');
    // cwd must be wtPath so the command inspects the *target* repo's worktree list.
    // Without cwd, this runs from process.cwd() (usually EHG_Engineer), and cross-repo
    // SDs (targetApp != 'EHG_Engineer') always fail the registration check because
    // their worktree belongs to a different repo entirely.
    const listed = execSync('git worktree list --porcelain', { cwd: wtPath, encoding: 'utf8', stdio: 'pipe' });
    const registeredPaths = listed
      .split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'));
    if (!registeredPaths.some(rp => absPath === rp.replace(/\\/g, '/'))) {
      return false; // Directory exists but is not a registered worktree
    }

    return true;
  } catch {
    return false;
  }
}

function getWorktreeBranch(wtPath) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: wtPath, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function validateSdKey(sdKey) {
  if (!sdKey || typeof sdKey !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,128}$/.test(sdKey);
}

function validateWorktreePath(wtPath, repoRoot) {
  const resolved = path.resolve(wtPath);
  const resolvedRoot = path.resolve(repoRoot);
  // Must be under repo root's .worktrees/ directory
  if (!resolved.startsWith(path.join(resolvedRoot, WORKTREES_DIR))) {
    return false;
  }
  // Reject obviously dangerous paths
  if (resolved === '/' || resolved === 'C:\\' || resolved === resolvedRoot) {
    return false;
  }
  return true;
}

/**
 * Try to resolve worktree from database (claude_sessions.worktree_path)
 */
async function resolveFromDB(sdKey) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createSupabaseServiceClient();

    const { data } = await supabase
      .from('claude_sessions')
      .select('worktree_path, session_id')
      .eq('sd_key', sdKey)
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.worktree_path && fs.existsSync(data.worktree_path)) {
      return { path: data.worktree_path, sessionId: data.session_id };
    }
  } catch {
    // DB unavailable - fall through to scan
  }
  return null;
}

/**
 * Scan .worktrees/ directory for existing worktree matching sdKey
 */
function resolveFromScan(sdKey, repoRoot) {
  const worktreesDir = path.join(repoRoot, WORKTREES_DIR);

  // Check legacy flat layout: .worktrees/<sdKey>/
  const legacyPath = path.join(worktreesDir, sdKey);
  if (isValidWorktree(legacyPath)) {
    return { path: legacyPath, layout: 'legacy' };
  }

  // Check new layout: .worktrees/sd/<sdKey>/
  const newPath = path.join(worktreesDir, 'sd', sdKey);
  if (isValidWorktree(newPath)) {
    return { path: newPath, layout: 'typed' };
  }

  return null;
}

// SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001: the worktree quota counter moved to
// lib/worktree-quota.js. `MAX_WORKTREE_COUNT` and `WORKTREE_QUOTA_HELPERS` are
// re-exported here from the shared module so existing imports (if any) keep
// working. The counter now uses `git worktree list --porcelain` instead of
// `fs.readdirSync`, so orphan directories no longer inflate the count.
export { MAX_WORKTREE_COUNT, WORKTREE_QUOTA_HELPERS };

/**
 * SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-001:
 * After `git worktree add`, verify the worktree is actually registered in
 * `git worktree list --porcelain` AND a `.git` pointer file exists. Required
 * because Windows `git worktree add` can exit 0 on partial failure.
 *
 * Uses a bounded retry loop (10 × 100ms, total 1s) to accommodate observed
 * latency in git worktree metadata propagation. Throws with a diagnostic
 * error message on final failure.
 */
function verifyWorktreeRegistered(worktreePath, repoRoot) {
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
        // Also verify the .git pointer file exists (Windows edge case)
        if (!fs.existsSync(path.join(worktreePath, '.git'))) {
          throw new Error(
            `git worktree add reported success but ${worktreePath} has no .git pointer file. ` +
            `Remediation: rm -rf "${worktreePath}" && git worktree prune`
          );
        }
        return true;
      }
    } catch (err) {
      // execSync failure will be retried; re-throw only on final attempt
      if (attempt === maxAttempts - 1) throw err;
    }
    // Busy wait (no async context here) — acceptable given 100ms total 1s max
    const deadline = Date.now() + delayMs;
    while (Date.now() < deadline) { /* spin */ }
  }

  const err = new Error(
    `git worktree add reported success but ${worktreePath} is not registered in git worktree list. ` +
    `Remediation: rm -rf "${worktreePath}" && git worktree prune\n` +
    `Listed paths (${lastListed.length}):\n  - ${lastListed.join('\n  - ')}`
  );
  err.errorCode = 'WORKTREE_POST_CONDITION_FAILED';
  throw err;
}

/**
 * Create a new worktree for the SD
 */
function createWorktree(sdKey, repoRoot, opts = {}) {
  const worktreesDir = path.join(repoRoot, WORKTREES_DIR);
  const worktreePath = path.join(worktreesDir, sdKey);

  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-002: Pre-condition check.
  // If worktreePath exists, either reuse (if valid) or reject with remediation.
  // Prevents silent-trample scenarios from prior failed runs.
  if (fs.existsSync(worktreePath)) {
    if (isValidWorktree(worktreePath)) {
      const existingBranch = getWorktreeBranch(worktreePath);
      // Patch up essentials (.env, node_modules) for pre-existing worktrees
      // that DB and scan paths missed. Without this, handoff.js and other
      // scripts run from the worktree fail with NEXT_PUBLIC_SUPABASE_URL
      // is required. Closes feedback row c9d07065.
      const essentials = ensureWorktreeEssentials(worktreePath, repoRoot, { activeSessionCount: opts.activeSessionCount });
      if (!essentials.ok) {
        emitLog({ event: 'worktree.essentials_partial', sdKey, source: 'pre-existing', errors: essentials.errors });
      }
      return { path: worktreePath, branch: existingBranch || `feat/${sdKey}`, created: false };
    }
    const err = new Error(
      `Path ${worktreePath} exists but is not a registered worktree. ` +
      `Remove it with: rm -rf "${worktreePath}" && git worktree prune`
    );
    err.errorCode = 'WORKTREE_PRE_CONDITION_FAILED';
    throw err;
  }

  // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-003: Quota enforcement.
  // Parity with lib/worktree-manager.js::createWorkTypeWorktree via shared
  // helper in lib/worktree-quota.js (SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001).
  // Counter now uses `git worktree list --porcelain`, so orphan directories
  // no longer inflate the count. Error contract (message + errorCode) is
  // preserved by `createQuotaExceededError` inside the helper.
  enforceWorktreeQuota(repoRoot, worktreesDir);

  // Look for an existing feature branch
  const _branchPrefix = `feat/${sdKey}`;
  let branch = null;

  try {
    const branches = execSync('git branch --list "feat/' + sdKey + '*"', {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    }).trim();
    if (branches) {
      branch = branches.split('\n')[0].replace(/^[*+]?\s*/, '').trim();
    }
  } catch { /* no match */ }

  if (!branch) {
    // Check remote
    try {
      const remote = execSync('git ls-remote --heads origin "feat/' + sdKey + '*"', {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      if (remote) {
        branch = remote.split('\n')[0].split('\t')[1].replace('refs/heads/', '');
      }
    } catch { /* no match */ }
  }

  if (!branch) {
    branch = `feat/${sdKey}`;
  }

  // Sanitize branch name before git operations (SD-LEO-INFRA-AUTO-WORKTREE-START-001 US-004)
  const branchCheck = sanitizeBranchName(branch);
  if (!branchCheck.safe) {
    throw new Error(`Unsafe branch name rejected: ${branchCheck.reason}`);
  }

  // Create the worktree (with cross-process lock to prevent parallel corruption)
  const branchExists = (() => {
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: repoRoot, stdio: 'pipe' });
      return true;
    } catch { return false; }
  })();

  // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: when creating a NEW branch, fork
  // explicitly from baseRef (default origin/main). Re-claim path keeps existing
  // semantics. Fetch failures throw WorktreeBaseFetchFailedError (fail-closed)
  // and propagate up to sd-start.js for the refusal banner.
  let lockPath;
  let baseRef = null;
  try {
    lockPath = acquireWorktreeLock(sdKey, process.env.CLAUDE_SESSION_ID || 'unknown', worktreesDir);

    if (branchExists) {
      execSync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    } else {
      baseRef = resolveWorktreeBaseRef();
      fetchBaseRef(repoRoot, baseRef);
      execSync(`git worktree add -b "${branch}" "${worktreePath}" "${baseRef}"`, {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      });
    }
  } finally {
    if (lockPath) releaseLock(lockPath);
  }

  // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-001: Post-condition verify.
  // Ensure git worktree list includes the new path AND .git pointer exists.
  verifyWorktreeRegistered(worktreePath, repoRoot);

  // Write metadata
  fs.writeFileSync(path.join(worktreePath, '.worktree.json'), JSON.stringify({
    sdKey,
    expectedBranch: branch,
    createdAt: new Date().toISOString(),
    repoRoot,
    baseRef
  }, null, 2));

  const essentials = ensureWorktreeEssentials(worktreePath, repoRoot, { activeSessionCount: opts.activeSessionCount });
  if (!essentials.ok) {
    emitLog({ event: 'worktree.essentials_partial', sdKey, errors: essentials.errors });
  }

  // SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-004): post-creation substrate
  // completeness gate. Runs AFTER ensureWorktreeEssentials so that the
  // node_modules symlink and .env copy it creates are checked. On failure,
  // throw with errCode=WORKTREE_INCOMPLETE — sd-start.js catches at line ~1131,
  // calls classifyWorktreeFailure (which maps to code='worktree_incomplete'
  // via lib/protocol-policies/worktree-failure-classification.js), releases
  // the claim via release_sd RPC, and exits non-zero. The incomplete worktree
  // directory is preserved on disk for operator inspection.
  // FR-3: a venture worktree (inside a venture clone) uses the minimal venture substrate
  // (.git + package.json) — it legitimately lacks EHG_Engineer's scripts/lib, and node_modules/.env
  // are installed by the venture's own build during EXEC, not prerequisites at claim time.
  const substrate = validateWorktreeSubstrate(
    worktreePath,
    opts.isVentureWorktree ? VENTURE_SUBSTRATE_ITEMS : SUBSTRATE_ITEMS
  );
  if (!substrate.ok) {
    emitLog({
      event: 'worktree.incomplete',
      sdKey,
      worktreePath,
      missing: substrate.missing,
      errCode: 'WORKTREE_INCOMPLETE'
    });
    const err = new Error(
      `WORKTREE_INCOMPLETE: substrate items missing after creation: ${substrate.missing.join(', ')}. ` +
      `Worktree at ${worktreePath} is preserved for inspection.`
    );
    err.code = 'WORKTREE_INCOMPLETE';
    err.errCode = 'WORKTREE_INCOMPLETE';
    err.missing = substrate.missing;
    err.worktreePath = worktreePath;
    throw err;
  }

  // Verify .gitignore covers .env (SD-LEO-INFRA-AUTO-WORKTREE-START-001 US-003)
  const gitignoreCheck = verifyGitignore(worktreePath);
  if (!gitignoreCheck.ignored) {
    emitLog({ event: 'worktree.gitignore_warning', sdKey, reason: gitignoreCheck.reason });
  }

  return { path: worktreePath, branch, created: true };
}

/**
 * Ensure worktree has essential untracked files (node_modules symlink, .env copy).
 * Runs after EVERY successful resolution — not just creation — so previously
 * created worktrees also get patched up.
 *
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-001 / TR-002): driven by the
 * SUBSTRATE_ITEMS const exported from lib/worktree-manager.js so this helper
 * cannot drift away from validateWorktreeSubstrate's expectations. Items that
 * require active setup (node_modules symlink, .env copy) are gated on
 * SUBSTRATE_ITEMS membership; .env.local is opportunistic (not in the
 * substrate contract but copied if present).
 */
function ensureWorktreeEssentials(worktreePath, repoRoot, opts = {}) {
  // SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001 US-004: Structured error return
  // instead of swallowed catches. Best-effort semantics preserved (no throw) but
  // failures are surfaced so callers can log and operators can diagnose.
  const errors = [];

  // Symlink node_modules (avoids duplicating ~500MB) — only if substrate
  // contract requires it. Drift guard: if 'node_modules' is removed from
  // SUBSTRATE_ITEMS, this helper stops creating the symlink and the parity
  // test surfaces the drift.
  if (SUBSTRATE_ITEMS.includes('node_modules')) {
    const sourceModules = path.join(repoRoot, 'node_modules');
    const targetModules = path.join(worktreePath, 'node_modules');
    if (fs.existsSync(sourceModules) && !fs.existsSync(targetModules)) {
      try {
        // SD-LEO-INFRA-SMART-PER-WORKTREE-001: isolate node_modules under concurrency
        // (immune to shared-store wipes), else junction. provision handles the
        // junction fallback internally. ADDITIVE — does NOT touch sd-start's
        // fleet-safe MAIN install path.
        provisionWorktreeNodeModules(worktreePath, {
          repoRoot,
          mode: getIsolationMode(),
          activeSessionCount: opts.activeSessionCount,
          freeDiskBytes: getFreeDiskBytes(worktreePath),
          deps: { log: () => {} },
        });
      } catch (err) {
        errors.push({ step: 'provision_node_modules', message: err.message });
      }
    }
  }

  // Copy .env (gated on SUBSTRATE_ITEMS membership) plus opportunistic
  // .env.local (not part of substrate contract but copied if present).
  const envFiles = [];
  if (SUBSTRATE_ITEMS.includes('.env')) envFiles.push('.env');
  envFiles.push('.env.local');
  for (const envFile of envFiles) {
    const src = path.join(repoRoot, envFile);
    const dst = path.join(worktreePath, envFile);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      try {
        fs.copyFileSync(src, dst);
      } catch (err) {
        errors.push({ step: `copy_${envFile}`, message: err.message });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Update claude_sessions.worktree_path and worktree_branch for the session
 */
async function persistWorktreePath(sdKey, worktreePath, worktreeBranch) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createSupabaseServiceClient();

    const updateFields = { worktree_path: worktreePath };
    if (worktreeBranch) updateFields.worktree_branch = worktreeBranch;

    const { error } = await supabase
      .from('claude_sessions')
      .update(updateFields)
      .eq('sd_key', sdKey)
      .in('status', ['active', 'idle']);

    if (error) {
      emitLog({ event: 'worktree.db_update_failed', sdKey, error: error.message, errorCode: 'DB_UPDATE_FAILED' });
    }
  } catch (err) {
    emitLog({ event: 'worktree.db_update_failed', sdKey, error: err.message, errorCode: 'DB_UPDATE_FAILED' });
  }
}

function emitLog(fields) {
  const entry = { timestamp: new Date().toISOString(), ...fields };
  console.error(JSON.stringify(entry));
}

async function resolve(sdKey, mode, repoRoot, targetApp) {
  if (!validateSdKey(sdKey)) {
    return {
      sdKey, cwd: repoRoot, source: 'legacy', success: false,
      worktree: { exists: false },
      errorCode: 'INVALID_SD_KEY',
      error: `Invalid SD key: ${sdKey}`
    };
  }

  // SD-LEO-INFRA-SMART-PER-WORKTREE-001: fetch heartbeat-fresh active-session count once
  // (auto mode only) to drive the isolate-vs-junction decision in ensureWorktreeEssentials.
  const _activeSessionCount = getIsolationMode() === 'auto' ? await countActiveFreshSessions({}) : undefined;

  // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve repo root from SD's target_application
  // When an SD targets a venture repo, create worktrees in that repo instead of EHG_Engineer
  if (!targetApp) {
    try {
      const sb = createSupabaseServiceClient();
      const { data: sdRow } = await sb
        .from('strategic_directives_v2')
        .select('target_application')
        .or(`sd_key.eq.${sdKey},id.eq.${sdKey}`)
        .single();
      if (sdRow?.target_application) {
        targetApp = sdRow.target_application;
      }
    } catch {
      // Non-fatal — fall through to default repoRoot
    }
  }

  // SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-6 + FR-3: venture-vs-platform repoRoot decision.
  // The platform invariant (null/EHG_Engineer never routes to a venture) is held by the
  // pure lib/venture-repo-root.js helper (regression-tested without this file's heavy graph).
  // FR-3: the venture path is resolved DB-FIRST (applications.local_path via
  // resolveRepoPathDbFirst, registry fallback) — getVenturePath alone is registry-only and
  // misses DB-tracked ventures (e.g. CronLinter) backfilled into applications but never
  // written to registry.json, so their worktree wrongly fell through to EHG_Engineer.
  // FR-3: track whether the per-SD worktree will live INSIDE a venture clone — drives the
  // venture-aware substrate gate (a venture worktree lacks EHG_Engineer's scripts/lib/node_modules/.env).
  let isVentureWorktree = false;
  {
    // Platform SDs make NO DB call and never enter the venture branch (helper short-circuits) —
    // byte-identical platform path, FR-6 invariant intact.
    let resolveVenturePathFn = getVenturePath;
    if (targetApp && targetApp !== 'EHG_Engineer') {
      try {
        const sb = createSupabaseServiceClient();
        const dbPath = await resolveRepoPathDbFirst(targetApp, sb);
        // resolveRepoPathDbFirst already falls back to the registry resolver, so its result
        // is the authoritative venture path; wrap it as a sync closure for the pure helper.
        resolveVenturePathFn = () => dbPath;
      } catch {
        // DB unavailable — keep the registry-only resolver (prior behavior).
      }
    }
    const ventureRoot = resolveVentureRepoRoot(targetApp, repoRoot, { getVenturePath: resolveVenturePathFn });
    repoRoot = ventureRoot.repoRoot;
    isVentureWorktree = ventureRoot.source === 'venture';
    for (const logEntry of ventureRoot.logs) {
      emitLog({ ...logEntry, sdKey });
    }
  }

  // 1. Try DB lookup first
  const dbResult = await resolveFromDB(sdKey);
  if (dbResult) {
    if (!isValidWorktree(dbResult.path)) {
      emitLog({ event: 'worktree.db_path_invalid', sdKey, path: dbResult.path, errorCode: 'INVALID_WORKTREE_PATH' });
      // Fall through to scan
    } else if (!validateWorktreePath(dbResult.path, repoRoot)) {
      // QF-20260523-524 / df03b199: a DB worktree_path OUTSIDE the resolved
      // repoRoot is almost always a STALE cross-repo pointer (e.g. an old
      // EHG_Engineer-rooted path persisted for an SD whose target_application is
      // now an ehg venture). Don't hard-fail — discard the stale pointer and fall
      // through to scan/create in the correct repoRoot. The rejected path is never
      // USED, so this is safe (mirrors the isValidWorktree fall-through above).
      emitLog({ event: 'worktree.db_path_rejected', sdKey, path: dbResult.path, errorCode: 'INVALID_WORKTREE_PATH', outcome: 'fall_through_to_scan' });
      // Fall through to scan (no return).
    } else {
      const branch = getWorktreeBranch(dbResult.path);
      emitLog({ event: 'worktree.resolved', sdKey, source: 'db', resolvedCwd: dbResult.path, outcome: 'success' });
      const dbEssentials = ensureWorktreeEssentials(dbResult.path, repoRoot, { activeSessionCount: _activeSessionCount });
      if (!dbEssentials.ok) emitLog({ event: 'worktree.essentials_partial', sdKey, source: 'db', errors: dbEssentials.errors });
      return {
        sdKey, cwd: dbResult.path, source: 'db', success: true,
        worktree: { exists: true, path: dbResult.path, branch },
        sessionId: dbResult.sessionId
      };
    }
  }

  // 2. Scan filesystem
  const scanResult = resolveFromScan(sdKey, repoRoot);
  if (scanResult) {
    const branch = getWorktreeBranch(scanResult.path);
    emitLog({ event: 'worktree.resolved', sdKey, source: 'scan', resolvedCwd: scanResult.path, outcome: 'success' });

    // Persist to DB for future lookups
    await persistWorktreePath(sdKey, scanResult.path, branch);

    const scanEssentials = ensureWorktreeEssentials(scanResult.path, repoRoot, { activeSessionCount: _activeSessionCount });
    if (!scanEssentials.ok) emitLog({ event: 'worktree.essentials_partial', sdKey, source: 'scan', errors: scanEssentials.errors });
    return {
      sdKey, cwd: scanResult.path, source: 'scan', success: true,
      worktree: { exists: true, path: scanResult.path, branch }
    };
  }

  // 3. No worktree found
  if (mode === 'claim') {
    // Create one
    try {
      const created = createWorktree(sdKey, repoRoot, { activeSessionCount: _activeSessionCount, isVentureWorktree });
      emitLog({ event: 'worktree.resolved', sdKey, source: 'created', resolvedCwd: created.path, outcome: 'success' });

      // Persist to DB
      await persistWorktreePath(sdKey, created.path, created.branch);

      return {
        sdKey, cwd: created.path, source: 'created', success: true,
        worktree: { exists: true, created: true, path: created.path, branch: created.branch }
      };
    } catch (err) {
      emitLog({ event: 'worktree.create_failed', sdKey, error: err.message, errorCode: 'WORKTREE_CREATE_FAILED' });
      return {
        sdKey, cwd: repoRoot, source: 'legacy', success: false,
        worktree: { exists: false },
        errorCode: 'WORKTREE_CREATE_FAILED',
        error: err.message
      };
    }
  }

  // mode=ship, no worktree found - fallback to main repo
  emitLog({ event: 'worktree.resolved', sdKey, source: 'legacy', resolvedCwd: repoRoot, outcome: 'success' });
  return {
    sdKey, cwd: repoRoot, source: 'legacy', success: true,
    worktree: { exists: false }
  };
}

async function main() {
  const args = process.argv.slice(2);
  let sdKey = null;
  let mode = 'claim';
  let repoRoot = null;
  let targetApp = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sdKey' && args[i + 1]) { sdKey = args[++i]; }
    else if (args[i] === '--mode' && args[i + 1]) { mode = args[++i]; }
    else if (args[i] === '--repoRoot' && args[i + 1]) { repoRoot = args[++i]; }
    else if (args[i] === '--target-app' && args[i + 1]) { targetApp = args[++i]; }
    else if (!args[i].startsWith('--')) { sdKey = sdKey || args[i]; }
  }

  if (!sdKey) {
    console.error(JSON.stringify({
      success: false, errorCode: 'MISSING_SD_KEY',
      error: 'Usage: resolve-sd-workdir.js --sdKey SD-XXX [--mode claim|ship] [--repoRoot /path]'
    }));
    process.exit(1);
  }

  if (!['claim', 'ship'].includes(mode)) {
    console.error(JSON.stringify({
      success: false, errorCode: 'INVALID_MODE',
      error: `Invalid mode: ${mode}. Must be 'claim' or 'ship'.`
    }));
    process.exit(1);
  }

  const resolvedRoot = getRepoRoot(repoRoot);
  const result = await resolve(sdKey, mode, resolvedRoot, targetApp);

  // Output to stdout (machine-readable)
  process.stdout.write(JSON.stringify(result));

  if (!result.success) {
    process.exit(1);
  }
}

// Cross-platform entry point check
const _e = process.argv[1] || '';
const isMainScript = import.meta.url === `file://${_e}` ||
  import.meta.url === `file:///${_e.replace(/\\/g, '/')}`;

if (isMainScript) {
  main().catch(err => {
    console.error(JSON.stringify({
      success: false, errorCode: 'RESOLVE_FATAL',
      error: err.message, timestamp: new Date().toISOString()
    }));
    process.exit(1);
  });
}

export { resolve, resolveFromDB, resolveFromScan, validateWorktreePath, resolveVentureRepoRoot };
