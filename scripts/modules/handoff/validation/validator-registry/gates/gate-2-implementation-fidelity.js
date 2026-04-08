/**
 * Gates 2A-2D - Implementation Fidelity Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 *
 * SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Validators now check
 * ctx.gateContext.gate2Result before making independent DB queries.
 * The preloader fetches shared data once; validators reuse it.
 */

import { validateGate2ExecToPlan } from '../../../../implementation-fidelity-validation.js';
import { shouldSkipCodeValidation } from '../../../../../../lib/utils/sd-type-validation.js';
import { validateWireframeQA } from '../../../validators/wireframe-qa-validator.js';

/**
 * SD-LEO-FIX-FIX-GATE-SUB-001: Check if a sub-validator is exempt via gate2_exempt_sections.
 *
 * The main Gate 2 function (implementation-fidelity/index.js) applies exemptions at the
 * section level, but sub-validators here extract aggregate section scores that can be
 * dragged down by non-exempt sub-sections within the same section. This helper checks
 * individual exemption keys so each sub-validator respects its own exemption independently.
 *
 * @param {object} result - Gate 2 validation result
 * @param {string[]} exemptionKeys - Keys to check (e.g., ['A_design'], ['B1_migrations'])
 * @returns {{exempt: boolean, result?: object}} Exemption decision
 */
function checkSubValidatorExemption(result, exemptionKeys) {
  const exemptSections = result?.details?.gate2_exempt_sections || [];
  if (exemptSections.length === 0) return { exempt: false };

  const matchedKey = exemptionKeys.find(key => exemptSections.includes(key));
  if (!matchedKey) return { exempt: false };

  return {
    exempt: true,
    result: {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [`Sub-validator exempt via gate2_exempt_sections (${matchedKey})`],
      details: { exempt: true, exemptionKey: matchedKey }
    }
  };
}

/**
 * Get Gate 2 result from preloaded context or fetch it fresh.
 * @param {object} context - Validator context
 * @returns {Promise<object>} Gate 2 validation result
 */
async function getGate2Result(context) {
  // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use preloaded result if available
  if (context.gateContext?.gate2Result) {
    return context.gateContext.gate2Result;
  }
  const { sd_id, supabase } = context;
  return validateGate2ExecToPlan(sd_id, supabase);
}

/**
 * Register Gate 2 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate2Validators(registry) {
  // Section A: UI Components Implementation
  registry.register('uiComponentsImplemented', async (context) => {
    const result = await getGate2Result(context);

    // SD-LEO-FIX-FIX-GATE-SUB-001: Check sub-validator exemption before score extraction
    const exemption = checkSubValidatorExemption(result, ['A_design']);
    if (exemption.exempt) return exemption.result;

    // Extract Section A score - check multiple paths for compatibility
    const sectionA = result?.sections?.A || result?.sectionScores?.A ||
      result?.details?.design_fidelity || {};
    const scoreFromGateScores = result?.gate_scores?.design_fidelity;
    // Normalize section score (max 25) to 0-100 scale
    const rawScore = sectionA.score ?? scoreFromGateScores ?? 0;
    const finalScore = Math.round((rawScore / 25) * 100);
    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-057: Use section-specific threshold,
    // not overall result.passed which inherits cross-section failures
    const passed = finalScore >= 70;

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
    const result = await getGate2Result(context);

    // SD-LEO-FIX-FIX-GATE-SUB-001: Check sub-validator exemption before score extraction
    const exemption = checkSubValidatorExemption(result, ['B1_migrations']);
    if (exemption.exempt) return exemption.result;

    const sectionB = result?.sections?.B || result?.sectionScores?.B ||
      result?.details?.database_fidelity || {};
    const scoreFromGateScores = result?.gate_scores?.database_fidelity;
    // Normalize section score (max 35) to 0-100 scale
    const rawScore = sectionB.score ?? scoreFromGateScores ?? 0;
    const finalScore = Math.round((rawScore / 35) * 100);
    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-057: Use section-specific threshold
    const passed = finalScore >= 50; // Lower threshold for DB

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
    // SD-LEO-FIX-FIX-GATE-SUB-001: Check own exemption key before delegating
    const result = await getGate2Result(context);
    const exemption = checkSubValidatorExemption(result, ['B2_rls']);
    if (exemption.exempt) return exemption.result;
    return registry.validators.get('migrationsCreatedAndExecuted').validate(context);
  }, 'RLS policies validation');

  registry.register('migrationComplexityAligned', async (context) => {
    // SD-LEO-FIX-FIX-GATE-SUB-001: Check own exemption key before delegating
    const result = await getGate2Result(context);
    const exemption = checkSubValidatorExemption(result, ['B3_complexity']);
    if (exemption.exempt) return exemption.result;
    return registry.validators.get('migrationsCreatedAndExecuted').validate(context);
  }, 'Migration complexity alignment');

  // Section C: Data Flow
  registry.register('databaseQueriesIntegrated', async (context) => {
    const result = await getGate2Result(context);

    // SD-LEO-FIX-FIX-GATE-SUB-001: Check sub-validator exemption before score extraction
    const exemption = checkSubValidatorExemption(result, ['C_dataflow', 'C1_queries']);
    if (exemption.exempt) return exemption.result;

    const sectionC = result?.sections?.C || result?.sectionScores?.C ||
      result?.details?.data_flow_alignment || {};
    const scoreFromGateScores = result?.gate_scores?.data_flow_alignment;
    // Normalize section score (max 25) to 0-100 scale
    const rawScore = sectionC.score ?? scoreFromGateScores ?? 0;
    const finalScore = Math.round((rawScore / 25) * 100);
    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-057: Use section-specific threshold
    const passed = finalScore >= 70;

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
    // SD-LEO-FIX-FIX-GATE-SUB-001: Check own exemption key before delegating
    const result = await getGate2Result(context);
    const exemption = checkSubValidatorExemption(result, ['C2_form_integration']);
    if (exemption.exempt) return exemption.result;
    return registry.validators.get('databaseQueriesIntegrated').validate(context);
  }, 'Form/UI integration');

  registry.register('dataValidationImplemented', async (context) => {
    // SD-LEO-FIX-FIX-GATE-SUB-001: Check own exemption key before delegating
    const result = await getGate2Result(context);
    const exemption = checkSubValidatorExemption(result, ['C_dataflow']);
    if (exemption.exempt) return exemption.result;
    return registry.validators.get('databaseQueriesIntegrated').validate(context);
  }, 'Data validation implementation');

  // Section D: E2E Testing
  registry.register('e2eTestCoverage', async (context) => {
    const result = await getGate2Result(context);

    // SD-LEO-FIX-FIX-GATE-SUB-001: Check sub-validator exemption before score extraction
    const exemption = checkSubValidatorExemption(result, ['D_testing', 'D1_unit_tests', 'D2_migration_tests']);
    if (exemption.exempt) return exemption.result;

    const sectionD = result?.sections?.D || result?.sectionScores?.D ||
      result?.details?.enhanced_testing || {};
    const scoreFromGateScores = result?.gate_scores?.enhanced_testing;
    // Normalize section score (max 25) to 0-100 scale
    const rawScore = sectionD.score ?? scoreFromGateScores ?? 0;
    const finalScore = Math.round((rawScore / 25) * 100);
    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-057: Use section-specific threshold
    const passed = finalScore >= 70;

    return {
      passed,
      score: finalScore,
      max_score: 100,
      issues: sectionD.issues || result?.issues || [],
      warnings: sectionD.warnings || result?.warnings || [],
      details: sectionD
    };
  }, 'E2E test coverage (CRITICAL)');

  // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Wire acceptance_criteria into implementation fidelity
  registry.register('acceptanceCriteriaValidation', async (context) => {
    const { prd } = context;
    const criteria = prd?.acceptance_criteria || [];

    if (!Array.isArray(criteria) || criteria.length === 0) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['No acceptance_criteria defined in PRD - implementation fidelity may be incomplete']
      };
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { criteria_count: criteria.length, criteria }
    };
  }, 'PRD acceptance criteria validation - ensures criteria are defined for fidelity checks');

  // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Wire test_scenarios into EXEC-TO-PLAN validation
  registry.register('testScenariosValidation', async (context) => {
    const { prd } = context;
    const scenarios = prd?.test_scenarios || [];

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['No test_scenarios defined in PRD - test coverage cannot be validated against PRD']
      };
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { scenario_count: scenarios.length, scenarios: scenarios.map(s => s.name || s.description || s) }
    };
  }, 'PRD test scenarios validation - ensures test scenarios are defined for coverage checks');

  registry.register('testingSubAgentVerified', async (context) => {
    const { sd_id, supabase } = context;

    // Check if this SD type should skip code validation
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, title, category, scope, description')
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
        score: 0,
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

  // SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001: Wireframe QA validation
  registry.register('wireframeQAValidation', async (context) => {
    const result = await validateWireframeQA(context);
    return registry.normalizeResult(result);
  }, 'Wireframe-implementation alignment QA for UI-producing SDs');
}
