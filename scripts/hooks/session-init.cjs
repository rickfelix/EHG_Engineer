#!/usr/bin/env node

/**
 * Session Initialization Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 1 Foundation
 *
 * PreToolUse (once: true) hook that initializes session state at the start
 * of each Claude Code session. This hook runs only once before the first
 * tool execution.
 *
 * Hook Type: PreToolUse (once: true)
 * Purpose: Session initialization, SD detection, baseline setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load environment variables
require('dotenv').config();

const SESSION_STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.claude-session-state.json');

/**
 * PRD requirements by SD type (for verification)
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-K
 */
const PRD_REQUIREMENTS = {
  feature: { required: true, minSections: 5 },
  bugfix: { required: false, minSections: 2 },
  security: { required: true, minSections: 4 },
  enhancement: { required: true, minSections: 3 },
  refactor: { required: false, minSections: 2 },
  documentation: { required: false, minSections: 1 },
  orchestrator: { required: true, minSections: 2 },
  infrastructure: { required: false, minSections: 2 }
};
const PLAN_MODE_STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.claude-plan-mode-state.json');
const LEO_CONFIG_FILE = path.join(__dirname, '../../.claude/leo-plan-mode-config.json');
const ENGINEER_DIR = '.';

/**
 * Get Supabase client (lazy initialization)
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-K
 */
function getSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (error) {
    return null;
  }
}

/**
 * Verify SD state in database
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-K
 *
 * Queries strategic_directives_v2 for SD details, checks PRD if phase > LEAD,
 * counts handoffs, and outputs verification summary.
 *
 * @param {string} sdKey - The SD key to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifySDStateInDatabase(sdKey) {
  if (!sdKey) {
    return { verified: false, reason: 'no_sd_key' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { verified: false, reason: 'no_database_connection' };
  }

  try {
    // Query SD from database
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, sd_type, status, current_phase, progress')
      .eq('sd_key', sdKey)
      .single();

    if (sdError || !sd) {
      return {
        verified: false,
        reason: 'sd_not_found',
        sdKey
      };
    }

    const result = {
      verified: true,
      sd: {
        key: sd.sd_key,
        title: sd.title,
        type: sd.sd_type,
        status: sd.status,
        phase: sd.current_phase,
        progress: sd.progress
      },
      prd: null,
      handoffs: { count: 0, types: [] }
    };

    // Check PRD if phase > LEAD
    const phaseOrder = ['LEAD', 'PLAN', 'EXEC', 'VERIFY', 'FINAL'];
    const currentPhaseIndex = phaseOrder.indexOf(sd.current_phase?.toUpperCase() || 'LEAD');

    if (currentPhaseIndex > 0) {
      // Phase is beyond LEAD, check PRD
      const prdReqs = PRD_REQUIREMENTS[sd.sd_type] || PRD_REQUIREMENTS.feature;

      const { data: prd, error: prdError } = await supabase
        .from('product_requirements_v2')
        .select('id, title, status, metadata')
        .eq('sd_id', sd.id)
        .single();

      if (prd) {
        const sectionCount = prd.metadata?.sections?.length || 0;
        result.prd = {
          exists: true,
          status: prd.status,
          meetsRequirements: !prdReqs.required || sectionCount >= prdReqs.minSections,
          sectionCount
        };
      } else {
        result.prd = {
          exists: false,
          required: prdReqs.required,
          meetsRequirements: !prdReqs.required
        };
      }
    }

    // Count handoffs
    const { data: handoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sd.id);

    if (handoffs && handoffs.length > 0) {
      result.handoffs = {
        count: handoffs.length,
        types: [...new Set(handoffs.map(h => h.handoff_type))],
        accepted: handoffs.filter(h => h.status === 'accepted').length
      };
    }

    // Output verification summary
    console.log('[session-init] SD Verification Summary:');
    console.log(`   SD: ${sd.sd_key} (${sd.sd_type})`);
    console.log(`   Status: ${sd.status} | Phase: ${sd.current_phase} | Progress: ${sd.progress}%`);
    if (result.prd) {
      console.log(`   PRD: ${result.prd.exists ? result.prd.status : 'missing'} (${result.prd.meetsRequirements ? 'OK' : 'INCOMPLETE'})`);
    }
    console.log(`   Handoffs: ${result.handoffs.count} (${result.handoffs.accepted || 0} accepted)`);

    return result;
  } catch (error) {
    return {
      verified: false,
      reason: 'query_error',
      error: error.message
    };
  }
}

/**
 * Detect current SD from git branch or working_on flag
 */
function detectCurrentSD() {
  try {
    // Try to get SD from git branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd: ENGINEER_DIR,
      stdio: ['pipe', 'pipe', 'pipe'] // Suppress stderr cross-platform
    }).trim();

    // Extract SD ID from branch name (e.g., feat/SD-XXX-001-description)
    const sdMatch = branch.match(/SD-[A-Z0-9-]+/i);
    if (sdMatch) {
      const sdKey = sdMatch[0].toUpperCase();
      // SD-LEO-INFRA-CLAIM-GUARD-001 (US-006): Verify claim ownership
      // before allowing branch-based SD detection to store context.
      // Without this check, any session on the right branch could silently
      // resume work on a claimed SD.
      try {
        const { claimGuard } = require('../../lib/claim-guard.cjs');
        const os = require('os');
        const sessionDir = require('path').join(os.homedir(), '.claude-sessions');
        let sessionId = null;
        if (require('fs').existsSync(sessionDir)) {
          const pid = process.ppid || process.pid;
          const files = require('fs').readdirSync(sessionDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            try {
              const data = JSON.parse(require('fs').readFileSync(require('path').join(sessionDir, file), 'utf8'));
              if (data.pid === pid) { sessionId = data.session_id; break; }
            } catch { /* skip */ }
          }
        }
        if (sessionId) {
          // Async claim check — we can't await in sync function, so fire-and-forget log
          // The actual enforcement happens at handoff time via BaseExecutor
          claimGuard(sdKey, sessionId).then(result => {
            if (!result.success) {
              console.log(`[session-init] ⚠️ SD ${sdKey} detected from branch but claimed by another session`);
            }
          }).catch(() => { /* best effort */ });
        }
      } catch { /* claimGuard not available — skip check */ }
      return sdKey;
    }
  } catch (error) {
    // Git command failed, try fallback
  }

  // Fallback: Check for is_working_on in database (would require db connection)
  return null;
}

/**
 * Detect current phase from recent handoffs
 */
function detectCurrentPhase() {
  // This would ideally query the database for the latest handoff
  // For now, return null and let the phase be detected via handoff hooks
  return null;
}

/**
 * Get git status for session context
 */
function getGitContext() {
  const execOpts = { encoding: 'utf8', cwd: ENGINEER_DIR, stdio: ['pipe', 'pipe', 'pipe'] };

  try {
    // Get status and count lines in JS (cross-platform)
    const statusOutput = execSync('git status --porcelain', execOpts).trim();
    const uncommittedFiles = statusOutput ? statusOutput.split('\n').length : 0;

    const branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();

    const lastCommit = execSync('git log -1 --format="%H %s"', execOpts).trim();

    return {
      branch,
      uncommitted_files: uncommittedFiles,
      last_commit: lastCommit
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Initialize fresh session state
 */
async function initializeSessionState() {
  const currentSD = detectCurrentSD();
  const currentPhase = detectCurrentPhase();
  const gitContext = getGitContext();

  const state = {
    // Session metadata
    session_id: `session_${Date.now()}_${process.pid}`,
    initialized_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),

    // SD context (SD-LEO-INFRA-CLAIM-GUARD-001: claim_verified=false until claimGuard runs)
    current_sd: currentSD,
    current_phase: currentPhase,
    detected_from: currentSD ? 'git_branch' : null,
    claim_verified: false, // Must be verified via claimGuard before work begins

    // Git context
    git: gitContext,

    // Execution tracking
    tool_executions: 0,
    model_history: [],
    checkpoints: [],

    // Baseline tracking (populated by baseline hooks)
    test_baseline: null,
    baseline_captured_at: null,

    // Error tracking
    errors: [],
    warnings: [],

    // Database verification (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-K)
    db_verification: null
  };

  // Verify SD state in database if SD detected
  if (currentSD) {
    state.db_verification = await verifySDStateInDatabase(currentSD);
    if (state.db_verification.verified && state.db_verification.sd) {
      // Update phase from database if available
      if (!state.current_phase && state.db_verification.sd.phase) {
        state.current_phase = state.db_verification.sd.phase;
      }
    }
  }

  return state;
}

/**
 * Check if Plan Mode integration is enabled
 * SD-PLAN-MODE-001
 */
function isPlanModeEnabled() {
  try {
    if (fs.existsSync(LEO_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(LEO_CONFIG_FILE, 'utf8'));
      return config.leo_plan_mode?.enabled === true &&
             config.leo_plan_mode?.auto_enter_on_sd_detection === true;
    }
  } catch (error) {
    // Config read error, disable Plan Mode
  }
  return false;
}

/**
 * Request Plan Mode entry for a detected SD
 * SD-PLAN-MODE-001
 */
function requestPlanModeEntry(sdId, phase) {
  try {
    const state = {
      requested: true,
      sdId,
      phase: (phase || 'LEAD').toUpperCase(),
      reason: 'session_start_sd_detected',
      requestedAt: new Date().toISOString(),
      // Basic permissions for LEAD phase (full permissions loaded by orchestrator)
      permissions: [
        { tool: 'Bash', prompt: 'run SD queue commands' },
        { tool: 'Bash', prompt: 'run handoff scripts' },
        { tool: 'Bash', prompt: 'check git status' }
      ]
    };

    fs.writeFileSync(PLAN_MODE_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.log(`[session-init] Plan Mode state error: ${error.message}`);
    return false;
  }
}

/**
 * Main hook execution
 */
async function main() {
  console.log('[session-init] Initializing Claude Code session...');

  // Check if session already exists (shouldn't with once: true, but be safe)
  if (fs.existsSync(SESSION_STATE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      // Check if session is recent (within last 30 minutes)
      const sessionAge = Date.now() - new Date(existing.initialized_at).getTime();
      if (sessionAge < 30 * 60 * 1000) {
        console.log('[session-init] Recent session found, preserving state');
        console.log(`[session-init] SD: ${existing.current_sd || 'none'} | Phase: ${existing.current_phase || 'unknown'}`);
        return;
      }
    } catch (error) {
      // Corrupted state file, reinitialize
    }
  }

  const state = await initializeSessionState();

  // Save session state
  fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));

  console.log('[session-init] Session initialized');
  console.log(`[session-init] Session ID: ${state.session_id}`);
  console.log(`[session-init] SD: ${state.current_sd || 'none'} | Phase: ${state.current_phase || 'unknown'}`);
  console.log(`[session-init] Git branch: ${state.git.branch || 'unknown'}`);

  // SD-PLAN-MODE-001: Trigger Plan Mode if SD detected and enabled
  if (state.current_sd && isPlanModeEnabled()) {
    const phase = state.current_phase || 'LEAD';
    if (requestPlanModeEntry(state.current_sd, phase)) {
      console.log(`[session-init] Plan Mode requested for ${state.current_sd} (${phase} phase)`);
    }
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  initializeSessionState,
  detectCurrentSD,
  detectCurrentPhase,
  isPlanModeEnabled,
  requestPlanModeEntry,
  verifySDStateInDatabase,
  PRD_REQUIREMENTS
};
