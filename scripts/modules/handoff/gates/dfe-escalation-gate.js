/**
 * Shared DFE Escalation Blocking Gate
 * Part of SD-MAN-ORCH-VISION-GOVERNANCE-ENFORCEMENT-001-B
 *
 * Wires evaluateAndEscalate() into any handoff gate pipeline.
 * Blocking (required: true) — blocks handoffs when DFE returns
 * ESCALATE until chairman acknowledges via chairman_decisions table.
 * Supports --force override with audit logging.
 *
 * Replaces per-executor copies with a single shared gate creator.
 */

import { evaluate } from '../../../../lib/governance/decision-filter-engine.js';
import {
  evaluateAndEscalate,
  requiresEscalation,
  ESCALATION_STATUS,
} from '../../../../lib/governance/chairman-escalation.js';

/**
 * Check if the chairman has acknowledged a pending escalation for this SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD UUID or key
 * @returns {Promise<{acknowledged: boolean, decision: Object|null}>}
 */
async function checkChairmanAcknowledgment(supabase, sdId) {
  if (!supabase || !sdId) return { acknowledged: false, decision: null };

  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, status, updated_at')
    .or(`context->>sd_id.eq.${sdId},context->>sd_key.eq.${sdId}`)
    .eq('decision_type', 'dfe_escalation')
    .in('status', [ESCALATION_STATUS.APPROVED, ESCALATION_STATUS.REVIEWED])
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { acknowledged: false, decision: null };
  }

  return { acknowledged: true, decision: data[0] };
}

/**
 * Log a force override to the governance audit log.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} context - Override context
 */
async function logForceOverride(supabase, context) {
  if (!supabase) return;

  try {
    await supabase.from('governance_audit_log').insert({
      event_type: 'escalation_force_override',
      severity: 'high',
      gate_name: 'DFE_ESCALATION_GATE',
      sd_key: context.sdKey || null,
      details: {
        escalation_id: context.escalationId,
        confidence: context.confidence,
        source: context.source,
        overridden_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.log(`   ⚠️  Audit log write failed: ${err.message}`);
  }
}

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
      console.log('\n🔍 DFE Escalation Gate (Blocking)');
      console.log('-'.repeat(50));

      try {
        const gateScore = ctx.gateResults?.normalizedScore ?? ctx.qualityScore ?? 85;
        const confidence = gateScore / 100;
        const sdKey = ctx.sdKey || ctx.sdId;
        const sdId = ctx.sdUuid || ctx.sdId;
        const forceOverride = ctx.force === true || ctx.options?.force === true;

        const { dfeResult, escalation } = await evaluateAndEscalate(
          {
            confidence,
            gateType: 'PHASE_GATE',
            sdId,
            sdKey,
            context: { source },
          },
          evaluate,
          supabase
        );

        if (requiresEscalation(dfeResult)) {
          const escId = escalation?.id || 'pending';
          console.log(`   ⚠️  DFE decision: ESCALATE (confidence ${confidence.toFixed(2)})`);
          console.log(`   📋 Chairman escalation created: ${escId}`);

          // Check if chairman has already acknowledged this escalation
          const { acknowledged, decision: ackDecision } = await checkChairmanAcknowledgment(supabase, sdId);

          if (acknowledged) {
            console.log(`   ✅ Chairman acknowledged escalation (${ackDecision.status} at ${ackDecision.updated_at})`);
            return {
              passed: true,
              score: 90,
              max_score: 100,
              issues: [],
              warnings: [
                `DFE escalated but chairman acknowledged (${ackDecision.status}, id: ${escId})`,
              ],
              gate_status: 'ESCALATION_ACKNOWLEDGED',
              dfe_decision: dfeResult.decision,
              escalation_id: escId,
            };
          }

          // Check for --force override
          if (forceOverride) {
            console.log(`   ⚡ Force override applied — bypassing escalation block`);
            await logForceOverride(supabase, { sdKey, escalationId: escId, confidence, source });
            return {
              passed: true,
              score: 70,
              max_score: 100,
              issues: [],
              warnings: [
                `DFE escalation FORCE-OVERRIDDEN (confidence ${confidence.toFixed(2)}, id: ${escId})`,
              ],
              gate_status: 'FORCE_OVERRIDE',
              dfe_decision: dfeResult.decision,
              escalation_id: escId,
            };
          }

          // Block: escalation pending, no ack, no force
          console.log(`   🚫 BLOCKED: Escalation pending chairman acknowledgment`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `DFE escalation blocks handoff (confidence ${confidence.toFixed(2)}, id: ${escId}). Chairman acknowledgment required.`,
            ],
            warnings: [],
            gate_status: 'BLOCKED_ESCALATION',
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
        console.log(`   ⚠️  DFE escalation gate error: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`DFE escalation gate failed: ${error.message}`],
          warnings: [],
          gate_status: 'ERROR',
        };
      }
    },
    required: true,
  };
}
