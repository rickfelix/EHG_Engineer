#!/usr/bin/env node
/**
 * Session Manager for Multi-Instance Claude Code Coordination
 *
 * Purpose: Manage session registration, heartbeats, and stale session cleanup
 * Used by: sd-next.js, claude-session-coordinator.mjs
 *
 * Key Functions:
 * - getOrCreateSession() - Auto-register by TTY+PID
 * - updateHeartbeat() - Touch timestamp
 * - cleanupStaleSessions() - Find/release stale (>5 min)
 * - getActiveSessions() - List all active
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from EHG_Engineer (Windows-compatible)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Session file directory - use user's home directory for cross-platform compatibility
const SESSION_DIR = path.join(os.homedir(), '.claude-sessions');
const STALE_THRESHOLD_SECONDS = 900; // 15 minutes

/**
 * Get the current TTY identifier (Windows: use PID as pseudo-TTY)
 */
function getTTY() {
  try {
    if (process.platform === 'win32') {
      return `win-${process.pid}`;
    }
    return execSync('tty', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * SD-LEO-INFRA-ISL-001: Get machine identifier for terminal identity
 * Uses hostname + OS info to create a unique machine ID
 */
function getMachineId() {
  try {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    // Create a hash of machine characteristics
    const machineString = `${hostname}-${platform}-${arch}`;
    return crypto.createHash('sha256').update(machineString).digest('hex').substring(0, 16);
  } catch {
    return 'unknown';
  }
}

// PAT-SESSION-IDENTITY-003: Import centralized terminal identity
import { getTerminalId as _getTerminalId } from './terminal-identity.js';

/**
 * SD-LEO-INFRA-ISL-001: Get terminal identifier
 * Delegated to centralized lib/terminal-identity.js
 */
function getTerminalId() {
  return _getTerminalId();
}

/**
 * Get the current git branch
 */
function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Detect which codebase we're in
 */
function getCodebase() {
  const cwd = process.cwd();
  if (cwd.includes('EHG_Engineer')) return 'EHG_Engineer';
  if (cwd.includes('EHG')) return 'EHG';
  return 'unknown';
}

/**
 * Generate a unique session ID based on TTY and PID
 */
function generateSessionId() {
  const uuid = crypto.randomUUID().substring(0, 8);
  const tty = getTTY().replace(/[^a-zA-Z0-9]/g, '');
  const pid = process.ppid || process.pid; // Use parent PID (Claude Code's PID)
  return `session_${uuid}_${tty}_${pid}`;
}

/**
 * Get session file path
 */
function getSessionFilePath(sessionId) {
  return path.join(SESSION_DIR, `${sessionId}.json`);
}

/**
 * Ensure session directory exists
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Find existing session for this terminal
 * SD-LEO-FIX-FIX-SESSION-LIVENESS-001: Match by terminal_id (stable across
 * subprocesses) instead of tty+pid (unique per subprocess, causing ~65 sessions/day).
 *
 * SD-LEO-FIX-TERMINAL-IDENTITY-001 (US-002, US-003):
 *   When multiple session files match the same terminal_id, return the most
 *   recently modified file and async-cleanup the older duplicates.
 */
function findExistingSession() {
  ensureSessionDir();

  const terminalId = getTerminalId();

  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));

  // Collect all matches with their mtimes (US-002)
  const matches = [];
  for (const file of files) {
    try {
      const filePath = path.join(SESSION_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (data.terminal_id === terminalId) {
        const stat = fs.statSync(filePath);
        matches.push({ filePath, data, mtime: stat.mtimeMs });
      }
    } catch {
      // Invalid file, skip
    }
  }

  if (matches.length === 0) return null;

  // Sort by mtime descending — newest first (US-002)
  matches.sort((a, b) => b.mtime - a.mtime);

  // If duplicates exist, async-cleanup older ones (US-003)
  if (matches.length > 1) {
    const staleMatches = matches.slice(1);
    console.log(`[session-manager] Found ${matches.length} session files for terminal ${terminalId}, cleaning ${staleMatches.length} duplicates`);
    // Non-blocking cleanup — fire and forget
    _cleanupDuplicateSessions(staleMatches).catch(() => { /* silent fail */ });
  }

  return matches[0].data;
}

/**
 * SD-LEO-FIX-TERMINAL-IDENTITY-001 (US-003): Cleanup duplicate session files.
 * Deletes older local files and releases their DB sessions.
 * Non-blocking — called async from findExistingSession().
 *
 * @param {Array<{filePath: string, data: object}>} staleMatches
 */
async function _cleanupDuplicateSessions(staleMatches) {
  for (const { filePath, data } of staleMatches) {
    try {
      // Release DB session (silent fail)
      if (data.session_id) {
        await supabase.rpc('release_session', {
          p_session_id: data.session_id,
          p_reason: 'duplicate_cleanup'
        }).catch(() => { /* silent */ });
        console.log(`[session-manager] Released duplicate session: ${data.session_id}`);
      }

      // Delete local file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[session-manager] Deleted duplicate session file: ${path.basename(filePath)}`);
      }
    } catch {
      // Non-blocking — continue with next
    }
  }
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get global defaults from leo_settings table
 * Returns default values if table doesn't exist or query fails
 */
async function getGlobalDefaults() {
  try {
    const { data, error } = await supabase.rpc('get_leo_global_defaults');

    if (error) {
      // Table might not exist yet, return hard-coded defaults
      return { auto_proceed: true, chain_orchestrators: false };
    }

    if (data && data.length > 0) {
      return {
        auto_proceed: data[0].auto_proceed ?? true,
        chain_orchestrators: data[0].chain_orchestrators ?? false
      };
    }

    return { auto_proceed: true, chain_orchestrators: false };
  } catch {
    // Fallback to hard-coded defaults
    return { auto_proceed: true, chain_orchestrators: false };
  }
}

/**
 * Get or create a session for the current terminal
 * SD-LEO-INFRA-ISL-001: Uses create_or_replace_session for atomic auto-release
 */
export async function getOrCreateSession() {
  // Check for existing session
  const existing = findExistingSession();

  if (existing) {
    // Update heartbeat and return
    await updateHeartbeat(existing.session_id);
    return existing;
  }

  // Create new session
  const sessionId = generateSessionId();
  const tty = getTTY();
  const pid = process.ppid || process.pid;
  const hostname = os.hostname();
  const codebase = getCodebase();
  const branch = getBranch();

  // SD-LEO-INFRA-ISL-001: Get terminal identity components
  const machineId = getMachineId();
  const terminalId = getTerminalId();

  // Get global defaults for new sessions
  const defaults = await getGlobalDefaults();

  const metadata = {
    branch,
    auto_proceed: defaults.auto_proceed,
    chain_orchestrators: defaults.chain_orchestrators
  };

  const sessionData = {
    session_id: sessionId,
    machine_id: machineId,
    terminal_id: terminalId,
    tty,
    pid,
    hostname,
    codebase,
    sd_id: null,
    track: null,
    claimed_at: null,
    heartbeat_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    metadata
  };

  // SD-LEO-INFRA-ISL-001: Use create_or_replace_session for atomic auto-release
  // NOTE: Local file written AFTER successful DB registration (not before)
  // to prevent ghost sessions where local file exists but DB record doesn't.
  const { data: dbResult, error } = await supabase.rpc('create_or_replace_session', {
    p_session_id: sessionId,
    p_machine_id: machineId,
    p_terminal_id: terminalId,
    p_tty: tty,
    p_pid: pid,
    p_hostname: hostname,
    p_codebase: codebase,
    p_metadata: metadata
  });

  if (error) {
    // Fallback to direct upsert if RPC not available
    console.warn('Warning: create_or_replace_session RPC failed, using fallback:', error.message);
    const { error: upsertError } = await supabase
      .from('claude_sessions')
      .upsert({
        session_id: sessionId,
        machine_id: machineId,
        terminal_id: terminalId,
        tty,
        pid,
        hostname,
        codebase,
        status: 'idle',
        metadata
      }, { onConflict: 'session_id' });

    if (upsertError) {
      console.error('Error: Could not register session in database:', upsertError.message);
      console.error('Session will not be able to claim SDs without a database record.');
      return null;
    }
  } else if (dbResult && dbResult.success === false) {
    // RCA-SD-CLAIMS-FK-001: RPC returned application-level failure
    // (e.g., CHECK constraint violation on sd_claims.release_reason).
    // Supabase returns {data: {success: false}, error: null} in this case.
    console.warn('Warning: create_or_replace_session returned failure:', dbResult.message || dbResult.error || 'unknown');
    console.warn('Falling back to direct upsert...');
    const { error: upsertError } = await supabase
      .from('claude_sessions')
      .upsert({
        session_id: sessionId,
        machine_id: machineId,
        terminal_id: terminalId,
        tty,
        pid,
        hostname,
        codebase,
        status: 'idle',
        metadata
      }, { onConflict: 'session_id' });

    if (upsertError) {
      console.error('Error: Fallback upsert also failed:', upsertError.message);
      return null;
    }
  } else if (dbResult?.conflict) {
    // Heartbeat guard: another active session on this terminal has a fresh heartbeat.
    // This typically happens when sd-start.js (child process, different PID) conflicts
    // with the main Claude Code session. Same terminal = same Claude instance, so
    // adopt the existing session instead of blocking.
    console.log(`[Session] Adopting existing session: ${dbResult.conflict_session_id} (heartbeat ${dbResult.conflict_heartbeat_age_seconds}s ago)`);
    if (dbResult.conflict_sd_id) {
      console.log(`[Session] That session is working on: ${dbResult.conflict_sd_id}`);
    }
    // Rewrite sessionData to use the existing session's ID
    sessionData.session_id = dbResult.conflict_session_id;
    sessionData.adopted = true;
    sessionData.adopted_sd_id = dbResult.conflict_sd_id;
    // Skip SESSION_CREATED telemetry and local file write — we're using an existing session
    return sessionData;
  } else if (dbResult?.auto_released) {
    // Log auto-release event for observability (FR-5)
    console.log(`[Session] Auto-released previous session ${dbResult.previous_session_id} for terminal ${dbResult.terminal_identity}`);

    // Log to session lifecycle events (silent fail for telemetry)
    try {
      await supabase.rpc('log_session_event', {
        p_event_type: 'SESSION_AUTO_RELEASED',
        p_session_id: dbResult.previous_session_id,
        p_machine_id: machineId,
        p_terminal_id: terminalId,
        p_pid: pid,
        p_reason: 'AUTO_REPLACED',
        p_metadata: { new_session_id: sessionId }
      });
    } catch { /* telemetry - silent fail */ }
  }

  // Log session creation event (silent fail for telemetry)
  try {
    await supabase.rpc('log_session_event', {
      p_event_type: 'SESSION_CREATED',
      p_session_id: sessionId,
      p_machine_id: machineId,
      p_terminal_id: terminalId,
      p_pid: pid,
      p_metadata: { codebase, hostname }
    });
  } catch { /* telemetry - silent fail */ }

  // RCA-SD-CLAIMS-FK-001: Write local file AFTER successful DB registration
  // to prevent ghost sessions where local file exists but DB record doesn't.
  try {
    const sessDir = path.dirname(getSessionFilePath(sessionId));
    if (!fs.existsSync(sessDir)) {
      fs.mkdirSync(sessDir, { recursive: true });
    }
    fs.writeFileSync(getSessionFilePath(sessionId), JSON.stringify(sessionData, null, 2));
  } catch (writeErr) {
    console.warn('Warning: Could not write local session file:', writeErr.message);
    // Non-fatal: DB record exists, local file is optional
  }

  return sessionData;
}

/**
 * Update heartbeat for a session
 */
export async function updateHeartbeat(sessionId) {
  const now = new Date().toISOString();

  // Detect current git branch for multi-session safety tracking
  let currentBranch = null;
  try {
    const { execSync } = await import('child_process');
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    // Git not available or not in a repo - branch stays null
  }

  // Update local file
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.heartbeat_at = now;
      if (currentBranch) data.current_branch = currentBranch;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {
      // File corrupted, ignore
    }
  }

  // Update database with branch-aware heartbeat
  const { error } = await supabase.rpc('update_session_heartbeat_with_branch', {
    p_session_id: sessionId,
    p_branch: currentBranch
  });

  if (error) {
    // Fallback: try original RPC, then direct update
    const { error: fallbackError } = await supabase.rpc('update_session_heartbeat', {
      p_session_id: sessionId
    });

    if (fallbackError) {
      const updateFields = { heartbeat_at: now, updated_at: now };
      if (currentBranch) updateFields.current_branch = currentBranch;
      await supabase
        .from('claude_sessions')
        .update(updateFields)
        .eq('session_id', sessionId);
    }
  }

  return { success: true, heartbeat_at: now, current_branch: currentBranch };
}

/**
 * Get all active sessions
 */
export async function getActiveSessions() {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('*')
    .in('computed_status', ['active', 'idle']);

  if (error) {
    console.error('Error fetching active sessions:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get sessions with claimed SDs
 */
export async function getClaimedSessions() {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('*')
    .eq('computed_status', 'active')
    .not('sd_id', 'is', null);

  if (error) {
    console.error('Error fetching claimed sessions:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Cleanup stale sessions (>5 min no heartbeat)
 * SD-LEO-INFRA-ISL-001: Enhanced with PID validation (FR-2/US-003) and status file cleanup (US-006)
 */
export async function cleanupStaleSessions() {
  const results = {
    localCleaned: 0,
    dbCleaned: 0,
    dbStaleMarked: 0,
    pidValidationFailed: 0,
    statusFilesCleaned: 0,
    errors: []
  };

  // Cleanup local session files
  ensureSessionDir();
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
  const localMachineId = getMachineId();

  for (const file of files) {
    try {
      const filePath = path.join(SESSION_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const heartbeatAge = (Date.now() - new Date(data.heartbeat_at).getTime()) / 1000;
      const pidAlive = data.pid ? isProcessRunning(data.pid) : false;

      // FR-2/US-003: PID validation for local sessions
      if (!pidAlive && data.machine_id === localMachineId) {
        results.pidValidationFailed++;
        // Report PID validation failure to database (silent fail for telemetry)
        try {
          await supabase.rpc('report_pid_validation_failure', {
            p_session_id: data.session_id,
            p_machine_id: localMachineId
          });
        } catch { /* telemetry - silent fail */ }
      }

      // Stale if heartbeat too old OR process not running
      if (heartbeatAge > STALE_THRESHOLD_SECONDS || !pidAlive) {
        fs.unlinkSync(filePath);
        results.localCleaned++;
      }
    } catch (err) {
      results.errors.push(`Local file ${file}: ${err.message}`);
    }
  }

  // Cleanup database using enhanced RPC
  const { data: dbResult, error } = await supabase.rpc('cleanup_stale_sessions', {
    p_stale_threshold_seconds: STALE_THRESHOLD_SECONDS,
    p_batch_size: 100
  });

  if (error) {
    results.errors.push(`Database: ${error.message}`);
  } else if (dbResult) {
    results.dbStaleMarked = dbResult.sessions_marked_stale || 0;
    results.dbCleaned = dbResult.sessions_released || 0;
  }

  // US-006: Clean up stale status line files
  try {
    const { data: activeSessions } = await supabase
      .from('v_active_sessions')
      .select('session_id')
      .in('computed_status', ['active', 'idle']);

    const activeIds = new Set(activeSessions?.map(s => s.session_id) || []);
    const statusDir = path.join(process.cwd(), '.claude', 'status-line');

    if (fs.existsSync(statusDir)) {
      const statusFiles = fs.readdirSync(statusDir);
      for (const file of statusFiles) {
        const sessionMatch = file.match(/^(session|telemetry)_(.+)\.(json|txt)$/);
        if (sessionMatch) {
          const fileSessionId = sessionMatch[2];
          // Skip PID-based fallback sessions
          if (fileSessionId.startsWith('pid_')) continue;
          // Remove if session is no longer active
          if (!activeIds.has(fileSessionId)) {
            fs.unlinkSync(path.join(statusDir, file));
            results.statusFilesCleaned++;
          }
        }
      }
    }
  } catch (err) {
    results.errors.push(`Status file cleanup: ${err.message}`);
  }

  return results;
}

/**
 * Get track status for parallel opportunity detection
 */
export async function getParallelTrackStatus() {
  const { data, error } = await supabase
    .from('v_parallel_track_status')
    .select('*');

  if (error) {
    console.error('Error fetching track status:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get parallel opportunities (available SDs in uncovered tracks)
 */
export async function getParallelOpportunities() {
  const { data, error } = await supabase
    .from('v_sd_parallel_opportunities')
    .select('*')
    .eq('availability', 'available')
    .order('track')
    .order('sequence_rank');

  if (error) {
    console.error('Error fetching parallel opportunities:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get current session info from local file
 */
export function getCurrentSession() {
  const existing = findExistingSession();
  return existing;
}

/**
 * Release current session's SD claim
 */
export async function releaseCurrentClaim(reason = 'manual') {
  const session = findExistingSession();

  if (!session) {
    return { success: false, error: 'no_session', message: 'No active session found' };
  }

  if (!session.sd_id) {
    return { success: false, error: 'no_claim', message: 'Session has no active SD claim' };
  }

  const { data, error } = await supabase.rpc('release_sd', {
    p_session_id: session.session_id,
    p_reason: reason
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Update local file
  const filePath = getSessionFilePath(session.session_id);
  if (fs.existsSync(filePath)) {
    session.sd_id = null;
    session.track = null;
    session.claimed_at = null;
    session.heartbeat_at = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  return data;
}

/**
 * Mark session as released (on graceful exit)
 * SD-LEO-INFRA-ISL-001: Uses release_session RPC with idempotency
 * US-006: Cleans up session-specific status line files
 */
export async function endSession(reason = 'graceful_exit') {
  const startTime = Date.now();
  const session = findExistingSession();

  if (!session) {
    return { success: false, error: 'no_session' };
  }

  // SD-LEO-INFRA-ISL-001: Use release_session RPC (handles SD claims internally)
  const { data: dbResult, error } = await supabase.rpc('release_session', {
    p_session_id: session.session_id,
    p_reason: reason
  });

  if (error) {
    // Fallback to manual release if RPC not available
    console.warn('Warning: release_session RPC failed, using fallback:', error.message);

    // Release any claim first
    if (session.sd_id) {
      await releaseCurrentClaim(reason);
    }

    // Mark as released in database
    await supabase
      .from('claude_sessions')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_reason: reason
      })
      .eq('session_id', session.session_id);
  }

  // Delete local file
  const filePath = getSessionFilePath(session.session_id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // US-006: Clean up session-specific status line files
  try {
    const statusDir = path.join(process.cwd(), '.claude', 'status-line');
    const sessionFiles = [
      path.join(statusDir, `session_${session.session_id}.json`),
      path.join(statusDir, `session_${session.session_id}.txt`),
      path.join(statusDir, `telemetry_${session.session_id}.json`)
    ];
    for (const file of sessionFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (_e) {
    // Silent fail for status line cleanup
  }

  // FR-5: Log release event with latency (silent fail for telemetry)
  const latencyMs = Date.now() - startTime;
  try {
    await supabase.rpc('log_session_event', {
      p_event_type: 'SESSION_RELEASED',
      p_session_id: session.session_id,
      p_machine_id: session.machine_id,
      p_terminal_id: session.terminal_id,
      p_pid: session.pid,
      p_reason: reason,
      p_latency_ms: latencyMs,
      p_metadata: { had_sd_claim: !!session.sd_id }
    });
  } catch { /* telemetry - silent fail */ }

  return { success: true, session_id: session.session_id, latency_ms: latencyMs };
}

/**
 * SD-LEO-FIX-FIX-SESSION-LIVENESS-001 (US-003): Atomically switch SD claim
 * Prevents gap where session appears dead during SD transitions.
 *
 * @param {string} newSdId - SD to switch to
 * @param {string} [newTrack] - Optional new track
 * @returns {Promise<object>} - Result with success status
 */
export async function switchSdClaim(newSdId, newTrack = null) {
  const session = findExistingSession();

  if (!session) {
    return { success: false, error: 'no_session', message: 'No active session found' };
  }

  if (!session.sd_id) {
    return { success: false, error: 'no_claim', message: 'Session has no active SD claim to switch from' };
  }

  const oldSdId = session.sd_id;

  const { data, error } = await supabase.rpc('switch_sd_claim', {
    p_session_id: session.session_id,
    p_old_sd_id: oldSdId,
    p_new_sd_id: newSdId,
    p_new_track: newTrack
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.success) {
    // Update local file
    const filePath = getSessionFilePath(session.session_id);
    if (fs.existsSync(filePath)) {
      session.sd_id = newSdId;
      if (newTrack) session.track = newTrack;
      session.claimed_at = new Date().toISOString();
      session.heartbeat_at = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    }
  }

  return data;
}

// Export for use as module
export default {
  getOrCreateSession,
  updateHeartbeat,
  getActiveSessions,
  getClaimedSessions,
  cleanupStaleSessions,
  getParallelTrackStatus,
  getParallelOpportunities,
  getCurrentSession,
  releaseCurrentClaim,
  switchSdClaim,
  endSession
};
