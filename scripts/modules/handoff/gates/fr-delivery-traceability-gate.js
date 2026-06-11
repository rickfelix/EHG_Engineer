/**
 * FR Delivery Traceability gate for the EXEC-TO-PLAN completion boundary.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001 (built) / SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001 (wired).
 *
 * Closes the gap where orchestrator CHILDREN (and normal SDs) reached EXEC-TO-PLAN with only
 * proxy gates and FR delivery was never checked until LEAD-FINAL (and even then via an
 * any-story proxy). Reuses the SAME shared per-FR classifier as the LEAD-FINAL gate, so the
 * logic cannot drift between boundaries. Enforcement gated by LEO_FR_TRACEABILITY_ENFORCE
 * (default OFF = warn-only -> zero blast radius).
 *
 * Shipped 2026-06-08 but never imported by any executor (dead on arrival — WIRE_CHECK did not
 * flag the exported-no-caller factory). Wired into exec-to-plan/index.js (both the
 * orchestrator-child path and the normal path) by SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001.
 */
import { classifyFrDelivery, projectGateResult, isFrTraceabilityEnforced } from './fr-delivery-classifier.js';

/** The real validation body — separated so the fail-open wrapper below stays trivial. */
async function runFrDeliveryTraceability(supabase, ctx) {
  console.log('\n🔒 GATE: FR Delivery Traceability (SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001)');
  console.log('-'.repeat(50));
  const sd = ctx.sd || {};
  // Orchestrator PARENTS delegate FR delivery to their children — skip here.
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', sd.id);
  if (children && children.length > 0) {
    console.log('   ℹ️  Orchestrator parent — FR delivery delegated to children');
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Orchestrator parent — FR delivery delegated to children'], required: false };
  }

  const classification = await classifyFrDelivery(supabase, {
    sdId: sd.id,
    // product_requirements_v2.directive_id stores the sd_key, not the UUID — pass it so
    // the PRD/FR lookup resolves at this boundary (UUID-only would vacuously find 0 FRs).
    directiveId: sd.sd_key || sd.id,
    sdMetadata: sd.metadata || {},
    requesterSessionId: ctx.sessionId || ctx.session_id || null,
  });

  if (classification.total === 0) {
    console.log('   ℹ️  No functional requirements in PRD (or no PRD) — nothing to verify');
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No functional requirements found for FR delivery traceability'], required: false };
  }

  for (const f of classification.frs) {
    const mark = f.status === 'delivered' ? '✅' : f.status === 'descoped' ? '🔵' : '❌';
    console.log(`   ${mark} ${f.id} [${f.status}]`);
  }
  const enforced = isFrTraceabilityEnforced();
  console.log(`   📊 ${classification.delivered} delivered, ${classification.descoped} descoped, ${classification.undelivered} undelivered (enforce=${enforced ? 'ON' : 'OFF/warn-only'})`);
  return projectGateResult(classification, { enforced, gateName: 'FR_DELIVERY_TRACEABILITY' });
}

export function createFrDeliveryTraceabilityGate(supabase) {
  return {
    name: 'FR_DELIVERY_TRACEABILITY',
    validator: async (ctx) => {
      // SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001 (FR-2): fail-open in non-enforced mode.
      // ValidationOrchestrator blocks on the STATIC gate.required=true whenever a
      // validator THROWS — so a transient classifier DB error (3 live round-trips)
      // would hard-fail every EXEC-TO-PLAN even though the gate is warn-only by
      // default. Off => thrown errors resolve to a passing warn result; ON => strict.
      try {
        return await runFrDeliveryTraceability(supabase, ctx);
      } catch (err) {
        if (isFrTraceabilityEnforced()) throw err;
        console.log(`   ⚠️  FR traceability errored in warn-only mode (fail-open): ${err.message}`);
        return {
          passed: true, score: 100, max_score: 100, issues: [],
          warnings: [`FR delivery traceability errored (warn-only, fail-open): ${err.message}`],
          required: false
        };
      }
    },
    required: true
  };
}
