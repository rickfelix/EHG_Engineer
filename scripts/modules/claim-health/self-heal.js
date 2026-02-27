/**
 * Self-Heal Module
 * SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001
 *
 * Auto-releases ghost claims and flags orphans during heartbeat ticks.
 * Designed to complete within 2 seconds to not delay heartbeat cycle.
 */

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
    return e.code === 'EPERM';
  }
}

/**
 * Extract PID from session_id string
 * @param {string} sessionId
 * @returns {number|null}
 */
function extractPid(sessionId) {
  if (!sessionId) return null;
  const match = sessionId.match(/_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

const STALE_THRESHOLD_SECONDS = 300; // 5 minutes

/**
 * Run self-heal check during heartbeat tick.
 * Releases ghost claims (stale heartbeat + dead PID).
 * Logs orphaned work for visibility.
 *
 * @param {object} supabase - Supabase client
 * @param {string} currentSessionId - The current session's ID (to avoid self-release)
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] - If true, don't actually release, just report
 * @returns {Promise<{released: string[], orphans: string[], errors: string[]}>}
 */
export async function selfHeal(supabase, currentSessionId, options = {}) {
  const { dryRun = false } = options;
  const released = [];
  const orphans = [];
  const errors = [];

  try {
    // Find all sessions with SD claims that have stale heartbeats
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_SECONDS * 1000).toISOString();
    const { data: staleSessions, error: queryErr } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_id, heartbeat_at, pid, hostname')
      .in('status', ['active', 'idle'])
      .not('sd_id', 'is', null)
      .lt('heartbeat_at', staleThreshold);

    if (queryErr) {
      errors.push(`Query error: ${queryErr.message}`);
      return { released, orphans, errors };
    }

    const os = await import('os');
    const myHostname = os.hostname();

    for (const session of (staleSessions || [])) {
      // Never release our own session
      if (session.session_id === currentSessionId) continue;

      // Only auto-release if same host (can verify PID)
      if (session.hostname !== myHostname) continue;

      const pid = session.pid || extractPid(session.session_id);
      if (!pid) continue;

      // Only release if PID is confirmed dead
      if (isProcessRunning(pid)) continue;

      // Ghost claim confirmed: stale heartbeat + same host + dead PID
      if (dryRun) {
        released.push(`[dry-run] Would release ${session.sd_id} from ${session.session_id} (PID ${pid} dead)`);
        continue;
      }

      // Release via RPC
      const { error: releaseErr } = await supabase.rpc('release_sd', {
        p_session_id: session.session_id
      });

      if (releaseErr) {
        errors.push(`Failed to release ${session.sd_id}: ${releaseErr.message}`);
      } else {
        released.push(session.sd_id);
        console.log(`[self-heal] Ghost claim released: ${session.sd_id} (session ${session.session_id}, PID ${pid} dead)`);
      }
    }
  } catch (e) {
    errors.push(`Self-heal error: ${e.message}`);
  }

  return { released, orphans, errors };
}
