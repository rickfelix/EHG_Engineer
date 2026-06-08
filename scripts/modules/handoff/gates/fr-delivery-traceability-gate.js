/**
 * FR Delivery Traceability gate for the EXEC-TO-PLAN completion boundary.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001.
 *
 * Closes the gap where orchestrator CHILDREN (and normal SDs) reached EXEC-TO-PLAN with only
 * proxy gates and FR delivery was never checked until LEAD-FINAL (and even then via an
 * any-story proxy). Reuses the SAME shared per-FR classifier as the LEAD-FINAL gate, so the
 * logic cannot drift between boundaries. Enforcement gated by LEO_FR_TRACEABILITY_ENFORCE
 * (default OFF = warn-only -> zero blast radius).
 */
import { classifyFrDelivery, projectGateResult, isFrTraceabilityEnforced } from './fr-delivery-classifier.js';

export function createFrDeliveryTraceabilityGate(supabase) {
  return {
    name: 'FR_DELIVERY_TRACEABILITY',
    validator: async (ctx) => {
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
    },
    required: true
  };
}
