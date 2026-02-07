/**
 * Concurrent Session Worktree Auto-Invocation Hook
 * SD-LEO-INFRA-AUTO-INVOKE-WORKTREE-001
 *
 * Trigger: SessionStart
 * Timeout: 5s
 *
 * Detects concurrent active sessions on the same repo+branch and
 * automatically creates a worktree to isolate the new session.
 *
 * Feature flag: AUTO_WORKTREE_ON_CONCURRENT_SESSION (default: true)
 *
 * Flow:
 * 1. Check feature flag
 * 2. Query v_active_sessions for concurrent sessions on same codebase
 * 3. Validate liveness via heartbeat staleness
 * 4. Re-check after debounce delay to avoid race conditions
 * 5. If concurrent session confirmed, invoke worktree creation
 * 6. Emit structured log events throughout
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const STALENESS_WINDOW_S = parseInt(process.env.WORKTREE_STALENESS_WINDOW_S || '120', 10);
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
    .select('session_id, hostname, heartbeat_age_seconds, computed_status, sd_id, tty, pid')
    .eq('codebase', codebase)
    .in('computed_status', ['active', 'idle']);

  if (error) {
    logEvent('session.concurrent_check.error', { error: error.message });
    return [];
  }

  // Filter out our own session and stale sessions
  return (data || []).filter(s => {
    if (s.session_id === mySessionId) return false;
    if (s.heartbeat_age_seconds > STALENESS_WINDOW_S) return false;
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
async function main() {
  // FR-5: Check feature flag (default: true)
  const featureFlag = process.env.AUTO_WORKTREE_ON_CONCURRENT_SESSION;
  if (featureFlag === 'false' || featureFlag === '0') {
    return; // Feature disabled
  }

  // Skip if already inside a worktree
  if (isInsideWorktree()) {
    return;
  }

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
