/**
 * Concurrent Session Worktree Auto-Invocation Hook
 * SD-LEO-INFRA-AUTO-INVOKE-WORKTREE-001
 * SD-LEO-INFRA-EXTEND-WORKTREE-ISOLATION-001
 *
 * Trigger: SessionStart
 * Timeout: 5s
 *
 * Detects concurrent active sessions on the same repo+branch and
 * automatically creates a worktree to isolate the new session.
 * Supports all work types: SD, QF, and ad-hoc sessions.
 *
 * Feature flag: AUTO_WORKTREE_ON_CONCURRENT_SESSION (default: true)
 * Override: EHG_CONCURRENT_OVERRIDE=1 to skip detection
 *
 * Flow:
 * 1. Check feature flag and override
 * 2. Detect current work type from branch prefix or .ehg-session.json
 * 3. Query v_active_sessions for concurrent sessions on same codebase
 * 4. Validate liveness via heartbeat staleness
 * 5. Re-check after debounce delay to avoid race conditions
 * 6. If concurrent session confirmed, invoke worktree creation
 * 7. Emit structured log events throughout
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const STALENESS_WINDOW_S = parseInt(process.env.WORKTREE_STALENESS_WINDOW_S || '300', 10);
const RECHECK_DELAY_MS = parseInt(process.env.WORKTREE_RECHECK_DELAY_MS || '1000', 10);
const WORKTREE_TIMEOUT_MS = parseInt(process.env.WORKTREE_TIMEOUT_MS || '60000', 10);

// Structured logging
function logEvent(event, fields = {}) {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    session_id: getCurrentSessionId(),
    ...fields
  };
  console.log(`[concurrent-session-worktree] ${JSON.stringify(entry)}`);
}

/**
 * Get current session ID from local session files
 */
function getCurrentSessionId() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid) {
          return data.session_id;
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Get current codebase identifier
 */
function getCodebase() {
  const cwd = process.cwd();
  if (cwd.includes('EHG_Engineer')) return 'EHG_Engineer';
  if (cwd.includes('EHG')) return 'EHG';
  return 'unknown';
}

/**
 * Get current git branch
 */
function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Check if we are already inside a worktree
 */
function isInsideWorktree() {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return toplevel.includes('.worktrees');
  } catch {
    return false;
  }
}

/**
 * Query v_active_sessions for concurrent sessions
 */
async function findConcurrentSessions(supabase, mySessionId, codebase, branch) {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, hostname, heartbeat_age_seconds, computed_status, sd_id, tty, pid, current_branch')
    .eq('codebase', codebase)
    .in('computed_status', ['active', 'idle']);

  if (error) {
    logEvent('session.concurrent_check.error', { error: error.message });
    return [];
  }

  // Filter out our own session, stale sessions, and sessions on different branches
  // Sessions on different branches of the same codebase are EXPECTED multi-instance work
  // Only flag as concurrent when sessions share the SAME codebase AND SAME branch
  return (data || []).filter(s => {
    if (s.session_id === mySessionId) return false;
    if (s.heartbeat_age_seconds > STALENESS_WINDOW_S) return false;

    // Branch-aware filtering: if both sessions have branch info,
    // only flag as concurrent if they're on the same branch or main
    if (branch && s.current_branch) {
      const sameBranch = s.current_branch === branch;
      const eitherOnMain = s.current_branch === 'main' || branch === 'main';
      // Different non-main branches = not concurrent (expected multi-session work)
      if (!sameBranch && !eitherOnMain) return false;
    }

    return true;
  });
}

/**
 * Sleep for a given duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main hook logic
 */
/**
 * Detect the current work type from branch name or session marker files.
 * @returns {{ workType: string, workKey: string|null }}
 */
function detectWorkType() {
  const branch = getBranch();

  // Check branch prefix for work type
  if (branch.startsWith('feat/SD-') || branch.startsWith('fix/SD-') || branch.startsWith('docs/SD-')) {
    const sdMatch = branch.match(/SD-[A-Z0-9_-]+/);
    return { workType: 'SD', workKey: sdMatch ? sdMatch[0] : null };
  }
  if (branch.startsWith('qf/') || branch.startsWith('quick-fix/')) {
    const qfMatch = branch.match(/QF-[A-Z0-9_-]+/i);
    return { workType: 'QF', workKey: qfMatch ? qfMatch[0] : null };
  }
  if (branch.startsWith('adhoc/')) {
    return { workType: 'ADHOC', workKey: branch.replace('adhoc/', '') };
  }

  // Check for .ehg-session.json marker file in cwd
  try {
    const markerPath = path.join(process.cwd(), '.ehg-session.json');
    if (fs.existsSync(markerPath)) {
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      if (marker.workType && marker.workKey) {
        return { workType: marker.workType, workKey: marker.workKey };
      }
    }
  } catch {
    // Ignore marker read failures
  }

  // Default: ad-hoc or unknown
  if (branch === 'main' || branch === 'master') {
    return { workType: 'ADHOC', workKey: null };
  }
  return { workType: 'UNKNOWN', workKey: null };
}

/**
 * Run a git command via PowerShell to avoid corrupting MSYS2 shared pipe state.
 * RCA-MSYS2-PIPE-CORRUPTION-001: Direct execSync('git ...') through bash spawns
 * MSYS2 subprocesses that can corrupt stdio file descriptors for the session.
 * @param {string} gitArgs - Git command arguments (e.g., 'worktree prune')
 * @param {object} opts - Options passed to execSync (cwd, timeout, etc.)
 */
function gitViaPowerShell(gitArgs, opts = {}) {
  const escaped = gitArgs.replace(/"/g, '\\"');
  const cmd = process.platform === 'win32'
    ? `powershell.exe -NoProfile -Command "git ${escaped}"`
    : `git ${gitArgs}`;
  return execSync(cmd, { stdio: 'pipe', ...opts });
}

// No numeric cap on cleanup — the 4.5s hook timeout (see bottom of file) is the
// natural throttle. Originally capped at 3 (RCA-MSYS2-PIPE-CORRUPTION-001) but that
// caused accumulation. Now that git ops use PowerShell, subprocess storms aren't a risk.

/**
 * Check if a worktree is actively used by a running session (US-004).
 * @param {string} wtPath - Absolute path to the worktree
 * @returns {boolean} true if an active session is likely using this worktree
 */
function isWorktreeInUseBySession(wtPath) {
  try {
    const sessionFile = path.join(wtPath, '.ehg-session.json');
    if (fs.existsSync(sessionFile)) {
      const meta = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (meta.sessionId) {
        const mtime = fs.statSync(sessionFile).mtime;
        if (Date.now() - mtime.getTime() < 10 * 60 * 1000) {
          return true;
        }
      }
    }
  } catch { /* best effort */ }
  return false;
}

/**
 * Clean up stale concurrent-auto-* worktrees from previous sessions.
 * Runs inline before concurrent detection to prevent accumulation.
 * Uses 1-hour threshold (not 24h) since these are temporary by nature.
 *
 * Hardened per RCA-MSYS2-PIPE-CORRUPTION-001:
 * - PowerShell for git ops (avoids MSYS2 pipe corruption)
 * - Bounded by 4.5s hook timeout (natural throttle, no numeric cap)
 * - Active session check before deletion (prevents CWD disappearing)
 * - CWD validation after cleanup (resets to repo root if invalid)
 */
function cleanupStaleConcurrentWorktrees() {
  const maxAgeMs = 60 * 60 * 1000; // 1 hour
  const worktreesDir = path.resolve(__dirname, '../../.worktrees');

  if (!fs.existsSync(worktreesDir)) return;

  let entries;
  try {
    entries = fs.readdirSync(worktreesDir)
      .filter(e => {
        // Clean concurrent-* worktrees (temporary by nature)
        if (e.startsWith('concurrent-')) return true;
        // Clean SD worktrees whose branch is already merged to main
        if (e.startsWith('SD-')) return true;
        return false;
      });
  } catch { return; }

  if (entries.length === 0) return;

  let cleaned = 0;
  let skipped = 0;
  const repoRoot = path.resolve(__dirname, '../..');

  for (const entry of entries) {

    const wtPath = path.join(worktreesDir, entry);

    // Determine age from metadata or directory mtime
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
    if (!createdAt) {
      try { createdAt = fs.statSync(wtPath).mtime; } catch { continue; }
    }

    // US-004: Skip if an active session is using this worktree
    if (isWorktreeInUseBySession(wtPath)) {
      logEvent('session.cleanup_skipped_active', { entry, reason: 'active_session' });
      skipped++;
      continue;
    }

    // For concurrent-* worktrees: stale if older than 1 hour
    if (entry.startsWith('concurrent-')) {
      if (Date.now() - createdAt.getTime() <= maxAgeMs) continue;
    }

    // For SD-* worktrees: stale if branch is fully merged to main
    if (entry.startsWith('SD-')) {
      try {
        // Get the branch this worktree is on
        const wtBranch = gitViaPowerShell(`-C "${wtPath}" rev-parse --abbrev-ref HEAD`, {
          cwd: repoRoot, timeout: 3000
        }).toString().trim();
        // Check if that branch is merged into main
        const merged = gitViaPowerShell(`branch --merged main`, {
          cwd: repoRoot, timeout: 3000
        }).toString();
        if (!merged.includes(wtBranch)) {
          continue; // Branch not merged — still active work, skip
        }
      } catch {
        continue; // Can't determine merge status — skip to be safe
      }
    }

    // US-001: Use PowerShell for git ops to avoid MSYS2 pipe corruption
    try {
      gitViaPowerShell(`worktree unlock "${wtPath}"`, {
        cwd: repoRoot, timeout: 3000
      });
    } catch { /* not locked or already unlocked */ }

    try {
      gitViaPowerShell(`worktree remove --force "${wtPath}"`, {
        cwd: repoRoot, timeout: 5000
      });
      cleaned++;
    } catch {
      try {
        fs.rmSync(wtPath, { recursive: true, force: true });
        cleaned++;
      } catch { /* best effort */ }
    }
  }

  if (cleaned > 0) {
    try {
      gitViaPowerShell('worktree prune', { cwd: repoRoot, timeout: 3000 });
    } catch { /* best effort */ }
  }

  if (cleaned > 0 || skipped > 0) {
    logEvent('session.stale_cleanup', { cleaned, skipped, total: entries.length });
  }

  // US-005: Validate CWD still exists after cleanup (Mode A protection)
  try {
    process.cwd();
  } catch {
    try {
      process.chdir(repoRoot);
      logEvent('session.cwd_reset', { reason: 'cwd_deleted_during_cleanup', resetTo: repoRoot });
    } catch { /* nothing we can do */ }
  }
}

/**
 * Prune local branches that are fully merged into main.
 * Runs on every SessionStart to prevent branch accumulation.
 * Uses `git branch -d` (safe delete) — only removes branches whose
 * commits are reachable from main. Never touches the current branch.
 */
function pruneStaleLocalBranches() {
  const repoRoot = path.resolve(__dirname, '../..');
  try {
    const merged = gitViaPowerShell('branch --merged main', {
      cwd: repoRoot, timeout: 5000
    }).toString();

    const branches = merged.split('\n')
      .map(b => b.trim())
      .filter(b => b && !b.startsWith('*') && b !== 'main');

    if (branches.length === 0) return;

    // Delete in batches to avoid command-line length limits
    const BATCH_SIZE = 20;
    let deleted = 0;
    for (let i = 0; i < branches.length; i += BATCH_SIZE) {
      const batch = branches.slice(i, i + BATCH_SIZE);
      try {
        gitViaPowerShell(`branch -d ${batch.join(' ')}`, {
          cwd: repoRoot, timeout: 10000
        });
        deleted += batch.length;
      } catch {
        // Some branches may fail (checked out elsewhere, etc.) — that's fine
        // Try individually to maximize cleanup
        for (const b of batch) {
          try {
            gitViaPowerShell(`branch -d ${b}`, { cwd: repoRoot, timeout: 3000 });
            deleted++;
          } catch { /* skip */ }
        }
      }
    }

    if (deleted > 0) {
      logEvent('session.branch_prune', { deleted, total: branches.length });
    }
  } catch {
    // Non-critical — skip silently
  }
}

async function main() {
  // Clean up stale worktrees and branches before doing anything else
  cleanupStaleConcurrentWorktrees();
  pruneStaleLocalBranches();

  // Skip if already inside a worktree — prevents nested worktree creation.
  // Must be checked BEFORE concurrent detection, not after.
  if (isInsideWorktree()) {
    return;
  }

  // FR-5: Check feature flag (default: true)
  const featureFlag = process.env.AUTO_WORKTREE_ON_CONCURRENT_SESSION;
  if (featureFlag === 'false' || featureFlag === '0') {
    return; // Feature disabled
  }

  // Check override (FR-3: EHG_CONCURRENT_OVERRIDE)
  if (process.env.EHG_CONCURRENT_OVERRIDE === '1') {
    logEvent('session.concurrent_check.override', { overrideUsed: true });
    return;
  }

  // Detect current work type
  const { workType, workKey } = detectWorkType();

  // Initialize Supabase
  let supabase;
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch {
    return; // Supabase not available - skip silently
  }

  const mySessionId = getCurrentSessionId();
  const codebase = getCodebase();
  const branch = getBranch();

  // FR-1: Check for concurrent sessions
  const concurrent = await findConcurrentSessions(supabase, mySessionId, codebase, branch);

  // FR-6: Emit check event
  logEvent('session.concurrent_check', {
    repo_id: codebase,
    branch,
    work_type: workType,
    work_key: workKey,
    concurrent_found: concurrent.length > 0,
    concurrent_count: concurrent.length,
    staleness_window_s: STALENESS_WINDOW_S
  });

  if (concurrent.length === 0) {
    return; // No concurrent sessions - nothing to do
  }

  // FR-3: Re-check after debounce to handle simultaneous starts
  await sleep(RECHECK_DELAY_MS);

  const recheckConcurrent = await findConcurrentSessions(supabase, mySessionId, codebase, branch);

  if (recheckConcurrent.length === 0) {
    logEvent('session.concurrent_check.cleared', {
      reason: 'concurrent_session_disappeared_after_recheck'
    });
    return; // Concurrent session vanished - was likely a race
  }

  // Concurrent session confirmed - we need to create a worktree
  const otherSession = recheckConcurrent[0];

  console.log('');
  console.log('========================================');
  console.log('  CONCURRENT SESSION DETECTED');
  console.log('========================================');
  console.log(`  Other session: ${otherSession.session_id}`);
  console.log(`  Hostname: ${otherSession.hostname}`);
  console.log(`  Last heartbeat: ${otherSession.heartbeat_age_seconds}s ago`);
  if (otherSession.sd_id) {
    console.log(`  Working on: ${otherSession.sd_id}`);
  }
  console.log('');
  console.log('  Auto-creating worktree for isolation...');
  console.log('========================================');

  // FR-2: Invoke worktree creation
  logEvent('session.worktree.invoke', { reason: 'concurrent_session_detected' });
  const startTime = Date.now();

  try {
    // Determine SD key for worktree naming
    // Use a session-based key since we don't have an SD yet
    const sessionKey = mySessionId
      ? mySessionId.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 80)
      : `auto-${Date.now()}`;
    const worktreeKey = `concurrent-${sessionKey}`;

    // Create a branch for the worktree
    const worktreeBranch = `worktree/${worktreeKey}`;

    const result = execSync(
      `node "${path.resolve(__dirname, '../session-worktree.js')}" --sd-key "${worktreeKey}" --branch "${worktreeBranch}"`,
      {
        encoding: 'utf8',
        timeout: WORKTREE_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.resolve(__dirname, '../..')
      }
    );

    const durationMs = Date.now() - startTime;

    logEvent('session.worktree.result', {
      duration_ms: durationMs,
      exit_code: 0,
      timeout: false,
      worktree_key: worktreeKey
    });

    console.log(`  Worktree created in ${durationMs}ms`);
    console.log(`  Key: ${worktreeKey}`);
    console.log('');

  } catch (err) {
    const durationMs = Date.now() - startTime;
    const timedOut = err.killed || (err.code === 'ETIMEDOUT');

    // FR-4: Fail gracefully
    logEvent('session.worktree.result', {
      duration_ms: durationMs,
      exit_code: err.status || -1,
      timeout: timedOut,
      error: err.message ? err.message.substring(0, 200) : 'unknown'
    });

    console.log('');
    console.log('  ============================================');
    console.log('  WARNING: Worktree creation failed');
    console.log('  ============================================');
    if (timedOut) {
      console.log(`  Reason: Command timed out after ${WORKTREE_TIMEOUT_MS}ms`);
    } else {
      console.log(`  Reason: Exit code ${err.status || 'unknown'}`);
      if (err.stderr) {
        const stderrLines = err.stderr.split('\n').slice(-5);
        stderrLines.forEach(l => console.log(`    ${l}`));
      }
    }
    console.log('');
    console.log('  Continuing in original workspace.');
    console.log('  Manual worktree: npm run session:worktree');
    console.log('  ============================================');
    console.log('');
  }
}

// Run with timeout protection (hook has 5s timeout)
const hookTimeout = setTimeout(() => {
  // If we haven't finished in time, exit cleanly
  process.exit(0);
}, 4500);

main()
  .catch(() => {
    // Never block session start
  })
  .finally(() => {
    clearTimeout(hookTimeout);
  });
