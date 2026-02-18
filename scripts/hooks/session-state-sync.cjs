/**
 * Session State Sync Hook
 *
 * Validates and synchronizes auto-proceed state on session start.
 * Ensures database is the single source of truth (PAT-STATE-SYNC-001).
 *
 * SD-LEO-INFRA-COMPACTION-CLAIM-001: Also restores SD claims lost
 * during context compaction by invoking reclaim-sd-after-compaction.cjs.
 *
 * Trigger: SessionStart
 *
 * What it does:
 * 1. Checks if there's an active session with claimed SD
 * 2. Validates that auto-proceed-state.json matches database
 * 3. Auto-fixes mismatches (database wins)
 * 4. Outputs warning if divergence detected
 * 5. Attempts SD re-claim if preserved state exists but session has no claim
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Supabase setup
let supabase = null;
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
} catch {
  // Supabase not available - skip validation
}

const STATE_DIR = path.resolve(__dirname, '../../.claude');
const LEGACY_STATE_FILE = path.resolve(STATE_DIR, 'auto-proceed-state.json');

/**
 * Get current session ID from local session file
 */
function getCurrentSessionId() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
      if (data.pid === pid) {
        return data.session_id;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Get session-scoped state file path (SD-LEO-INFRA-CLAIM-GUARD-001: US-005).
 * Prevents cross-session contamination of auto-proceed state.
 */
function getStateFile(sessionId) {
  if (sessionId) {
    return path.resolve(STATE_DIR, `auto-proceed-state.${sessionId}.json`);
  }
  return LEGACY_STATE_FILE;
}

/**
 * Read local state file (session-scoped with legacy fallback)
 */
function readLocalState(sessionId) {
  const scopedFile = getStateFile(sessionId);
  try {
    if (fs.existsSync(scopedFile)) {
      return JSON.parse(fs.readFileSync(scopedFile, 'utf8'));
    }
    // Fallback: read legacy shared file (read-only)
    if (scopedFile !== LEGACY_STATE_FILE && fs.existsSync(LEGACY_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(LEGACY_STATE_FILE, 'utf8'));
    }
  } catch {
    // Ignore read errors
  }
  return { currentSd: null, currentPhase: null };
}

/**
 * Write local state file (always to session-scoped path)
 */
function writeLocalState(state, sessionId) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const targetFile = getStateFile(sessionId);
    fs.writeFileSync(targetFile, JSON.stringify(state, null, 2));
  } catch {
    // Ignore write errors
  }
}

async function main() {
  if (!supabase) {
    // Skip validation if Supabase not available
    return;
  }

  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    // No session yet - skip validation
    return;
  }

  try {
    // Get database state
    const { data: session, error } = await supabase
      .from('claude_sessions')
      .select('sd_id, metadata')
      .eq('session_id', sessionId)
      .single();

    if (error || !session) {
      return; // Session not in database yet
    }

    const localState = readLocalState(sessionId);
    const dbSdId = session.sd_id;
    const dbExecState = session.metadata?.execution_state || {};

    // Check for mismatches
    const warnings = [];

    // Mismatch 1: Claimed SD vs execution state SD
    if (dbSdId && localState.currentSd !== dbSdId) {
      warnings.push(`SD mismatch: file=${localState.currentSd || 'none'}, db_claim=${dbSdId}`);
    }

    // Mismatch 2: Database execution_state vs local file
    if (dbExecState.currentSd && localState.currentSd !== dbExecState.currentSd) {
      warnings.push(`Execution state mismatch: file=${localState.currentSd || 'none'}, db_exec=${dbExecState.currentSd}`);
    }

    // Auto-fix: Database wins
    if (warnings.length > 0) {
      const fixedState = {
        ...localState,
        currentSd: dbSdId || dbExecState.currentSd || localState.currentSd,
        currentPhase: dbExecState.currentPhase || localState.currentPhase,
        currentTask: dbExecState.currentTask || localState.currentTask,
        isActive: dbExecState.isActive ?? localState.isActive ?? false,
        wasInterrupted: dbExecState.wasInterrupted ?? localState.wasInterrupted ?? false,
        lastUpdatedAt: new Date().toISOString()
      };

      writeLocalState(fixedState, sessionId);

      // Output warning with fix notice
      console.log('');
      console.log('========================================');
      console.log('  SESSION STATE SYNC (PAT-STATE-SYNC-001)');
      console.log('========================================');
      warnings.forEach(w => console.log(`  ⚠️  ${w}`));
      console.log(`  ✅ Auto-fixed: Local state synced from database`);
      console.log(`     SD: ${fixedState.currentSd || '(none)'}`);
      console.log(`     Phase: ${fixedState.currentPhase || '(none)'}`);
      console.log('========================================');
      console.log('');
    }

  } catch (err) {
    // Silent fail - don't block session start
    console.warn(`[session-state-sync] Warning: ${err.message}`);
  }

  // SD-LEO-INFRA-COMPACTION-CLAIM-001: Check for SD claim that needs restoring
  try {
    await attemptSDReclaim(sessionId);
  } catch (err) {
    console.warn(`[session-state-sync] Reclaim warning: ${err.message}`);
  }
}

/**
 * Attempt to restore an SD claim from preserved state after compaction.
 * Only acts if: (1) current session has no claim, (2) preserved state has an SD,
 * (3) previous session's claim is stale.
 */
async function attemptSDReclaim(currentSessionId) {
  if (!supabase || !currentSessionId) return;

  // Check if current session already has a claim
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('sd_id')
    .eq('session_id', currentSessionId)
    .single();

  if (session?.sd_id) return; // Already has a claim

  // Read preserved state
  const unifiedStateFile = path.resolve(__dirname, '../../.claude/unified-session-state.json');
  if (!fs.existsSync(unifiedStateFile)) return;

  const stateAge = Date.now() - fs.statSync(unifiedStateFile).mtimeMs;
  if (stateAge > 30 * 60 * 1000) return; // State too old (>30 min)

  let state;
  try {
    state = JSON.parse(fs.readFileSync(unifiedStateFile, 'utf8'));
  } catch { return; }

  if (!state?.sd?.id) return; // No SD in preserved state

  const sdKey = state.sd.id;
  const previousSessionId = state.sd.previousSessionId;

  // Check if SD is still claimed by previous (now-stale) session
  const { data: existingClaims } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at, status')
    .eq('sd_id', sdKey)
    .eq('status', 'active');

  if (existingClaims && existingClaims.length > 0) {
    const claim = existingClaims[0];
    const heartbeatAge = Date.now() - new Date(claim.heartbeat_at).getTime();
    const isStale = heartbeatAge > 5 * 60 * 1000; // 5 min threshold

    if (!isStale) {
      // Claim is still active - don't interfere
      return;
    }

    // Release stale claim
    console.log(`[session-state-sync] Releasing stale claim on ${sdKey} (age: ${Math.round(heartbeatAge / 1000)}s)`);
    await supabase.rpc('release_sd', {
      p_session_id: claim.session_id,
      p_reason: 'compaction_auto_reclaim'
    });
  }

  // SD-LEO-INFRA-CLAIM-GUARD-001: Use centralized claimGuard (no fallbacks)
  try {
    const { claimGuard } = require('../../lib/claim-guard.cjs');
    const result = await claimGuard(sdKey, currentSessionId);

    if (!result.success) {
      console.log(`[session-state-sync] ❌ Claim guard rejected: ${result.error}`);
      if (result.owner) {
        console.log(`[session-state-sync]    Owner: ${result.owner.session_id} (${result.owner.heartbeat_age_human})`);
      }
      return; // Do not proceed without valid claim
    }

    console.log('');
    console.log('========================================');
    console.log('  SD CLAIM RESTORED (COMPACTION-CLAIM-001)');
    console.log('========================================');
    console.log(`  SD: ${sdKey}`);
    console.log(`  Phase: ${state.sd.phase || 'unknown'}`);
    if (previousSessionId) {
      console.log(`  Previous session: ${previousSessionId}`);
    }
    console.log(`  ✅ Claim transferred to: ${currentSessionId} (${result.claim.status})`);
    console.log('========================================');
    console.log('');
  } catch (err) {
    console.warn(`[session-state-sync] Reclaim failed: ${err.message}`);
  }
}

// Run
main().catch(() => {});
