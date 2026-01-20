/**
 * Traceability Gates for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * Gate 3: End-to-End Traceability Validation
 * Gate 4: Workflow ROI & Pattern Effectiveness
 */

/**
 * Create the GATE3_TRACEABILITY gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createTraceabilityGate(supabase) {
  return {
    name: 'GATE3_TRACEABILITY',
    validator: async (ctx) => {
      console.log('\n🚪 GATE 3: End-to-End Traceability Validation');
      console.log('-'.repeat(50));

      // Lazy load validator
      const { validateGate3PlanToLead } = await import('../../../../traceability-validation.js');

      // Fetch Gate 2 results from EXEC→PLAN handoff
      const { data: execToPlanHandoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', ctx.sdId)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .order('created_at', { ascending: false })
        .limit(1);

      const gate2Results = execToPlanHandoff?.[0]?.metadata?.gate2_validation || null;

      const result = await validateGate3PlanToLead(ctx.sdId, supabase, gate2Results);
      ctx._gate3Results = result;

      return result;
    },
    required: true
  };
}

/**
 * Create the GATE4_WORKFLOW_ROI gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createWorkflowROIGate(supabase) {
  return {
    name: 'GATE4_WORKFLOW_ROI',
    validator: async (ctx) => {
      console.log('\n🚪 GATE 4: Workflow ROI & Pattern Effectiveness (LEAD Final)');
      console.log('-'.repeat(50));

      // Lazy load validator
      const { validateGate4LeadFinal } = await import('../../../../workflow-roi-validation.js');

      // Fetch Gate 1 results from PLAN→EXEC handoff
      const { data: planToExecHandoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', ctx.sdId)
        .eq('handoff_type', 'PLAN-TO-EXEC')
        .order('created_at', { ascending: false })
        .limit(1);

      // Fetch Gate 2 results from EXEC→PLAN handoff
      const { data: execToPlanHandoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', ctx.sdId)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .order('created_at', { ascending: false })
        .limit(1);

      const allGateResults = {
        gate1: planToExecHandoff?.[0]?.metadata?.gate1_validation || null,
        gate2: execToPlanHandoff?.[0]?.metadata?.gate2_validation || null,
        gate3: ctx._gate3Results || null
      };

      const result = await validateGate4LeadFinal(ctx.sdId, supabase, allGateResults);
      ctx._gate4Results = result;

      return result;
    },
    required: true
  };
}

/**
 * Check if SD type requires traceability gates
 *
 * @param {Object} sd - Strategic Directive
 * @returns {boolean} True if gates should be added
 */
export function requiresTraceabilityGates(sd) {
  const { isInfrastructureSDSync } = require('../../../../sd-type-checker.js');
  const isNonCodeSD = isInfrastructureSDSync(sd);
  const sdType = (sd.sd_type || '').toLowerCase();
  const isBugfixSD = sdType === 'bugfix' || sdType === 'bug_fix';

  return !isNonCodeSD && !isBugfixSD;
}
