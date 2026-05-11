/**
 * Phase-Aware Status Helpers for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 *
 * Control Gap Fix: SD status must reflect actual phase, not just dependency resolution
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Added STUCK detection
 */

import { colors } from './colors.js';
import { computeGateState } from '../../../lib/cadence/pre-claim-gate.mjs';

// SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001: ghost-completed detection state.
// Module-load-time guard so we warn at most once per process when the
// v_sd_completion_integrity view is absent.
let _ghostWarnEmitted = false;
let _inconsistentIdsCache = null;

/**
 * Query v_sd_completion_integrity and return a Set of sd_ids where
 * is_ghost_completed=true. Memoized for the lifetime of the process — sd:next
 * runs as a one-shot CLI so a single query per invocation is the right shape.
 *
 * Falls through gracefully when the view is missing (PostgrestError 42P01),
 * returning an empty Set and emitting console.warn exactly once.
 *
 * SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 *
 * @param {Object} supabase - supabase client
 * @returns {Promise<Set<string>>} Set of ghost-completed SD ids (varchar(50))
 */
export async function getInconsistentSDIds(supabase) {
  if (_inconsistentIdsCache) return _inconsistentIdsCache;
  if (!supabase) {
    _inconsistentIdsCache = new Set();
    return _inconsistentIdsCache;
  }
  try {
    const { data, error } = await supabase
      .from('v_sd_completion_integrity')
      .select('id')
      .eq('is_ghost_completed', true);
    if (error) {
      // 42P01 = relation does not exist; PostgREST also reports schema-cache
      // misses with a "Could not find the table ... in the schema cache" msg.
      const msg = error.message || '';
      if (
        error.code === '42P01' ||
        /relation .* does not exist/i.test(msg) ||
        /Could not find the table .* in the schema cache/i.test(msg)
      ) {
        if (!_ghostWarnEmitted) {
          console.warn('[status-helpers] v_sd_completion_integrity view not present — STATUS_INCONSISTENT badges disabled (apply migration 20260510_v_sd_completion_integrity.sql)');
          _ghostWarnEmitted = true;
        }
        _inconsistentIdsCache = new Set();
        return _inconsistentIdsCache;
      }
      // Other errors: don't crash sd:next render, but log once
      if (!_ghostWarnEmitted) {
        console.warn(`[status-helpers] v_sd_completion_integrity query failed: ${error.message}`);
        _ghostWarnEmitted = true;
      }
      _inconsistentIdsCache = new Set();
      return _inconsistentIdsCache;
    }
    _inconsistentIdsCache = new Set((data || []).map(r => r.id));
    return _inconsistentIdsCache;
  } catch (e) {
    if (!_ghostWarnEmitted) {
      console.warn(`[status-helpers] v_sd_completion_integrity threw: ${e.message}`);
      _ghostWarnEmitted = true;
    }
    _inconsistentIdsCache = new Set();
    return _inconsistentIdsCache;
  }
}

/**
 * Build STATUS_INCONSISTENT badge string for an SD if its id is in the
 * inconsistent set. Returns empty string when the SD is not ghost-completed
 * OR when the inconsistent set is unavailable.
 *
 * Advisory only — does not affect routing or claim eligibility.
 *
 * SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 *
 * @param {Object} item - SD item
 * @param {Set<string>} inconsistentSet - Set returned by getInconsistentSDIds
 * @returns {string} Colored badge string (with leading space) or empty string
 */
export function getStatusInconsistentBadge(item, inconsistentSet) {
  if (!inconsistentSet || inconsistentSet.size === 0) return '';
  if (!item || !item.id) return '';
  if (!inconsistentSet.has(item.id)) return '';
  return ` ${colors.red}[STATUS_INCONSISTENT]${colors.reset}`;
}

/**
 * Reset internal caches. Intended for test isolation — production callers
 * should not need this (CLI is one-shot). SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 */
export function _resetInconsistentCache() {
  _inconsistentIdsCache = null;
  _ghostWarnEmitted = false;
}

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

  // Governance: deferred SDs with trigger conditions
  if (item.is_deferred || item.metadata?.do_not_advance_without_trigger === true) {
    return `${colors.dim}DEFERRED${colors.reset}`;
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
 * Build CADENCE-WAIT badge for an SD if its pre-claim cadence gate is active.
 * Returns empty string when no gate is active (no badge rendered).
 * SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001
 *
 * SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001: source='unlock_gate_advisory'
 * returns empty string (no blocking badge rendered). Advisory states are
 * surfaced via separate informational helpers, not as a CADENCE-WAIT badge,
 * since they do not block claim acquisition.
 *
 * @param {Object} item - SD item with governance_metadata + metadata
 * @returns {string} Colored badge string (with leading space) or empty string
 */
export function getCadenceBadge(item) {
  const gateState = computeGateState({
    governance_metadata: item?.governance_metadata,
    metadata: item?.metadata,
  });
  if (gateState.source === 'unlock_gate_advisory') return '';
  if (!gateState.active) return '';
  const dayWord = gateState.days_remaining === 1 ? 'day' : 'days';
  return ` ${colors.magenta}[CADENCE-WAIT ${gateState.days_remaining} ${dayWord}]${colors.reset}`;
}

/**
 * Get cadence-wait reason text for inline display under an SD entry.
 * Returns empty string when no gate active.
 *
 * SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001: returns empty for
 * source='unlock_gate_advisory' — the advisory reason is informational and
 * surfaced via different rendering paths, not via this hard-block helper.
 *
 * @param {Object} item
 * @returns {string}
 */
export function getCadenceReason(item) {
  const gateState = computeGateState({
    governance_metadata: item?.governance_metadata,
    metadata: item?.metadata,
  });
  if (gateState.source === 'unlock_gate_advisory') return '';
  if (!gateState.active) return '';
  return gateState.reason;
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
