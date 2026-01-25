/**
 * Gates 2A-2D - Implementation Fidelity Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validateGate2ExecToPlan } from '../../../../implementation-fidelity-validation.js';
import { shouldSkipCodeValidation } from '../../../../../../lib/utils/sd-type-validation.js';

/**
 * Register Gate 2 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate2Validators(registry) {
  // Section A: UI Components Implementation
  registry.register('uiComponentsImplemented', async (context) => {
    const { sd_id, supabase } = context;
    const result = await validateGate2ExecToPlan(sd_id, supabase);

    // Extract Section A score - check multiple paths for compatibility
    const sectionA = result?.sections?.A || result?.sectionScores?.A ||
      result?.details?.design_fidelity || {};
    const scoreFromGateScores = result?.gate_scores?.design_fidelity;
    const finalScore = sectionA.score ?? scoreFromGateScores ?? 0;
    const passed = result?.passed ?? (finalScore >= 70);

    return {
      passed,
      score: finalScore,
      max_score: 100,
      issues: sectionA.issues || result?.issues || [],
      warnings: sectionA.warnings || result?.warnings || [],
      details: sectionA
    };
  }, 'UI components implementation fidelity');

  registry.register('userWorkflowsImplemented', async (context) => {
    return registry.validators.get('uiComponentsImplemented').validate(context);
  }, 'User workflows implementation fidelity');

  registry.register('userActionsSupported', async (context) => {
    return registry.validators.get('uiComponentsImplemented').validate(context);
  }, 'User actions (CRUD) implementation');

  // Section B: Database Migrations
  registry.register('migrationsCreatedAndExecuted', async (context) => {
    const { sd_id, supabase } = context;
    const result = await validateGate2ExecToPlan(sd_id, supabase);

    const sectionB = result?.sections?.B || result?.sectionScores?.B ||
      result?.details?.database_fidelity || {};
    const scoreFromGateScores = result?.gate_scores?.database_fidelity;
    const finalScore = sectionB.score ?? scoreFromGateScores ?? 0;
    const passed = result?.passed ?? (finalScore >= 50); // Lower threshold for DB

    return {
      passed,
      score: finalScore,
      max_score: 100,
      issues: sectionB.issues || result?.issues || [],
      warnings: sectionB.warnings || result?.warnings || [],
      details: sectionB
    };
  }, 'Database migrations validation (CRITICAL)');

  registry.register('rlsPoliciesImplemented', async (context) => {
    return registry.validators.get('migrationsCreatedAndExecuted').validate(context);
  }, 'RLS policies validation');

  registry.register('migrationComplexityAligned', async (context) => {
    return registry.validators.get('migrationsCreatedAndExecuted').validate(context);
  }, 'Migration complexity alignment');

  // Section C: Data Flow
  registry.register('databaseQueriesIntegrated', async (context) => {
    const { sd_id, supabase } = context;
    const result = await validateGate2ExecToPlan(sd_id, supabase);

    const sectionC = result?.sections?.C || result?.sectionScores?.C ||
      result?.details?.data_flow || {};
    const scoreFromGateScores = result?.gate_scores?.data_flow;
    const finalScore = sectionC.score ?? scoreFromGateScores ?? 0;
    const passed = result?.passed ?? (finalScore >= 70);

    return {
      passed,
      score: finalScore,
      max_score: 100,
      issues: sectionC.issues || result?.issues || [],
      warnings: sectionC.warnings || result?.warnings || [],
      details: sectionC
    };
  }, 'Database queries integration');

  registry.register('formUiIntegration', async (context) => {
    return registry.validators.get('databaseQueriesIntegrated').validate(context);
  }, 'Form/UI integration');

  registry.register('dataValidationImplemented', async (context) => {
    return registry.validators.get('databaseQueriesIntegrated').validate(context);
  }, 'Data validation implementation');

  // Section D: E2E Testing
  registry.register('e2eTestCoverage', async (context) => {
    const { sd_id, supabase } = context;
    const result = await validateGate2ExecToPlan(sd_id, supabase);

    const sectionD = result?.sections?.D || result?.sectionScores?.D ||
      result?.details?.testing || {};
    const scoreFromGateScores = result?.gate_scores?.testing;
    const finalScore = sectionD.score ?? scoreFromGateScores ?? 0;
    const passed = result?.passed ?? (finalScore >= 70);

    return {
      passed,
      score: finalScore,
      max_score: 100,
      issues: sectionD.issues || result?.issues || [],
      warnings: sectionD.warnings || result?.warnings || [],
      details: sectionD
    };
  }, 'E2E test coverage (CRITICAL)');

  registry.register('testingSubAgentVerified', async (context) => {
    const { sd_id, supabase } = context;

    // Check if this SD type should skip code validation
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, title')
      .eq('id', sd_id)
      .single();

    if (sdData && shouldSkipCodeValidation(sdData)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`TESTING validation skipped for ${sdData.sd_type} SD`]
      };
    }

    // Refactor SDs require REGRESSION sub-agent, not TESTING
    // This validates backward compatibility instead of E2E tests
    const isRefactor = sdData?.sd_type === 'refactor';
    const requiredAgent = isRefactor ? 'REGRESSION' : 'TESTING';
    const agentLabel = isRefactor ? 'REGRESSION (backward compatibility)' : 'TESTING (E2E)';

    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', requiredAgent)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: [`${requiredAgent} sub-agent not executed (required for ${sdData?.sd_type || 'unknown'} SD)`]
      };
    }

    const execution = data[0];
    // Accept both PASS and CONDITIONAL_PASS as valid verdicts
    if (!['PASS', 'CONDITIONAL_PASS'].includes(execution.verdict)) {
      return {
        passed: false,
        score: 30,
        max_score: 100,
        issues: [`${requiredAgent} sub-agent verdict: ${execution.verdict}, expected PASS or CONDITIONAL_PASS`]
      };
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: isRefactor ? [`Validated via ${agentLabel}`] : []
    };
  }, 'TESTING/REGRESSION sub-agent verification');
}
