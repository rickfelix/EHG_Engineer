/**
 * Smart per-worktree node_modules provisioning — SD-LEO-INFRA-SMART-PER-WORKTREE-001.
 *
 * Retires UNCONDITIONAL junctioning. New worktrees get either:
 *   - a REAL isolated node_modules (additive `npm install`, immune to shared-store wipes), or
 *   - the cheap junction (symlinkNodeModules) — the legacy behavior.
 * decided by a pure policy from { mode, activeSessionCount, freeDiskBytes }.
 *
 * Root context: all worktrees junction to ONE shared main store, which keeps getting
 * wiped mid-session (harness 95022758) despite many op-hardening fixes + the npm-ci
 * guard (QF-20260521-389). Isolation removes the shared dependency for actively-worked
 * worktrees. Bounded: isolate only under concurrency (auto) so solo sessions stay cheap.
 *
 * Design constraints (LEAD triangulation — RISK/VALIDATION/TESTING):
 *  - ADDITIVE only: never touches sd-start's fleet-safe MAIN install (evaluateInstallDecision /
 *    fleet-lock-hash / global NODE_MODULES lock). (R4)
 *  - No global lock for per-worktree installs — they target distinct dirs and are already
 *    concurrency-safe via npm's atomic .staging + shared cache. (R5/R10)
 *  - Never leave a broken worktree: on isolated-install failure, clean the partial and fall
 *    back to a junction so the worktree is ALWAYS usable. (R7)
 *  - Heartbeat-fresh session counting; isolate on uncertainty; disk floor. (R1/R6)
 *  - Pure decision + injectable deps for unit testing without a real install. (TESTING)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { symlinkNodeModules, safeRecursiveRmWithRetry, getRepoRoot } from './worktree-manager.js';

export const ISOLATION_MODES = ['auto', 'always', 'never'];
const CONCURRENCY_THRESHOLD = 2;          // >=2 active sessions => concurrency risk
const DISK_FLOOR_BYTES = 3 * 1024 * 1024 * 1024; // ~3GB — below this, force junction
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000; // sessions stale >5min are treated inactive
const MARKER_FILE = '.worktree-nm-mode';  // dual-mode teardown hint: 'isolated' | 'junction'

/** Resolve the configured isolation mode (env-driven, default auto). */
export function getIsolationMode(env = process.env) {
  const m = String(env.WORKTREE_ISOLATION_MODE || 'auto').toLowerCase();
  return ISOLATION_MODES.includes(m) ? m : 'auto';
}

/**
 * PURE decision: should a new worktree isolate its node_modules or junction to the shared store?
 * @returns {{ strategy: 'isolate'|'junction', reason: string }}
 */
export function decideWorktreeProvisionMode({ mode = 'auto', activeSessionCount, freeDiskBytes } = {}) {
  const m = String(mode).toLowerCase();
  if (m === 'never') return { strategy: 'junction', reason: 'mode_never' };
  // Disk floor is a hard safety stop — applies even to 'always'.
  if (typeof freeDiskBytes === 'number' && freeDiskBytes < DISK_FLOOR_BYTES) {
    return { strategy: 'junction', reason: 'disk_floor' };
  }
  if (m === 'always') return { strategy: 'isolate', reason: 'mode_always' };
  if (m !== 'auto') return { strategy: 'isolate', reason: 'mode_unknown_failsafe' };
  // auto: isolate under concurrency or when the count is unknown (conservative).
  const n = Number(activeSessionCount);
  if (activeSessionCount == null || Number.isNaN(n)) return { strategy: 'isolate', reason: 'auto_uncertain_count' };
  if (n >= CONCURRENCY_THRESHOLD) return { strategy: 'isolate', reason: 'auto_concurrent' };
  return { strategy: 'junction', reason: 'auto_solo' };
}

export function defaultRunInstall(worktreePath, { execSyncImpl = execSync } = {}) {
  // Install directly in the worktree (full repo context: .npmrc/workspaces honored).
  // npm builds in node_modules/.staging then moves atomically; additive (NOT `npm ci`),
  // and cwd === worktreePath so it NEVER touches the shared main store.
  execSyncImpl('npm install --ignore-scripts --no-audit --no-fund', {
    cwd: worktreePath, stdio: 'pipe', timeout: 180000,
  });
}

function defaultWriteMarker(worktreePath, modeStr) {
  try { fs.writeFileSync(path.join(worktreePath, MARKER_FILE), modeStr + '\n'); } catch { /* best-effort */ }
}

/** Read the isolation-mode marker for teardown decisions. Returns 'isolated' | 'junction' | null. */
export function readWorktreeNmMode(worktreePath, fsImpl = fs) {
  try { return fsImpl.readFileSync(path.join(worktreePath, MARKER_FILE), 'utf8').trim() || null; }
  catch { return null; }
}

/**
 * Execute the provisioning decision. Sync + injectable for tests.
 * Never leaves a broken worktree: isolate failure → clean partial → junction fallback.
 * @returns {{ strategy: 'isolate'|'junction', reason: string, fallbackReason?: string }}
 */
export function provisionWorktreeNodeModules(worktreePath, options = {}) {
  const { repoRoot, mode = getIsolationMode(), activeSessionCount, freeDiskBytes, deps = {} } = options;
  const {
    decide = decideWorktreeProvisionMode,
    symlink = symlinkNodeModules,
    runInstall = defaultRunInstall,
    writeMarker = defaultWriteMarker,
    rm = safeRecursiveRmWithRetry,
    log = (msg) => console.log(msg),
  } = deps;

  const decision = decide({ mode, activeSessionCount, freeDiskBytes });

  if (decision.strategy === 'junction') {
    symlink(worktreePath, repoRoot);
    writeMarker(worktreePath, 'junction');
    log(`[worktree-provision] junction (${decision.reason}): ${worktreePath}`);
    return { strategy: 'junction', reason: decision.reason };
  }

  // isolate
  try {
    runInstall(worktreePath);
    writeMarker(worktreePath, 'isolated');
    log(`[worktree-provision] isolated (${decision.reason}): ${worktreePath}`);
    return { strategy: 'isolate', reason: decision.reason };
  } catch (err) {
    // Clean any partial install so the junction fallback is clean, then fall back.
    try { const nm = path.join(worktreePath, 'node_modules'); if (fs.existsSync(nm)) rm(nm); } catch { /* best-effort */ }
    try {
      symlink(worktreePath, repoRoot);
      writeMarker(worktreePath, 'junction');
      log(`[worktree-provision] isolate FAILED (${err.message}); fell back to junction: ${worktreePath}`);
      return { strategy: 'junction', reason: 'isolate_failed_fallback', fallbackReason: err.message };
    } catch (err2) {
      log(`[worktree-provision] isolate AND junction failed: ${err2.message}`);
      throw err2;
    }
  }
}

/** Count heartbeat-FRESH active sessions (stale >5min treated inactive). Returns null on any error (→ isolate). */
export async function countActiveFreshSessions({ supabase, nowMs = Date.now(), freshMs = HEARTBEAT_FRESH_MS } = {}) {
  try {
    if (!supabase) {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return null;
      supabase = createClient(url, key);
    }
    const cutoff = new Date(nowMs - freshMs).toISOString();
    const { count, error } = await supabase.from('claude_sessions')
      .select('session_id', { count: 'exact', head: true })
      .eq('status', 'active').gte('heartbeat_at', cutoff);
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch { return null; }
}

/** Free bytes on the filesystem holding dirPath; undefined if unavailable. */
export function getFreeDiskBytes(dirPath, fsImpl = fs) {
  try { const s = fsImpl.statfsSync(dirPath); return Number(s.bavail) * Number(s.bsize); }
  catch { return undefined; }
}

/**
 * Async convenience used by worktree-creation call sites: gathers mode + heartbeat-fresh
 * session count + free disk, then provisions. Keeps call sites a one-liner.
 */
export async function provisionWorktreeNodeModulesAuto(worktreePath, { repoRoot, supabase, mode } = {}) {
  const resolvedRoot = repoRoot || getRepoRoot();
  const resolvedMode = mode || getIsolationMode();
  const activeSessionCount = resolvedMode === 'auto' ? await countActiveFreshSessions({ supabase }) : undefined;
  const freeDiskBytes = getFreeDiskBytes(worktreePath);
  return provisionWorktreeNodeModules(worktreePath, { repoRoot: resolvedRoot, mode: resolvedMode, activeSessionCount, freeDiskBytes });
}

export default { decideWorktreeProvisionMode, provisionWorktreeNodeModules, provisionWorktreeNodeModulesAuto, getIsolationMode, readWorktreeNmMode, countActiveFreshSessions, getFreeDiskBytes, ISOLATION_MODES };
