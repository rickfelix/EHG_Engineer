/**
 * Status helper functions for SD-next
 * Handles phase-aware status display and actionability checks
 */

import { colors } from './colors.js';

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
 */
export function isActionableForLead(item) {
  const phase = item.current_phase || '';
  const status = item.status || '';

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
