/**
 * Shared DFE Escalation Advisory Gate
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 *
 * Wires evaluateAndEscalate() into any handoff gate pipeline.
 * Advisory (required: false) — never blocks handoffs, but routes
 * ESCALATE decisions to chairman_decisions table for governance.
 *
 * Replaces per-executor copies with a single shared gate creator.
 */

import { evaluate } from '../../../../lib/governance/decision-filter-engine.js';
import {
  evaluateAndEscalate,
  requiresEscalation,
} from '../../../../lib/governance/chairman-escalation.js';

/**
 * Create the DFE_ESCALATION_GATE validator
 *
 * @param {Object} supabase - Supabase client
 * @param {string} [source] - Source identifier for traceability (e.g., 'lead-to-plan-gate')
 * @returns {Object} Gate configuration
 */
export function createDFEEscalationGate(supabase, source = 'handoff-gate') {
  return {
    name: 'DFE_ESCALATION_GATE',
    validator: async (ctx) => {
      console.log('\n🔍 DFE Escalation Gate (Advisory)');
      console.log('-'.repeat(50));

      try {
        const gateScore = ctx.gateResults?.normalizedScore ?? ctx.qualityScore ?? 85;
        const confidence = gateScore / 100;

        const { dfeResult, escalation } = await evaluateAndEscalate(
          {
            confidence,
            gateType: 'PHASE_GATE',
            sdId: ctx.sdUuid || ctx.sdId,
            sdKey: ctx.sdKey || ctx.sdId,
            context: { source },
          },
          evaluate,
          supabase
        );

        if (requiresEscalation(dfeResult)) {
          const escId = escalation?.id || 'pending';
          console.log(`   ⚠️  DFE decision: ESCALATE (confidence ${confidence.toFixed(2)})`);
          console.log(`   📋 Chairman escalation created: ${escId}`);

          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [
              `DFE escalated to chairman (confidence ${confidence.toFixed(2)}, id: ${escId})`,
            ],
            gate_status: 'ADVISORY_ESCALATION',
            dfe_decision: dfeResult.decision,
            escalation_id: escId,
          };
        }

        console.log(`   ✅ DFE decision: ${dfeResult.decision} (confidence ${confidence.toFixed(2)})`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          gate_status: 'PASS',
          dfe_decision: dfeResult.decision,
        };
      } catch (error) {
        console.log(`   ℹ️  DFE escalation check skipped: ${error.message}`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`DFE escalation gate skipped: ${error.message}`],
          gate_status: 'SKIPPED',
        };
      }
    },
    required: false,
  };
}
