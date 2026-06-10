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
 * Validate that the requesting context has chairman-level authorization.
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V02: chairman_governance_model)
 *
 * @param {Object} ctx - Gate validation context
 * @returns {{ authorized: boolean, role: string|null }}
 */
function validateChairmanRole(ctx) {
  const role = ctx.role || ctx.options?.role || ctx.userRole || null;
  const isChairman = role === 'chairman' || role === 'admin' || role === 'owner';
  return { authorized: isChairman, role };
}

/**
 * Log a force override to the audit log.
 *
 * SD-LEO-FIX-FIX-PHANTOM-COLUMN-001: this event-style payload previously targeted
 * governance_audit_log, whose real shape is a TABLE-CHANGE audit (table_name/record_id/
 * operation/old_values/new_values) — every written key was phantom, PostgREST 42703'd, and
 * the catch swallowed it: escalation overrides were never audited. Events belong on
 * audit_log (event_type/entity_type/entity_id/severity/metadata); original keys preserved
 * inside metadata. Failures route through the fail-loud guard.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} context - Override context
 */
async function logForceOverride(supabase, context) {
  if (!supabase) return;

  const payload = {
    event_type: 'escalation_force_override',
    entity_type: 'strategic_directive',
    entity_id: context.sdKey || null,
    severity: 'high',
    metadata: {
      gate_name: 'DFE_ESCALATION_GATE',
      sd_key: context.sdKey || null,
      escalation_id: context.escalationId,
      confidence: context.confidence,
      source: context.source,
      role_verified: context.roleVerified ?? null,
      role: context.role ?? null,
      overridden_at: new Date().toISOString(),
    },
  };
  try {
    const { error } = await supabase.from('audit_log').insert(payload);
    if (error) {
      const { logAuditWriteFailure } = await import('../../../../lib/audit-write-guard.js');
      logAuditWriteFailure('dfe-escalation-gate.logForceOverride', error, payload);
    }
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

        // Build DFE context — include cost data if available for V07 enforcement
        const dfeContext = { source };
        if (ctx.cost != null) {
          dfeContext.cost = ctx.cost;
          dfeContext.stageType = ctx.stageType || ctx.phase || 'DEFAULT';
        }

        const { dfeResult, escalation } = await evaluateAndEscalate(
          {
            confidence,
            gateType: 'PHASE_GATE',
            sdId,
            sdKey,
            context: dfeContext,
          },
          evaluate,
          supabase
        );

        // V07: Cost-blocked decisions get separate handling
        if (dfeResult.decision === 'BLOCK' && dfeResult.costEvaluation?.blocked) {
          console.log(`   🚫 COST BLOCK: Compute budget exceeded (${dfeResult.costEvaluation.cost} >= ${dfeResult.costEvaluation.threshold.escalate})`);

          if (forceOverride) {
            const { authorized, role } = validateChairmanRole(ctx);
            if (!authorized) {
              console.log(`   🚫 UNAUTHORIZED: Force override requires chairman role (got: ${role || 'none'})`);
              await logForceOverride(supabase, { sdKey, escalationId: 'cost-block', confidence, source, roleVerified: false, role });
              return {
                passed: false,
                score: 0,
                max_score: 100,
                issues: [`UNAUTHORIZED_OVERRIDE: Force override on cost block requires chairman role (got: ${role || 'none'})`],
                warnings: [],
                gate_status: 'UNAUTHORIZED_OVERRIDE',
                dfe_decision: dfeResult.decision,
              };
            }
            console.log(`   ⚡ Force override applied — bypassing cost block (role: ${role})`);
            await logForceOverride(supabase, { sdKey, escalationId: 'cost-block', confidence, source, roleVerified: true, role });
            return {
              passed: true,
              score: 60,
              max_score: 100,
              issues: [],
              warnings: [`Cost block FORCE-OVERRIDDEN by ${role} (cost: ${dfeResult.costEvaluation.cost})`],
              gate_status: 'COST_FORCE_OVERRIDE',
              dfe_decision: dfeResult.decision,
            };
          }

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`Compute budget exceeded: ${dfeResult.reasoning}`],
            warnings: [],
            gate_status: 'COST_BLOCKED',
            dfe_decision: dfeResult.decision,
            cost_evaluation: dfeResult.costEvaluation,
          };
        }

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

          // Check for --force override (requires chairman role — V02)
          if (forceOverride) {
            const { authorized, role } = validateChairmanRole(ctx);
            if (!authorized) {
              console.log(`   🚫 UNAUTHORIZED: Force override requires chairman role (got: ${role || 'none'})`);
              await logForceOverride(supabase, { sdKey, escalationId: escId, confidence, source, roleVerified: false, role });
              return {
                passed: false,
                score: 0,
                max_score: 100,
                issues: [`UNAUTHORIZED_OVERRIDE: Force override on escalation requires chairman role (got: ${role || 'none'})`],
                warnings: [],
                gate_status: 'UNAUTHORIZED_OVERRIDE',
                dfe_decision: dfeResult.decision,
                escalation_id: escId,
              };
            }
            console.log(`   ⚡ Force override applied — bypassing escalation block (role: ${role})`);
            await logForceOverride(supabase, { sdKey, escalationId: escId, confidence, source, roleVerified: true, role });
            return {
              passed: true,
              score: 70,
              max_score: 100,
              issues: [],
              warnings: [
                `DFE escalation FORCE-OVERRIDDEN by ${role} (confidence ${confidence.toFixed(2)}, id: ${escId})`,
              ],
              gate_status: 'FORCE_OVERRIDE',
              dfe_decision: dfeResult.decision,
              escalation_id: escId,
            };
          }

          // Block: escalation pending, no ack, no force
          console.log('   🚫 BLOCKED: Escalation pending chairman acknowledgment');
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
