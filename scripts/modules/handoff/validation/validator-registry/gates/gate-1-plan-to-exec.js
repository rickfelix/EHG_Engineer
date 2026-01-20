/**
 * Gate 1 - PLAN to EXEC Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validatePRDQuality } from '../../../../prd-quality-validation.js';
import { validateUserStoriesForHandoff } from '../../../../user-story-quality-validation.js';
import { validateBMADForPlanToExec } from '../../../../bmad-validation.js';

/**
 * Register Gate 1 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate1Validators(registry) {
  registry.register('prdQualityValidation', async (context) => {
    const { prd, options = {} } = context;
    if (!prd) {
      return { passed: false, score: 0, max_score: 100, issues: ['No PRD provided'] };
    }
    const result = await validatePRDQuality(prd, options);
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

    // SD-LEO-001: Pass SD type to enable heuristic validation for infrastructure/database SDs
    const validationOptions = {
      ...options,
      sdType: sd?.sd_type || '',
      sdCategory: sd?.category || ''
    };

    const result = await validateUserStoriesForHandoff(stories, validationOptions);

    return registry.normalizeResult({
      passed: result.valid,
      score: result.averageScore,
      max_score: 100,
      issues: result.issues,
      warnings: result.warnings,
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

  registry.register('goalSummaryValidation', async (context) => {
    const { prd } = context;
    const goalSummary = prd?.goal_summary || prd?.executive_summary || '';

    if (!goalSummary || goalSummary.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['Goal summary is missing'] };
    }
    if (goalSummary.length > 300) {
      return { passed: false, score: 70, max_score: 100, issues: [`Goal summary is ${goalSummary.length} chars, max 300 recommended`] };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Goal summary validation (max 300 chars)');

  registry.register('fileScopeValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-001: Skip file_scope validation for infrastructure/documentation SDs
    const skipTypes = ['infrastructure', 'documentation', 'orchestrator'];
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (skipTypes.includes(sdType)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`file_scope validation skipped for ${sdType} SD type`]
      };
    }

    // Check both prd.file_scope and prd.metadata.file_scope
    const fileScope = prd?.file_scope || prd?.metadata?.file_scope || {};
    const issues = [];

    if (!fileScope.create && !fileScope.modify && !fileScope.delete) {
      issues.push('file_scope should have create/modify/delete arrays');
    }

    const hasContent = (fileScope.create?.length > 0) ||
                       (fileScope.modify?.length > 0) ||
                       (fileScope.delete?.length > 0);

    if (!hasContent) {
      issues.push('file_scope arrays are all empty');
    }

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : 50,
      max_score: 100,
      issues
    };
  }, 'File scope validation');

  registry.register('executionPlanValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-001: Skip for infrastructure/documentation SDs
    const skipTypes = ['infrastructure', 'documentation', 'orchestrator'];
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (skipTypes.includes(sdType)) {
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

    if (!executionPlan || executionPlan.length === 0) {
      return { passed: false, score: 0, max_score: 100, issues: ['Execution plan has no steps'] };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Execution plan validation (min 1 step)');

  registry.register('testingStrategyValidation', async (context) => {
    const { sd, prd } = context;

    // SD-LEO-001: Skip for infrastructure/documentation SDs
    const skipTypes = ['infrastructure', 'documentation', 'orchestrator'];
    const sdType = (sd?.sd_type || '').toLowerCase();
    const sdCategory = (sd?.category || '').toLowerCase();
    if (skipTypes.includes(sdType) || skipTypes.includes(sdCategory)) {
      const skipReason = skipTypes.includes(sdType) ? sdType : sdCategory;
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
    const issues = [];

    if (!testing.unit_tests && !testing.e2e_tests) {
      issues.push('Testing strategy should define unit_tests and e2e_tests');
    }

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : 50,
      max_score: 100,
      issues
    };
  }, 'Testing strategy validation');
}
