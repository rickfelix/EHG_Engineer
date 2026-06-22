/**
 * node_modules Empty-Store Auto-Heal Hook
 * SD-REFILL-00RXDLKM
 *
 * Trigger: SessionStart
 *
 * The shared node_modules store is periodically emptied mid-session (parallel-session
 * junction-reap, a non-Bash `npm ci`, or an override-flagged install), bricking every
 * parallel session with ERR_MODULE_NOT_FOUND (@supabase/supabase-js, dotenv). The existing
 * NPM CI SHARED-STORE WIPE GUARD (pre-tool-enforce.cjs ENFORCEMENT 12c) only intercepts the
 * Bash tool's `npm ci` and cannot cover non-Bash invocations. This hook is the RECOVERY
 * counterpart: detect an empty store at session start and ADDITIVELY re-install it, so a wipe
 * self-heals regardless of how it happened.
 *
 * Safety properties:
 *   - HERD-SAFE: an atomic single-healer lock (fs.mkdirSync) means exactly one session installs
 *     when N sessions all detect an empty store in the same window; the rest skip.
 *   - ADDITIVE-ONLY: runs `npm install --ignore-scripts --no-audit --no-fund` — NEVER `npm ci`
 *     or `rm -rf node_modules` — so the hook can itself never wipe the shared store.
 *   - FAIL-OPEN: any error exits 0 with a logged warning; it can never block session startup.
 *   - FAST-EXIT: a healthy store is a <200ms no-op (no install).
 *
 * All decision logic is pure + dependency-injected so tests never run a real install.
 * main() is guarded behind require.main === module so the helpers are importable.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The critical dependency used as the "is the store alive?" sentinel. If THIS resolves, the
// store is populated; the wipe class always takes it out (it is a top-level prod dependency).
const CRITICAL_DEP = '@supabase/supabase-js';

// Stale-lock TTL: a heal that started longer ago than this is assumed crashed and its lock is
// reclaimable, so a dead healer can never wedge the heal forever. Overridable for tests/ops.
const HEAL_LOCK_TTL_MS = Number(process.env.HEAL_LOCK_TTL_MS) || 180000;

const LOCK_DIRNAME = '.node-modules-heal.lock';

/** Single structured, grep-able log line. Never throws. */
function logHeal(event, extra = {}, logger = console.error) {
  try {
    logger(`[node-modules-autoheal] ${JSON.stringify({ event, ...extra })}`);
  } catch { /* logging must never break the hook */ }
}

/**
 * Pure detection: does THIS repo-root store need healing? True when rootDir/node_modules is
 * missing OR the critical sentinel dependency's package.json is absent from it.
 *
 * IMPORTANT: this checks the EXACT filesystem path rootDir/node_modules/<dep>/package.json — it
 * deliberately does NOT use require.resolve, because require.resolve walks UP the directory tree
 * and would resolve the sentinel in a PARENT node_modules (e.g. a git worktree whose own store is
 * emptied falling back to the main-repo store), masking the very wipe we must detect.
 *
 * An unexpected fs error resolves to FALSE — we never auto-install on a signal we cannot read
 * cleanly (a false-positive heal is worse than a missed one; the empty-store signal is a plain
 * missing path).
 *
 * @param {string} rootDir repo root containing node_modules
 * @param {object} [opts]
 * @param {(p:string)=>boolean} [opts.existsSync]
 * @returns {boolean}
 */
function needsHeal(rootDir, opts = {}) {
  const existsSync = opts.existsSync || fs.existsSync;
  try {
    const nm = path.join(rootDir, 'node_modules');
    if (!existsSync(nm)) return true; // store entirely gone
    // Exact-path check for the sentinel dep — NO upward walk (see note above).
    const depPkg = path.join(nm, ...CRITICAL_DEP.split('/'), 'package.json');
    return !existsSync(depPkg);
  } catch {
    return false; // never auto-install on an unexpected error
  }
}

/**
 * Pure: is a lock whose dir mtime is `lockMtimeMs` stale at `nowMs` given `ttlMs`?
 * @returns {boolean}
 */
function isStaleLock(lockMtimeMs, nowMs, ttlMs) {
  if (typeof lockMtimeMs !== 'number' || Number.isNaN(lockMtimeMs)) return true; // unreadable → reclaim
  return (nowMs - lockMtimeMs) > ttlMs;
}

/**
 * Acquire the single-healer lock by atomically creating the lock dir. fs.mkdirSync is atomic on
 * both Windows and POSIX (EEXIST when it already exists), so exactly one concurrent caller wins.
 * If the existing lock is stale (older than ttlMs), it is reclaimed once and re-attempted.
 *
 * @param {string} lockPath
 * @param {object} [io] injectable fs surface for tests
 * @returns {boolean} true if THIS caller now holds the lock (and must release it)
 */
function acquireHealLock(lockPath, io = {}) {
  const mkdir = io.mkdir || ((p) => fs.mkdirSync(p));
  const statMtimeMs = io.statMtimeMs || ((p) => fs.statSync(p).mtimeMs);
  const rmdir = io.rmdir || ((p) => fs.rmSync(p, { recursive: true, force: true }));
  const nowMs = io.nowMs != null ? io.nowMs : Date.now();
  const ttlMs = io.ttlMs != null ? io.ttlMs : HEAL_LOCK_TTL_MS;
  try {
    mkdir(lockPath);
    return true; // created → we own it
  } catch (e) {
    if (!e || e.code !== 'EEXIST') return false; // unexpected error → do not heal (fail-open)
    // Lock exists. Reclaim it only if stale, then retry once.
    let mtime;
    try { mtime = statMtimeMs(lockPath); } catch { mtime = NaN; }
    if (!isStaleLock(mtime, nowMs, ttlMs)) return false; // a live healer owns it → skip
    try { rmdir(lockPath); } catch { return false; }
    try { mkdir(lockPath); return true; } catch { return false; } // lost the reclaim race → skip
  }
}

/**
 * Pure: the additive, never-destructive heal command. ALWAYS `npm install` with the safe flags —
 * never `npm ci`, never a remove. Returns { cmd, args } for spawnSync.
 */
function buildHealCommand() {
  return { cmd: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund'] };
}

/** Thin imperative wrapper: detect → lock → additive install → release. Fail-open. */
function main(rootDir = path.resolve(__dirname, '..', '..')) {
  try {
    if (!needsHeal(rootDir)) { return 0; } // healthy store → silent fast-exit
    const lockPath = path.join(rootDir, LOCK_DIRNAME);
    if (!acquireHealLock(lockPath)) {
      logHeal('heal-skip', { reason: 'another session is healing (lock held)' });
      return 0;
    }
    try {
      logHeal('heal-start', { dep: CRITICAL_DEP });
      const { cmd, args } = buildHealCommand();
      const res = spawnSync(cmd, args, { cwd: rootDir, encoding: 'utf8', stdio: 'ignore', shell: process.platform === 'win32', windowsHide: true });
      if (res.status === 0 && !needsHeal(rootDir)) {
        logHeal('heal-done', {});
      } else {
        logHeal('heal-fail', { status: res.status, error: res.error && res.error.message });
      }
    } finally {
      try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch { /* best-effort release */ }
    }
  } catch (e) {
    logHeal('heal-error', { error: e && e.message }); // fail-open: never block session start
  }
  return 0;
}

module.exports = {
  CRITICAL_DEP,
  HEAL_LOCK_TTL_MS,
  LOCK_DIRNAME,
  needsHeal,
  isStaleLock,
  acquireHealLock,
  buildHealCommand,
  main,
};

if (require.main === module) {
  process.exit(main());
}
