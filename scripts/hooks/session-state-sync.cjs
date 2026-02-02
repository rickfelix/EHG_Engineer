/**
 * Session State Sync Hook
 *
 * Validates and synchronizes auto-proceed state on session start.
 * Ensures database is the single source of truth (PAT-STATE-SYNC-001).
 *
 * Trigger: SessionStart
 *
 * What it does:
 * 1. Checks if there's an active session with claimed SD
 * 2. Validates that auto-proceed-state.json matches database
 * 3. Auto-fixes mismatches (database wins)
 * 4. Outputs warning if divergence detected
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

const STATE_FILE = path.resolve(__dirname, '../../.claude/auto-proceed-state.json');

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
 * Read local state file
 */
function readLocalState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    // Ignore read errors
  }
  return { currentSd: null, currentPhase: null };
}

/**
 * Write local state file
 */
function writeLocalState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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

    const localState = readLocalState();
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

      writeLocalState(fixedState);

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
}

// Run
main().catch(() => {});
