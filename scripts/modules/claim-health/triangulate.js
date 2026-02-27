/**
 * Claim Health Triangulation Module
 * SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001
 *
 * Cross-references multiple signal sources to detect claim discrepancies:
 * 1. claude_sessions (DB) — what sessions think they own
 * 2. strategic_directives_v2.is_working_on — what SDs think is active
 * 3. .worktrees/ directory — physical evidence of in-progress work
 * 4. OS process table — PID liveness check
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKTREES_DIR = path.join(PROJECT_ROOT, '.worktrees');

/**
 * Check if a process is running by PID
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // EPERM = process exists but no permission
  }
}

/**
 * Get active worktrees with SD keys
 * @returns {Map<string, {path: string, hasChanges: boolean, mtime: Date}>}
 */
function getActiveWorktrees() {
  const result = new Map();
  if (!fs.existsSync(WORKTREES_DIR)) return result;

  const entries = fs.readdirSync(WORKTREES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('SD-')) continue;

    const wtPath = path.join(WORKTREES_DIR, entry.name);
    let hasChanges = false;
    let mtime = new Date(0);

    try {
      const stat = fs.statSync(wtPath);
      mtime = stat.mtime;

      // Check for uncommitted changes by looking at git status
      const gitDir = path.join(wtPath, '.git');
      if (fs.existsSync(gitDir)) {
        // Simple heuristic: check if index file was recently modified
        const indexPath = typeof gitDir === 'string' && fs.statSync(gitDir).isFile()
          ? path.join(fs.readFileSync(gitDir, 'utf8').replace('gitdir: ', '').trim(), 'index')
          : path.join(gitDir, 'index');
        if (fs.existsSync(indexPath)) {
          const indexStat = fs.statSync(indexPath);
          // If git index was modified in last hour, likely has changes
          hasChanges = (Date.now() - indexStat.mtimeMs) < 3600000;
        }
      }
    } catch {
      // Skip problematic worktrees
    }

    result.set(entry.name, { path: wtPath, hasChanges, mtime });
  }

  return result;
}

/**
 * Extract PID from session_id string (format: session_{hash}_{platform}{winPid}_{ccPid})
 * @param {string} sessionId
 * @returns {number|null}
 */
function extractPidFromSessionId(sessionId) {
  if (!sessionId) return null;
  const match = sessionId.match(/_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Triangulate claim health across all signal sources
 * @param {object} supabase - Supabase client
 * @param {string} [sdKey] - Optional specific SD key to check (null = all)
 * @returns {Promise<{healthy: Array, orphaned: Array, ghost: Array, discrepancies: Array}>}
 */
export async function triangulate(supabase, sdKey = null) {
  const healthy = [];
  const orphaned = [];
  const ghost = [];
  const discrepancies = [];

  // Signal 1: Get all active/idle session claims from DB
  let sessionQuery = supabase
    .from('claude_sessions')
    .select('session_id, sd_id, status, heartbeat_at, terminal_id, pid, hostname')
    .in('status', ['active', 'idle'])
    .not('sd_id', 'is', null);

  if (sdKey) {
    sessionQuery = sessionQuery.eq('sd_id', sdKey);
  }

  const { data: sessions } = await sessionQuery;

  // Signal 2: Get all SDs with is_working_on = true
  let sdQuery = supabase
    .from('strategic_directives_v2')
    .select('sd_key, is_working_on, claiming_session_id, status')
    .eq('is_working_on', true);

  if (sdKey) {
    sdQuery = sdQuery.eq('sd_key', sdKey);
  }

  const { data: workingSDs } = await sdQuery;

  // Signal 3: Get active worktrees
  const worktrees = getActiveWorktrees();

  // Build claim map from sessions
  const sessionClaims = new Map();
  for (const s of (sessions || [])) {
    sessionClaims.set(s.sd_id, s);
  }

  // Build working-on map from SDs
  const sdWorkingOn = new Map();
  for (const sd of (workingSDs || [])) {
    sdWorkingOn.set(sd.sd_key, sd);
  }

  // Collect all unique SD keys from all sources
  const allSdKeys = new Set([
    ...sessionClaims.keys(),
    ...sdWorkingOn.keys(),
    ...worktrees.keys()
  ]);

  for (const key of allSdKeys) {
    const sessionClaim = sessionClaims.get(key);
    const sdRecord = sdWorkingOn.get(key);
    const worktree = worktrees.get(key);

    const signals = {
      hasSessionClaim: !!sessionClaim,
      hasIsWorkingOn: !!sdRecord,
      hasWorktree: !!worktree,
      pidAlive: false,
      heartbeatStale: false
    };

    // Check PID liveness and heartbeat staleness
    if (sessionClaim) {
      const pid = sessionClaim.pid || extractPidFromSessionId(sessionClaim.session_id);
      signals.pidAlive = pid ? isProcessRunning(pid) : false;
      const heartbeatAge = sessionClaim.heartbeat_at
        ? (Date.now() - new Date(sessionClaim.heartbeat_at).getTime()) / 1000
        : Infinity;
      signals.heartbeatStale = heartbeatAge > 300; // 5 minutes
    }

    const entry = {
      sdKey: key,
      signals,
      sessionId: sessionClaim?.session_id || null,
      heartbeatAge: sessionClaim?.heartbeat_at
        ? Math.round((Date.now() - new Date(sessionClaim.heartbeat_at).getTime()) / 1000)
        : null,
      worktreePath: worktree?.path || null,
      worktreeHasChanges: worktree?.hasChanges || false
    };

    // Classify
    if (signals.hasSessionClaim && signals.pidAlive && !signals.heartbeatStale) {
      // All good — healthy claim
      healthy.push({ ...entry, category: 'healthy', action: null });
    } else if (signals.hasSessionClaim && signals.heartbeatStale && !signals.pidAlive) {
      // Ghost: session claims SD but PID is dead and heartbeat stale
      ghost.push({
        ...entry,
        category: 'ghost',
        action: `Safe to release: PID dead, heartbeat ${entry.heartbeatAge}s stale`,
        autoReleasable: true
      });
    } else if (signals.hasSessionClaim && signals.heartbeatStale && signals.pidAlive) {
      // Stale but alive — may be under heavy load
      discrepancies.push({
        ...entry,
        category: 'stale_alive',
        action: `Heartbeat stale (${entry.heartbeatAge}s) but PID alive — may be busy`
      });
    } else if (!signals.hasSessionClaim && (signals.hasIsWorkingOn || signals.hasWorktree)) {
      // Orphan: no session claim but evidence of work
      const evidence = [];
      if (signals.hasIsWorkingOn) evidence.push('is_working_on=true');
      if (signals.hasWorktree) evidence.push(`worktree exists at ${worktree.path}`);
      orphaned.push({
        ...entry,
        category: 'orphaned',
        action: `Re-claim with: npm run sd:start ${key}`,
        evidence
      });
    } else if (signals.hasSessionClaim && !signals.hasWorktree && !signals.hasIsWorkingOn) {
      // Session claims it but nothing else agrees
      discrepancies.push({
        ...entry,
        category: 'session_only',
        action: 'Session claims SD but no worktree or is_working_on flag — possible stale claim'
      });
    }
  }

  return { healthy, orphaned, ghost, discrepancies };
}

/**
 * Format triangulation results as human-readable report
 * @param {object} results - Output from triangulate()
 * @returns {string}
 */
export function formatHealthReport(results) {
  const { healthy, orphaned, ghost, discrepancies } = results;
  const lines = [];

  lines.push('');
  lines.push('  \x1b[1mClaim Health Report\x1b[0m');
  lines.push('  ' + '='.repeat(60));

  if (healthy.length > 0) {
    lines.push('');
    lines.push('  \x1b[32m✅ HEALTHY (' + healthy.length + ')\x1b[0m');
    for (const h of healthy) {
      lines.push('    ' + h.sdKey);
      lines.push('      Session: ' + h.sessionId + ' | Heartbeat: ' + h.heartbeatAge + 's');
      if (h.worktreePath) lines.push('      Worktree: ✓');
    }
  }

  if (orphaned.length > 0) {
    lines.push('');
    lines.push('  \x1b[33m⚠️  ORPHANED (' + orphaned.length + ')\x1b[0m');
    for (const o of orphaned) {
      lines.push('    ' + o.sdKey);
      lines.push('      Evidence: ' + o.evidence.join(', '));
      lines.push('      → ACTION: ' + o.action);
    }
  }

  if (ghost.length > 0) {
    lines.push('');
    lines.push('  \x1b[31m👻 GHOST (' + ghost.length + ')\x1b[0m');
    for (const g of ghost) {
      lines.push('    ' + g.sdKey);
      lines.push('      Session: ' + g.sessionId + ' | Heartbeat: ' + g.heartbeatAge + 's');
      lines.push('      → ' + g.action);
    }
  }

  if (discrepancies.length > 0) {
    lines.push('');
    lines.push('  \x1b[35m🔍 DISCREPANCIES (' + discrepancies.length + ')\x1b[0m');
    for (const d of discrepancies) {
      lines.push('    ' + d.sdKey + ' [' + d.category + ']');
      lines.push('      → ' + d.action);
    }
  }

  if (healthy.length === 0 && orphaned.length === 0 && ghost.length === 0 && discrepancies.length === 0) {
    lines.push('');
    lines.push('  No active claims found.');
  }

  const total = healthy.length + orphaned.length + ghost.length + discrepancies.length;
  lines.push('');
  lines.push('  \x1b[2mSummary: ' + total + ' SD(s) | ' + healthy.length + ' healthy | ' + orphaned.length + ' orphaned | ' + ghost.length + ' ghost | ' + discrepancies.length + ' discrepancies\x1b[0m');
  lines.push('');

  return lines.join('\n');
}
