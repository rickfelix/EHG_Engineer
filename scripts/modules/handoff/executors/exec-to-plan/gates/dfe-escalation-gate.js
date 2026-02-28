/**
 * DFE Escalation Advisory Gate for EXEC-TO-PLAN
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-001 (original)
 * Updated by SD-MAN-GEN-CORRECTIVE-VISION-GAP-003 (shared gate)
 *
 * Re-exports from shared gate location for backward compatibility.
 * The shared gate at scripts/modules/handoff/gates/dfe-escalation-gate.js
 * is the canonical implementation.
 */

import { createDFEEscalationGate as createSharedDFEEscalationGate } from '../../../gates/dfe-escalation-gate.js';

/**
 * Create the DFE_ESCALATION_GATE validator for exec-to-plan
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createDFEEscalationGate(supabase) {
  return createSharedDFEEscalationGate(supabase, 'exec-to-plan-gate');
}
