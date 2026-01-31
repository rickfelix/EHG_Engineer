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
const STALE_THRESHOLD_SECONDS = 300; // 5 minutes

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
 * Find existing session for this TTY+PID
 */
function findExistingSession() {
  ensureSessionDir();

  const tty = getTTY();
  const pid = process.ppid || process.pid;

  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const filePath = path.join(SESSION_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Match by TTY and PID
      if (data.tty === tty && data.pid === pid) {
        return data;
      }
    } catch {
      // Invalid file, skip
    }
  }

  return null;
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

  // Get global defaults for new sessions
  const defaults = await getGlobalDefaults();

  const sessionData = {
    session_id: sessionId,
    tty,
    pid,
    hostname,
    codebase,
    sd_id: null,
    track: null,
    claimed_at: null,
    heartbeat_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    metadata: {
      branch,
      auto_proceed: defaults.auto_proceed,
      chain_orchestrators: defaults.chain_orchestrators
    }
  };

  // Save to local file
  ensureSessionDir();
  fs.writeFileSync(getSessionFilePath(sessionId), JSON.stringify(sessionData, null, 2));

  // Save to database
  const { error } = await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      tty,
      pid,
      hostname,
      codebase,
      status: 'idle',
      metadata: {
        branch,
        auto_proceed: defaults.auto_proceed,
        chain_orchestrators: defaults.chain_orchestrators
      }
    }, { onConflict: 'session_id' });

  if (error) {
    console.error('Warning: Could not register session in database:', error.message);
  }

  return sessionData;
}

/**
 * Update heartbeat for a session
 */
export async function updateHeartbeat(sessionId) {
  const now = new Date().toISOString();

  // Update local file
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.heartbeat_at = now;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {
      // File corrupted, ignore
    }
  }

  // Update database
  const { error } = await supabase.rpc('update_session_heartbeat', {
    p_session_id: sessionId
  });

  if (error) {
    // Fallback to direct update
    await supabase
      .from('claude_sessions')
      .update({ heartbeat_at: now, updated_at: now })
      .eq('session_id', sessionId);
  }

  return { success: true, heartbeat_at: now };
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
 */
export async function cleanupStaleSessions() {
  const results = {
    localCleaned: 0,
    dbCleaned: 0,
    errors: []
  };

  // Cleanup local files
  ensureSessionDir();
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const filePath = path.join(SESSION_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const heartbeatAge = (Date.now() - new Date(data.heartbeat_at).getTime()) / 1000;
      const pidAlive = data.pid ? isProcessRunning(data.pid) : false;

      // Stale if heartbeat too old OR process not running
      if (heartbeatAge > STALE_THRESHOLD_SECONDS || !pidAlive) {
        fs.unlinkSync(filePath);
        results.localCleaned++;
      }
    } catch (err) {
      results.errors.push(`Local file ${file}: ${err.message}`);
    }
  }

  // Cleanup database
  const { data: dbResult, error } = await supabase.rpc('cleanup_stale_sessions');

  if (error) {
    results.errors.push(`Database: ${error.message}`);
  } else if (dbResult) {
    results.dbCleaned = dbResult.stale_sessions_cleaned || 0;
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
 */
export async function endSession() {
  const session = findExistingSession();

  if (!session) {
    return { success: false, error: 'no_session' };
  }

  // Release any claim first
  if (session.sd_id) {
    await releaseCurrentClaim('session_ended');
  }

  // Mark as released in database
  await supabase
    .from('claude_sessions')
    .update({ status: 'released' })
    .eq('session_id', session.session_id);

  // Delete local file
  const filePath = getSessionFilePath(session.session_id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return { success: true, session_id: session.session_id };
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
  endSession
};
