#!/usr/bin/env node

/**
 * Load Phase Context Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 1 Foundation
 *
 * PostToolUse hook that triggers when handoff.js execute is called.
 * Uses handoff_type (LEAD-TO-PLAN, PLAN-TO-EXEC, etc.) to deterministically
 * load the correct phase context document.
 *
 * This replaces unreliable trigger keyword detection with handoff-based
 * deterministic phase detection.
 *
 * Hook Type: PostToolUse (on Bash tool with handoff.js)
 * Purpose: Deterministic phase context loading
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-001
 */

const fs = require('fs');
const path = require('path');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
const ENGINEER_DIR = '.';

// Phase context document mapping
const PHASE_CONTEXT_DOCS = {
  'LEAD': 'CLAUDE_LEAD.md',
  'PLAN': 'CLAUDE_PLAN.md',
  'PLAN_PRD': 'CLAUDE_PLAN.md',
  'PLAN_VERIFY': 'CLAUDE_PLAN.md',
  'EXEC': 'CLAUDE_EXEC.md'
};

// Handoff type to target phase mapping
const HANDOFF_TO_PHASE = {
  'LEAD-TO-PLAN': 'PLAN',
  'PLAN-TO-EXEC': 'EXEC',
  'EXEC-TO-PLAN': 'PLAN_VERIFY',
  'PLAN-TO-LEAD': 'LEAD'
};

/**
 * Load current session state
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[load-phase-context] Error loading session state:', error.message);
  }
  return {};
}

/**
 * Save session state
 */
function saveSessionState(state) {
  try {
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[load-phase-context] Error saving session state:', error.message);
  }
}

/**
 * Parse handoff type from command output or environment
 */
function detectHandoffType() {
  // Check environment variable (set by handoff.js wrapper)
  if (process.env.HANDOFF_TYPE) {
    return process.env.HANDOFF_TYPE;
  }

  // Check CLI arguments for handoff.js execute command pattern
  const args = process.argv.slice(2).join(' ');
  const handoffMatch = args.match(/(LEAD-TO-PLAN|PLAN-TO-EXEC|EXEC-TO-PLAN|PLAN-TO-LEAD)/i);
  if (handoffMatch) {
    return handoffMatch[1].toUpperCase();
  }

  // Check stdin/pipe for handoff output (when piped from handoff.js)
  // This would be set by the calling context
  if (process.env.LAST_HANDOFF_TYPE) {
    return process.env.LAST_HANDOFF_TYPE;
  }

  return null;
}

/**
 * Get the target phase from handoff type
 */
function getTargetPhase(handoffType) {
  return HANDOFF_TO_PHASE[handoffType] || null;
}

/**
 * Get the context document path for a phase
 */
function getContextDocPath(phase) {
  const doc = PHASE_CONTEXT_DOCS[phase];
  if (!doc) return null;
  return path.join(ENGINEER_DIR, doc);
}

/**
 * Log phase transition for audit
 */
function logPhaseTransition(fromPhase, toPhase, handoffType, sdId) {
  const transition = {
    from_phase: fromPhase,
    to_phase: toPhase,
    handoff_type: handoffType,
    sd_id: sdId,
    timestamp: new Date().toISOString(),
    method: 'handoff_deterministic'  // vs 'keyword_heuristic'
  };

  console.log('[load-phase-context] Phase transition:', JSON.stringify(transition));
  return transition;
}

/**
 * Main hook execution
 */
function main() {
  const handoffType = detectHandoffType();

  if (!handoffType) {
    // No handoff detected, this hook should only run after handoff.js
    // This might be a normal tool execution, not a phase transition
    return;
  }

  console.log(`[load-phase-context] Handoff detected: ${handoffType}`);

  const state = loadSessionState();
  const fromPhase = state.current_phase;
  const toPhase = getTargetPhase(handoffType);

  if (!toPhase) {
    console.error(`[load-phase-context] Unknown handoff type: ${handoffType}`);
    return;
  }

  // Log the transition
  const transition = logPhaseTransition(fromPhase, toPhase, handoffType, state.current_sd);

  // Update session state
  state.current_phase = toPhase;
  state.phase_transitions = state.phase_transitions || [];
  state.phase_transitions.push(transition);
  state.last_activity = new Date().toISOString();

  saveSessionState(state);

  // Get context document path
  const contextDocPath = getContextDocPath(toPhase);

  if (contextDocPath && fs.existsSync(contextDocPath)) {
    console.log(`[load-phase-context] Context document: ${PHASE_CONTEXT_DOCS[toPhase]}`);
    console.log(`[load-phase-context] INSTRUCTION: Read ${contextDocPath} for phase-specific guidance`);
  } else {
    console.warn(`[load-phase-context] Context document not found for phase: ${toPhase}`);
  }

  console.log(`[load-phase-context] Phase transition complete: ${fromPhase || 'unknown'} -> ${toPhase}`);
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  detectHandoffType,
  getTargetPhase,
  HANDOFF_TO_PHASE,
  PHASE_CONTEXT_DOCS
};
