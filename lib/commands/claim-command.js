/**
 * Claim Command Implementation
 * SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001 (FR-001)
 *
 * Provides list, release, and status subcommands for managing SD claims.
 * Wraps existing Supabase RPCs: release_sd, cleanup_stale_sessions
 * and views: v_active_sessions.
 */

import { createClient } from '@supabase/supabase-js';
import { resolveOwnSession } from '../resolve-own-session.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getStaleThresholdSeconds } from '../claim/stale-threshold.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let _supabase;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

/**
 * List active sessions and their claim status.
 * Queries v_active_sessions view.
 */
export async function listClaims() {
  const supabase = getSupabase();
  const threshold = getStaleThresholdSeconds();

  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, hostname, heartbeat_age_seconds, heartbeat_age_human, computed_status, tty, pid, current_branch')
    .order('heartbeat_age_seconds', { ascending: true });

  if (error) {
    console.error(`Error querying active sessions: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No active sessions found.');
    return;
  }

  console.log('');
  console.log('Active Sessions:');
  console.log('─'.repeat(100));
  console.log(
    'Session ID'.padEnd(20) +
    'SD'.padEnd(45) +
    'Heartbeat'.padEnd(15) +
    'Status'.padEnd(10)
  );
  console.log('─'.repeat(100));

  for (const session of data) {
    const shortId = (session.session_id || '').substring(0, 18);
    const sdId = session.sd_id || '(none)';
    const heartbeat = session.heartbeat_age_human || 'unknown';
    const isStale = (session.heartbeat_age_seconds || 0) > threshold;
    const status = isStale ? 'STALE' : (session.computed_status || 'active');

    console.log(
      shortId.padEnd(20) +
      sdId.substring(0, 43).padEnd(45) +
      heartbeat.padEnd(15) +
      status.padEnd(10)
    );
  }

  console.log('─'.repeat(100));
  console.log(`${data.length} session(s) found. Stale threshold: ${threshold}s`);
  console.log('');

  const staleSessions = data.filter(s => (s.heartbeat_age_seconds || 0) > threshold && s.sd_id);
  if (staleSessions.length > 0) {
    console.log('Stale sessions with active claims:');
    for (const s of staleSessions) {
      console.log(`  /claim release ${s.session_id}  (claiming ${s.sd_id})`);
    }
    console.log('');
  }
}

/**
 * Release a claim held by a specific session.
 * Calls release_sd RPC, with fallback to direct update.
 * @param {string} sessionId - The session ID to release
 */
export async function releaseClaim(sessionId) {
  if (!sessionId) {
    console.error('Usage: /claim release <session-id>');
    return;
  }

  const supabase = getSupabase();
  const threshold = getStaleThresholdSeconds();

  // Check session exists and get heartbeat info
  const { data: session, error: queryError } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, heartbeat_at, status')
    .eq('session_id', sessionId)
    .single();

  if (queryError || !session) {
    // Try prefix match
    const { data: matches } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_id, heartbeat_at, status')
      .like('session_id', `${sessionId}%`)
      .limit(5);

    if (!matches || matches.length === 0) {
      console.error(`Session not found: ${sessionId}`);
      return;
    }

    if (matches.length > 1) {
      console.error('Ambiguous session ID. Matches:');
      for (const m of matches) {
        console.log(`  ${m.session_id} (SD: ${m.sd_id || 'none'})`);
      }
      return;
    }

    // Exact prefix match found
    return releaseClaim(matches[0].session_id);
  }

  if (!session.sd_id) {
    console.log(`Session ${sessionId} has no active claim.`);
    return;
  }

  // Check freshness - warn if heartbeat is recent
  const heartbeatAge = session.heartbeat_at
    ? (Date.now() - new Date(session.heartbeat_at).getTime()) / 1000
    : 9999;

  if (heartbeatAge < threshold) {
    console.log(`WARNING: Session has fresh heartbeat (${Math.round(heartbeatAge)}s ago).`);
    console.log(`This session may be actively working on ${session.sd_id}.`);
    console.log('Proceeding with release anyway (operator override)...');
  }

  // Call release_sd RPC
  const { error: releaseError } = await supabase.rpc('release_sd', {
    p_session_id: sessionId,
    p_reason: 'manual'
  });

  if (releaseError) {
    console.warn(`RPC release failed: ${releaseError.message}. Trying direct update...`);
    const { error: directErr } = await supabase
      .from('claude_sessions')
      .update({
        sd_id: null,
        released_at: new Date().toISOString(),
        released_reason: 'manual_claim_release',
        status: 'idle'
      })
      .eq('session_id', sessionId);

    if (directErr) {
      console.error(`Failed to release claim: ${directErr.message}`);
      return;
    }
  }

  console.log(`Released claim on ${session.sd_id} from session ${sessionId}.`);
  console.log('The SD is now available for other sessions.');
}

/**
 * Show current session's claim status.
 */
export async function claimStatus() {
  const supabase = getSupabase();

  const { data: session, source } = await resolveOwnSession(supabase, {
    select: 'session_id, sd_id, heartbeat_at, status, claimed_at, track'
  });

  if (!session) {
    console.log('No active session found for current session.');
    return;
  }

  if (source === 'heartbeat_fallback') {
    console.warn('⚠️  Session resolved via heartbeat fallback — identity may be incorrect');
  }
  console.log('');
  console.log('Current Session Claim Status:');
  console.log('─'.repeat(50));
  console.log(`  Session: ${session.session_id}`);
  console.log(`  Status:  ${session.status}`);
  console.log(`  SD:      ${session.sd_id || '(none - no active claim)'}`);
  console.log(`  Track:   ${session.track || '(none)'}`);

  if (session.heartbeat_at) {
    const age = (Date.now() - new Date(session.heartbeat_at).getTime()) / 1000;
    console.log(`  Heartbeat: ${Math.round(age)}s ago`);
  }
  console.log('─'.repeat(50));
  console.log('');
}

export default { listClaims, releaseClaim, claimStatus };
