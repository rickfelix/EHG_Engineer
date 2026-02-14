/**
 * Re-claim SD After Context Compaction
 * SD-LEO-INFRA-COMPACTION-CLAIM-001
 *
 * Called by session-state-sync.cjs during session start to restore
 * an SD claim that was lost during context compaction.
 *
 * Flow:
 * 1. Reads unified-session-state.json for previous SD claim
 * 2. Checks if previous session is stale (heartbeat > 5 min)
 * 3. Releases stale claim if needed
 * 4. Claims SD for current session
 *
 * Usage: node scripts/hooks/reclaim-sd-after-compaction.cjs [--session-id <id>]
 *
 * Exit codes:
 *   0 = Success (claim restored or no claim needed)
 *   1 = Error (claim failed)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const UNIFIED_STATE_FILE = path.resolve(__dirname, '../../.claude/unified-session-state.json');
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_STATE_AGE_MS = 30 * 60 * 1000; // 30 minutes

let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
} catch {
  // Supabase not available
}

/**
 * Find current session ID from local session files
 */
function findCurrentSessionId() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid) return data.session_id;
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Read the preserved state from unified-session-state.json
 */
function readPreservedState() {
  try {
    if (!fs.existsSync(UNIFIED_STATE_FILE)) return null;

    const stat = fs.statSync(UNIFIED_STATE_FILE);
    const ageMs = Date.now() - stat.mtimeMs;

    // Only use state files less than 30 minutes old
    if (ageMs > MAX_STATE_AGE_MS) return null;

    const content = JSON.parse(fs.readFileSync(UNIFIED_STATE_FILE, 'utf8'));
    return content;
  } catch {
    return null;
  }
}

async function main() {
  if (!supabase) {
    console.log('[RECLAIM] Supabase not available - skipping');
    return;
  }

  // Parse args
  let explicitSessionId = null;
  const args = process.argv.slice(2);
  const sessionIdIdx = args.indexOf('--session-id');
  if (sessionIdIdx !== -1 && args[sessionIdIdx + 1]) {
    explicitSessionId = args[sessionIdIdx + 1];
  }

  const currentSessionId = explicitSessionId || findCurrentSessionId();
  if (!currentSessionId) {
    console.log('[RECLAIM] No current session found - skipping');
    return;
  }

  // Check if current session already has a claim
  const { data: currentSession } = await supabase
    .from('claude_sessions')
    .select('sd_id')
    .eq('session_id', currentSessionId)
    .single();

  if (currentSession?.sd_id) {
    console.log(`[RECLAIM] Session already has claim: ${currentSession.sd_id}`);
    return;
  }

  // Read preserved state
  const state = readPreservedState();
  if (!state?.sd?.id) {
    console.log('[RECLAIM] No SD claim in preserved state - nothing to restore');
    return;
  }

  const sdKey = state.sd.id;
  const previousSessionId = state.sd.previousSessionId;

  console.log(`[RECLAIM] Found preserved SD claim: ${sdKey}`);
  if (previousSessionId) {
    console.log(`[RECLAIM] Previous session: ${previousSessionId}`);
  }

  // Check if the SD is currently claimed by another session
  const { data: existingClaims } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, heartbeat_at, status')
    .eq('sd_id', sdKey)
    .eq('status', 'active');

  if (existingClaims && existingClaims.length > 0) {
    const claim = existingClaims[0];

    // Is it our previous session?
    const isPreviousSession = claim.session_id === previousSessionId;
    const heartbeatAge = Date.now() - new Date(claim.heartbeat_at).getTime();
    const isStale = heartbeatAge > STALE_THRESHOLD_MS;

    if (isPreviousSession && isStale) {
      // Release the stale previous session's claim
      console.log(`[RECLAIM] Previous session is stale (${Math.round(heartbeatAge / 1000)}s) - releasing`);
      await supabase.rpc('release_sd', {
        p_session_id: previousSessionId,
        p_reason: 'compaction_reclaim'
      });
    } else if (!isPreviousSession) {
      // Another session holds the claim - don't steal it
      console.log(`[RECLAIM] SD claimed by different session: ${claim.session_id} (age: ${Math.round(heartbeatAge / 1000)}s)`);
      if (isStale) {
        console.log('[RECLAIM] That session is stale - releasing for re-claim');
        await supabase.rpc('release_sd', {
          p_session_id: claim.session_id,
          p_reason: 'stale_compaction_reclaim'
        });
      } else {
        console.log('[RECLAIM] That session is still active - aborting re-claim');
        return;
      }
    } else {
      // It's our previous session but NOT stale - shouldn't happen post-compaction
      console.log(`[RECLAIM] Previous session still active (${Math.round(heartbeatAge / 1000)}s) - waiting for staleness`);
      return;
    }
  }

  // SD-LEO-INFRA-CLAIM-GUARD-001: Use centralized claimGuard (no fallbacks)
  try {
    const { claimGuard } = require('../../lib/claim-guard.cjs');
    const result = await claimGuard(sdKey, currentSessionId);

    if (!result.success) {
      console.log(`[RECLAIM] ❌ Claim guard rejected: ${result.error}`);
      if (result.owner) {
        console.log(`[RECLAIM]    Owner: ${result.owner.session_id} (${result.owner.heartbeat_age_human})`);
      }
      process.exit(1);
    }

    console.log(`[RECLAIM] ✅ SD ${sdKey} re-claimed via claimGuard (${result.claim.status})`);
  } catch (err) {
    console.log(`[RECLAIM] Error during claim: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[RECLAIM] Fatal: ${err.message}`);
  process.exit(1);
});
