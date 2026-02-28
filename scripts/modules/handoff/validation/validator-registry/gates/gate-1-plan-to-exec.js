/**
 * Gate 1 - PLAN to EXEC Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validatePRDQuality } from '../../../../prd-quality-validation.js';
import { validateUserStoriesForHandoff } from '../../../../user-story-quality-validation.js';
import { validateBMADForPlanToExec } from '../../../../bmad-validation.js';
import { isLightweightSDType } from '../../sd-type-applicability-policy.js';
import { getStoryMinimumScoreByCategory } from '../../../verifiers/plan-to-exec/story-quality.js';

/**
 * Register Gate 1 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate1Validators(registry) {
  registry.register('prdQualityValidation', async (context) => {
    const { prd, sd, options = {} } = context;
    if (!prd) {
      return { passed: false, score: 0, max_score: 100, issues: ['No PRD provided'] };
    }
    // Pass SD type so refactor/infrastructure SDs use heuristic validation
    const mergedOptions = { ...options, sdType: sd?.sd_type, sdCategory: sd?.category };
    const result = await validatePRDQuality(prd, mergedOptions);
    return registry.normalizeResult(result);
  }, 'PRD quality validation using AI-powered Russian Judge rubric');

  registry.register('userStoryQualityValidation', async (context) => {
    const { prd, sd, sd_id, supabase, options = {} } = context;

    // SD-LEO-001: First check PRD content, then check user_stories table
    let stories = prd?.user_stories || prd?.content?.user_stories || [];

    // If no stories in PRD, check the user_stories table
    if (stories.length === 0 && supabase && (sd_id || prd?.sd_id)) {
      const { data: tableStories } = await supabase
        .from('user_stories')
        .select('*')
        .eq('sd_id', sd_id || prd?.sd_id);
      stories = tableStories || [];
    }

    if (stories.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['No user stories found in PRD or user_stories table'] };
    }

    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-036: Pre-check for empty acceptance_criteria
    // Surfaces warnings early to prevent userStoryQualityValidation failures
    const storiesWithoutAC = stories.filter(s =>
      !s.acceptance_criteria || (Array.isArray(s.acceptance_criteria) && s.acceptance_criteria.length === 0)
    );
    const acWarnings = [];
    if (storiesWithoutAC.length > 0) {
      acWarnings.push(`${storiesWithoutAC.length}/${stories.length} user stories lack acceptance_criteria`);
    }

    // SD-LEO-001: Pass SD type to enable heuristic validation for infrastructure/database SDs
    // FIX: Compute SD-type-aware minimumScore instead of relying on default (70%)
    const sdType = sd?.sd_type || '';
    const sdCategory = sd?.category || '';
    const minimumScore = getStoryMinimumScoreByCategory(sdCategory, sdType);

    const validationOptions = {
      ...options,
      minimumScore,
      sdType,
      sdCategory
    };

    const result = await validateUserStoriesForHandoff(stories, validationOptions);

    return registry.normalizeResult({
      passed: result.valid,
      score: result.averageScore,
      max_score: 100,
      issues: result.issues,
      warnings: [...(result.warnings || []), ...acWarnings],
      details: result
    });
  }, 'User story quality validation');

  registry.register('designSubAgentExecution', async (context) => {
    const { sd, sd_id, supabase } = context;

    // SD-LEO-001: Only 'feature' and 'database' SDs require DESIGN sub-agent
    const requiresDesignGate = ['feature', 'database'];
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (!requiresDesignGate.includes(sdType)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`DESIGN sub-agent skipped for ${sdType} SD type`]
      };
    }

    // Check for DESIGN sub-agent execution
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DESIGN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['DESIGN sub-agent not executed'] };
    }

    const execution = data[0];
    if (execution.verdict === 'FAIL') {
      return { passed: false, score: 30, max_score: 100, issues: ['DESIGN sub-agent returned FAIL verdict'] };
    }

    return { passed: true, score: 100, max_score: 100, issues: [], details: { execution } };
  }, 'DESIGN sub-agent execution verification');

  registry.register('databaseSubAgentExecution', async (context) => {
    const { sd, sd_id, supabase } = context;

    // SD-LEO-001: Only 'feature' and 'database' SDs require DATABASE sub-agent
    const requiresDatabaseGate = ['feature', 'database'];
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (!requiresDatabaseGate.includes(sdType)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`DATABASE sub-agent skipped for ${sdType} SD type`]
      };
    }

    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DATABASE')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['DATABASE sub-agent not executed'] };
    }

    const execution = data[0];
    if (execution.verdict === 'FAIL') {
      return { passed: false, score: 30, max_score: 100, issues: ['DATABASE sub-agent returned FAIL verdict'] };
    }

    return { passed: true, score: 100, max_score: 100, issues: [], details: { execution } };
  }, 'DATABASE sub-agent execution verification');

  registry.register('bmadContextEngineering', async (context) => {
    const { sd_id, supabase } = context;
    const result = await validateBMADForPlanToExec(sd_id, supabase);
    return registry.normalizeResult(result);
  }, 'BMAD context engineering validation');

  // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Wire risks into PLAN-TO-EXEC context
  registry.register('risksValidation', async (context) => {
    const { prd } = context;
    const risks = prd?.risks || [];

    if (!Array.isArray(risks) || risks.length === 0) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['No risks defined in PRD - consider documenting known risks and mitigations']
      };
    }

    const missingMitigation = risks.filter(r => !r.mitigation && !r.mitigation_strategy);
    if (missingMitigation.length > 0) {
      return {
        passed: true,
        score: 80,
        max_score: 100,
        issues: [],
        warnings: [`${missingMitigation.length} risk(s) lack mitigation strategies`],
        details: { risk_count: risks.length, missing_mitigation: missingMitigation.length }
      };
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { risk_count: risks.length }
    };
  }, 'PRD risks validation - ensures risks are documented with mitigations');

  // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Wire implementation_approach into EXEC context
  registry.register('implementationApproachValidation', async (context) => {
    const { prd } = context;
    const approach = prd?.implementation_approach || '';

    if (!approach || approach.length === 0) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['No implementation_approach defined in PRD']
      };
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      details: { approach_length: approach.length }
    };
  }, 'PRD implementation approach validation');

  registry.register('goalSummaryValidation', async (context) => {
    const { prd, sd } = context;
    const issues = [];

    // Fallback chain: prd.goal_summary → prd.executive_summary → sd.description → sd.title
    let goalSummary = prd?.goal_summary || prd?.executive_summary || '';
    let usedFallback = false;

    if (!goalSummary || goalSummary.length === 0) {
      goalSummary = sd?.description || sd?.title || '';
      if (goalSummary.length > 0) {
        usedFallback = true;
        issues.push('Goal summary sourced from SD description (PRD goal_summary and executive_summary are empty)');
      }
    }

    if (!goalSummary || goalSummary.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['Goal summary is missing from PRD and SD'] };
    }

    // Truncate to 300 chars for validation (applies to fallback values too)
    const truncated = goalSummary.length > 300 ? goalSummary.substring(0, 300) : goalSummary;
    if (goalSummary.length > 300) {
      issues.push(`Goal summary is ${goalSummary.length} chars, truncated to 300 for validation`);
    }

    return {
      passed: true,
      score: usedFallback ? 80 : 100,
      max_score: 100,
      issues,
      details: { summary_length: truncated.length, used_fallback: usedFallback }
    };
  }, 'Goal summary validation with SD fallback (max 300 chars)');

  registry.register('fileScopeValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (isLightweightSDType(sdType)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`file_scope validation skipped for ${sdType} SD type`]
      };
    }

    // PAT-VALSCHEMA-001: file_scope column does not exist in product_requirements_v2.
    // Check both prd.file_scope and prd.metadata.file_scope as fallback.
    // Missing file_scope is advisory (warning), not blocking, since no PRD
    // creation path currently populates this field.
    const fileScope = prd?.file_scope || prd?.metadata?.file_scope || {};
    const warnings = [];

    if (!fileScope.create && !fileScope.modify && !fileScope.delete) {
      warnings.push('file_scope not defined - consider adding create/modify/delete arrays to PRD metadata');
    }

    const hasContent = (fileScope.create?.length > 0) ||
                       (fileScope.modify?.length > 0) ||
                       (fileScope.delete?.length > 0);

    if (!hasContent && fileScope.create) {
      warnings.push('file_scope arrays are all empty');
    }

    return {
      passed: true,  // PAT-VALSCHEMA-001: Never block on missing file_scope
      score: hasContent ? 100 : 70,
      max_score: 100,
      issues: [],
      warnings
    };
  }, 'File scope validation');

  registry.register('executionPlanValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (isLightweightSDType(sdType)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`execution_plan validation skipped for ${sdType} SD type`]
      };
    }

    // SD-LIFECYCLE-GAP-004: Check for non-empty arrays only
    const getSteps = (arr) => Array.isArray(arr) && arr.length > 0 ? arr : null;
    const executionPlan =
      getSteps(prd?.execution_plan) ||
      getSteps(prd?.implementation_steps) ||
      getSteps(prd?.planning_section?.implementation_steps) ||
      getSteps(prd?.metadata?.execution_plan?.steps) ||
      [];

    // PAT-VALSCHEMA-001: execution_plan is not populated by any PRD creation path.
    // Downgraded from blocking error to advisory warning.
    if (!executionPlan || executionPlan.length === 0) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: ['Execution plan has no steps - consider adding implementation_steps to PRD']
      };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Execution plan validation (min 1 step)');

  registry.register('testingStrategyValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
    const sdType = (sd?.sd_type || '').toLowerCase();
    const sdCategory = (sd?.category || '').toLowerCase();
    if (isLightweightSDType(sdType) || isLightweightSDType(sdCategory)) {
      const skipReason = isLightweightSDType(sdType) ? sdType : sdCategory;
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`testing_strategy validation skipped for ${skipReason} SD`]
      };
    }

    const testing = prd?.testing_strategy || prd?.testing ||
      prd?.metadata?.testing_strategy || {};
    const warnings = [];

    // PAT-VALSCHEMA-001: testing_strategy is not populated by standard PRD creation.
    // Downgraded from blocking to advisory - actual test execution is enforced at EXEC-TO-PLAN.
    if (!testing.unit_tests && !testing.e2e_tests) {
      warnings.push('Testing strategy not defined in PRD - will be enforced at EXEC-TO-PLAN handoff');
    }

    return {
      passed: true,  // PAT-VALSCHEMA-001: Never block on missing testing_strategy at PLAN-TO-EXEC
      score: (testing.unit_tests || testing.e2e_tests) ? 100 : 70,
      max_score: 100,
      issues: [],
      warnings
    };
  }, 'Testing strategy validation');

  // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Wire Category B/D fields into PLAN-TO-EXEC context
  registry.register('prdFieldCompletenessAudit', async (context) => {
    const { prd } = context;
    const warnings = [];
    const consumed = [];

    // Category B: Medium-value fields
    if (prd?.data_model && Object.keys(prd.data_model).length > 0) consumed.push('data_model');
    if (prd?.api_specifications && Object.keys(prd.api_specifications).length > 0) consumed.push('api_specifications');
    if (prd?.ui_ux_requirements && Object.keys(prd.ui_ux_requirements).length > 0) consumed.push('ui_ux_requirements');
    if (prd?.technology_stack && Object.keys(prd.technology_stack).length > 0) consumed.push('technology_stack');
    if (prd?.dependencies && (Array.isArray(prd.dependencies) ? prd.dependencies.length > 0 : Object.keys(prd.dependencies).length > 0)) consumed.push('dependencies');
    if (prd?.performance_requirements && Object.keys(prd.performance_requirements).length > 0) consumed.push('performance_requirements');

    // Category D: Administrative fields (consumed for audit trail)
    if (prd?.assumptions) consumed.push('assumptions');
    if (prd?.stakeholders) consumed.push('stakeholders');
    if (prd?.business_context) consumed.push('business_context');
    if (prd?.technical_context) consumed.push('technical_context');

    const totalTracked = 10;
    const score = consumed.length >= 6 ? 100 : consumed.length >= 3 ? 85 : 70;

    return {
      passed: true,
      score,
      max_score: 100,
      issues: [],
      warnings: consumed.length < 3 ? ['PRD has few populated fields - consider enriching PRD content'] : [],
      details: { populated_fields: consumed, populated_count: consumed.length, total_tracked: totalTracked }
    };
  }, 'PRD field completeness audit - verifies Category B/D fields are populated');
}
