/**
 * Phase-Aware Status Helpers for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 *
 * Control Gap Fix: SD status must reflect actual phase, not just dependency resolution
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Added STUCK detection
 */

import { colors } from './colors.js';

// Phase-to-required-handoff mapping for stuck detection
const PHASE_REQUIRES_HANDOFF = {
  PLAN_PRD: { from: 'LEAD', to: 'PLAN' },
  PLAN: { from: 'LEAD', to: 'PLAN' },
  PLAN_VERIFICATION: { from: 'LEAD', to: 'PLAN' },
  EXEC: { from: 'PLAN', to: 'EXEC' },
  EXEC_ACTIVE: { from: 'PLAN', to: 'EXEC' },
  EXEC_COMPLETE: { from: 'PLAN', to: 'EXEC' },
};

/**
 * Check if an SD is stuck (phase advanced beyond accepted handoffs)
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001
 *
 * @param {Object} item - SD item
 * @param {Array} acceptedHandoffs - Accepted handoff records for this SD (pre-fetched)
 * @returns {boolean} True if SD is stuck
 */
export function isStuckSD(item, acceptedHandoffs) {
  const phase = item.current_phase || '';
  const req = PHASE_REQUIRES_HANDOFF[phase];
  if (!req) return false; // LEAD phase or completed — can't be stuck

  if (!acceptedHandoffs || acceptedHandoffs.length === 0) return true;

  return !acceptedHandoffs.some(h => h.from_phase === req.from && h.to_phase === req.to);
}

/**
 * Get phase-aware status icon for an SD
 * Control Gap Fix: SD status must reflect actual phase, not just dependency resolution
 *
 * @param {Object} item - SD item with current_phase, status, deps_resolved, progress_percentage
 * @returns {string} Colored status string for display
 */
export function getPhaseAwareStatus(item) {
  const phase = item.current_phase || '';
  const status = item.status || '';
  const depsResolved = item.deps_resolved;
  const progress = item.progress_percentage || 0;

  // SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: STUCK detection
  // If handoff chain data is attached, check for stuck state
  if (item._stuck) {
    return `${colors.red}STUCK${colors.reset}`;
  }

  // Phase-based status takes priority over dependency resolution
  // This prevents showing "READY" for SDs that need verification/review

  // EXEC_COMPLETE with review status = needs verification
  if (phase === 'EXEC_COMPLETE' && status === 'review') {
    return `${colors.magenta}VERIFY${colors.reset}`;
  }

  // Any COMPLETE phase that isn't fully completed = needs close-out
  if (phase.includes('COMPLETE') && status !== 'completed') {
    return `${colors.magenta}CLOSE-OUT${colors.reset}`;
  }

  // PLAN phases = in planning, not ready for LEAD work
  if (phase === 'PLAN_PRD' || phase === 'PLAN') {
    return `${colors.cyan}PLANNING${colors.reset}`;
  }

  // Draft status = needs LEAD review first
  if (status === 'draft') {
    return `${colors.yellow}DRAFT${colors.reset}`;
  }

  // In active EXEC phase
  if (phase === 'EXEC' || phase === 'EXEC_ACTIVE') {
    if (progress > 0 && progress < 100) {
      return `${colors.blue}EXEC ${progress}%${colors.reset}`;
    }
    return `${colors.blue}IN_EXEC${colors.reset}`;
  }

  // Standard dependency-based logic for LEAD phase or new SDs
  if (depsResolved) {
    return `${colors.green}READY${colors.reset}`;
  } else if (progress > 0) {
    return `${colors.yellow}${progress}%${colors.reset}`;
  } else {
    return `${colors.red}BLOCKED${colors.reset}`;
  }
}

/**
 * Check if an SD is actionable for LEAD work (starting new work)
 * Returns false for SDs in verification, planning, or other non-LEAD phases
 *
 * @param {Object} item - SD item with current_phase and status
 * @returns {boolean} True if SD is actionable for LEAD work
 */
export function isActionableForLead(item) {
  const phase = item.current_phase || '';
  const status = item.status || '';

  // SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Not actionable if stuck
  if (item._stuck) {
    return false;
  }

  // Not actionable if needs verification
  if (phase === 'EXEC_COMPLETE' || phase.includes('COMPLETE')) {
    return false;
  }

  // Not actionable if in active planning or execution
  if (phase === 'PLAN_PRD' || phase === 'PLAN' || phase === 'EXEC' || phase === 'EXEC_ACTIVE') {
    return false;
  }

  // Not actionable if in review status
  if (status === 'review') {
    return false;
  }

  return true;
}
