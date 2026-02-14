/**
 * Centralized Claim Guard - SD-LEO-INFRA-CLAIM-GUARD-001
 *
 * Single enforcement gate for all SD work-initiation paths.
 * No fallbacks, no workarounds, no direct-update bypass.
 *
 * Decision tree:
 *   claimGuard(sdKey, sessionId)
 *     ├── This session owns claim? → PROCEED
 *     ├── No claim exists? → Acquire → PROCEED
 *     ├── Another ACTIVE session owns it? → HARD STOP
 *     └── Stale session owns it? → Release → Acquire → PROCEED
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const STALE_THRESHOLD_SECONDS = 300; // 5 minutes

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
 * Centralized claim enforcement gate.
 *
 * @param {string} sdKey - The SD key (e.g., 'SD-LEO-INFRA-CLAIM-GUARD-001')
 * @param {string} sessionId - The current session's terminal identity
 * @returns {Promise<{success: boolean, claim?: object, error?: string, owner?: object}>}
 */
export async function claimGuard(sdKey, sessionId) {
  if (!sdKey || !sessionId) {
    throw new Error('claimGuard requires both sdKey and sessionId');
  }

  const supabase = getSupabase();

  // Step 1: Check existing claims for this SD
  const { data: existingClaims, error: queryError } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, heartbeat_age_seconds, heartbeat_age_human, hostname, tty, codebase, computed_status')
    .eq('sd_id', sdKey);

  if (queryError) {
    throw new Error(`claimGuard: Failed to query active sessions: ${queryError.message}`);
  }

  const activeClaims = (existingClaims || []).filter(c => c.sd_id === sdKey);

  // Case 1: This session already owns the claim
  const ownClaim = activeClaims.find(c => c.session_id === sessionId);
  if (ownClaim) {
    // Update heartbeat to keep claim alive
    await supabase
      .from('claude_sessions')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('session_id', sessionId);

    return {
      success: true,
      claim: { session_id: sessionId, sd_id: sdKey, status: 'already_owned' }
    };
  }

  // Case 2: Another session holds the claim
  const otherClaims = activeClaims.filter(c => c.session_id !== sessionId);

  for (const claim of otherClaims) {
    const heartbeatAge = claim.heartbeat_age_seconds || 0;

    if (heartbeatAge < STALE_THRESHOLD_SECONDS) {
      // Active session owns it → HARD STOP
      return {
        success: false,
        error: 'claimed_by_active_session',
        owner: {
          session_id: claim.session_id,
          heartbeat_age_human: claim.heartbeat_age_human || `${Math.round(heartbeatAge)}s ago`,
          hostname: claim.hostname || 'unknown',
          tty: claim.tty || 'unknown',
          codebase: claim.codebase || 'unknown'
        }
      };
    }

    // Stale session → release it first
    console.log(`[claimGuard] Releasing stale claim from session ${claim.session_id} (${claim.heartbeat_age_human})`);
    const { error: releaseError } = await supabase.rpc('release_sd', {
      p_session_id: claim.session_id
    });
    if (releaseError) {
      console.warn(`[claimGuard] Failed to release stale session ${claim.session_id}: ${releaseError.message}`);
      // Continue anyway — the claim_sd RPC will handle the conflict
    }
  }

  // Case 3: No active claim (or stale claims released) → Acquire
  const { data: sdData } = await supabase
    .from('sd_baseline_items')
    .select('track')
    .eq('sd_id', sdKey)
    .single();

  const track = sdData?.track || 'STANDALONE';

  const { data: claimResult, error: claimError } = await supabase.rpc('claim_sd', {
    p_sd_id: sdKey,
    p_session_id: sessionId,
    p_track: track
  });

  if (claimError) {
    throw new Error(`claimGuard: claim_sd RPC failed: ${claimError.message}`);
  }

  if (claimResult && claimResult.success === false) {
    return {
      success: false,
      error: claimResult.error || 'claim_rejected',
      owner: claimResult.claimed_by ? {
        session_id: claimResult.claimed_by,
        hostname: 'unknown',
        tty: 'unknown'
      } : undefined
    };
  }

  // Update claiming_session_id on the SD (new column from migration)
  await supabase
    .from('strategic_directives_v2')
    .update({
      claiming_session_id: sessionId,
      is_working_on: true
    })
    .eq('sd_key', sdKey);

  return {
    success: true,
    claim: {
      session_id: sessionId,
      sd_id: sdKey,
      track,
      status: 'newly_acquired'
    }
  };
}

/**
 * Format a claim guard failure into a human-readable error message.
 *
 * @param {object} result - The claimGuard result with success=false
 * @returns {string} Formatted error message
 */
export function formatClaimFailure(result) {
  if (result.success) return '';

  const lines = [
    '╔══════════════════════════════════════════════════════════╗',
    '║  CLAIM GUARD: SD CLAIMED BY ANOTHER SESSION             ║',
    '╚══════════════════════════════════════════════════════════╝',
  ];

  if (result.owner) {
    lines.push(`  Session:   ${result.owner.session_id}`);
    lines.push(`  Heartbeat: ${result.owner.heartbeat_age_human || 'unknown'}`);
    lines.push(`  Hostname:  ${result.owner.hostname || 'unknown'}`);
    lines.push(`  TTY:       ${result.owner.tty || 'unknown'}`);
    lines.push(`  Codebase:  ${result.owner.codebase || 'unknown'}`);
  }

  lines.push('');
  lines.push('  This SD is actively being worked on by another session.');
  lines.push('  Pick a different SD or wait for the session to release.');
  lines.push('');

  return lines.join('\n');
}

export default { claimGuard, formatClaimFailure };
