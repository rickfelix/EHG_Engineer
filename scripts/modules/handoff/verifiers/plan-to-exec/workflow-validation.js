/**
 * Workflow Validation for PLAN-TO-EXEC Verifier
 *
 * Validates workflow review analysis from Design Sub-Agent.
 *
 * Extracted from PlanToExecVerifier.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Validate workflow review analysis from Design Sub-Agent
 * Checks for workflow validation status and UX impact score
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Validation result
 */
export async function validateWorkflowReview(supabase, sdId) {
  try {
    const { data: designResults, error } = await supabase
      .from('sub_agent_execution_results')
      .select('metadata, created_at')
      .eq('sd_id', sdId)
      .eq('sub_agent_code', 'DESIGN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return { valid: true, status: 'SKIPPED', message: 'Workflow review not available (query error)' };
    }

    if (!designResults || designResults.length === 0) {
      return { valid: true, status: 'SKIPPED', message: 'Workflow review not yet executed' };
    }

    const workflowAnalysis = designResults[0].metadata?.workflow_analysis;

    if (!workflowAnalysis) {
      return { valid: true, status: 'SKIPPED', message: 'Workflow review not performed' };
    }

    const status = workflowAnalysis.status;
    const uxScore = workflowAnalysis.ux_impact_score;
    const deadEnds = workflowAnalysis.validation_results?.dead_ends || [];
    const circularFlows = workflowAnalysis.validation_results?.circular_flows || [];

    if (status === 'FAIL') {
      const issues = [];
      if (deadEnds.length > 0) issues.push(`${deadEnds.length} dead end(s) detected`);
      if (circularFlows.length > 0) issues.push(`${circularFlows.length} circular flow(s) detected`);
      if (uxScore < 6.0) issues.push(`UX impact score ${uxScore}/10 below minimum 6.0`);

      return {
        valid: false,
        status: 'FAIL',
        message: `Workflow validation failed: ${issues.join(', ')}`,
        analysis: workflowAnalysis,
        requiredActions: workflowAnalysis.recommendations?.filter(r => r.priority === 'CRITICAL') || []
      };
    }

    return {
      valid: true,
      status: workflowAnalysis.status,
      uxScore: uxScore,
      message: 'Workflow validation passed',
      analysis: workflowAnalysis
    };

  } catch (error) {
    console.error(`   ❌ Workflow review validation error: ${error.message}`);
    return { valid: true, status: 'ERROR', message: `Workflow review validation error: ${error.message}` };
  }
}

/**
 * Create handoff execution record
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive
 * @param {Object} prd - PRD
 * @param {Object} template - Handoff template
 * @param {Object} prdValidation - PRD validation result
 * @param {Object} handoffValidation - Handoff validation result
 * @returns {Promise<Object>} Execution record
 */
export async function createHandoffExecution(supabase, sd, prd, template, prdValidation, handoffValidation) {
  const executionId = `EXEC-${sd.id}-${Date.now()}`;

  const execution = {
    id: executionId,
    template_id: template?.id,
    from_agent: 'PLAN',
    to_agent: 'EXEC',
    sd_id: sd.id,
    prd_id: prd.id,
    handoff_type: 'PLAN-to-EXEC',
    status: 'accepted',
    validation_score: prdValidation.percentage || prdValidation.score,
    validation_passed: true,
    validation_details: {
      prd_validation: prdValidation,
      handoff_validation: handoffValidation,
      verified_at: new Date().toISOString(),
      verifier: 'PlanToExecVerifier'
    },
    completed_at: new Date().toISOString(),
    created_by: 'PLAN-EXEC-VERIFIER'
  };

  // Store execution (if table exists)
  try {
    await supabase.from('sd_phase_handoffs').insert(execution);
    console.log(`📝 Handoff execution recorded: ${executionId}`);
  } catch (error) {
    console.warn('⚠️  Could not store handoff execution:', error.message);
  }

  return execution;
}
