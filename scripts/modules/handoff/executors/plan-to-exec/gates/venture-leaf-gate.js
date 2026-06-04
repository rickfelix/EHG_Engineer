/**
 * PLAN->EXEC Venture-Leaf Evidence Gate
 * SD-LEO-INFRA-WIRE-PRE-BUILD-001 — FR-2 (Phase A)
 *
 * Wires the pre-build rail's leaf readiness decision into the live PLAN->EXEC
 * handoff: for a venture-build leaf (descendant of a leo_bridge orchestrator), it
 * checks for FRESH, compliant VENTURE_STACK evidence and — when enforcement is
 * enabled — blocks a hollow/non-compliant stub with SUBAGENT_EVIDENCE_MISSING.
 * For every non-venture SD it is a no-op pass.
 *
 * The decision logic lives in lib/eva/bridge/leaf-gate-live.js (unit-tested with an
 * injected supabase double); this factory only resolves the phase-start freshness
 * anchor and adapts to the handoff gate contract { name, validator, required }.
 *
 * Default-OFF (VENTURE_LEAF_GATE_ENFORCE): observe/warn so venture builds do not
 * stall before the evidence-producing driver (FR-3, deferred) is wired.
 */

import { evaluateLeafReadinessLive } from '../../../../../../lib/eva/bridge/leaf-gate-live.js';
import { _internals } from '../../../gates/subagent-evidence-gate.js';

/**
 * @param {Object} supabase - Supabase client (passed by the executor)
 * @returns {Object} gate definition
 */
export function createVentureLeafGate(supabase) {
  return {
    name: 'GATE_VENTURE_LEAF_EVIDENCE',
    validator: async (ctx) => {
      const db = supabase || ctx.supabase;
      const sd = ctx.sd;

      // Resolve the current-phase (PLAN) start anchor, reusing the shared gate's
      // logic (most recent accepted handoff INTO PLAN, else SD.created_at).
      const phaseStartedAt = await _internals.resolveCurrentPhaseStartedAt(
        { ...ctx, handoffType: ctx.handoffType || 'PLAN-TO-EXEC' },
        db
      );

      return evaluateLeafReadinessLive({ sd, supabase: db, phaseStartedAt });
    },
    required: true,
  };
}

export default { createVentureLeafGate };
