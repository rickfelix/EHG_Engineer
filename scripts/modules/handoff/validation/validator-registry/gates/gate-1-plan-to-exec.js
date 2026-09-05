/**
 * Gate 1 - PLAN to EXEC Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validatePRDQuality } from '../../../../prd-quality-validation.js';
import { validateUserStoriesForHandoff } from '../../../../user-story-quality-validation.js';
import { validateBMADForPlanToExec } from '../../../../bmad-validation.js';
import { isLightweightSDType } from '../../sd-type-applicability-policy.js';
import { getStoryMinimumScoreByCategory } from '../../../verifiers/plan-to-exec/story-quality.js';
import { validateWireframeArtifact } from '../../../validators/wireframe-artifact-validator.js';

// SD-LEO-FIX-GATE-PLAN-EXEC-001 (escalated from QF-20260903-239): issue classes that stay
// UNCONDITIONALLY blocking regardless of score -- a thin/empty PRD's structural insufficiency
// is not the kind of flagged item the score-based leniency below is meant to waive. Matched
// against validatePRDHeuristic's own issue text (prd-quality-validation.js:178/:202); every
// OTHER heuristic issue (e.g. placeholder/boilerplate requirements) is reclassifiable.
const PRD_QUALITY_UNCONDITIONAL_BLOCK_PATTERNS = [/Insufficient functional requirements/, /Insufficient acceptance criteria/];

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

    // SD-LEO-FIX-GATE-PLAN-EXEC-001: apply score-based leniency INLINE against this single
    // validatePRDQuality call, guarded by result.details?.method==='heuristic' -- never routed
    // through validatePRDForHandoff, which has no heuristic/AI-rubric awareness and would also
    // relax the out-of-scope AI-rubric path (prd-quality-rubric.js:733-751 never sets
    // details.method, so the `?.` guard here correctly excludes it). validatePRDHeuristic
    // (prd-quality-validation.js:249) computes `passed = score >= 50 && issues.length === 0`,
    // hard-failing on ANY nonzero issues regardless of score -- this was the defect: a PRD
    // scoring well above any reasonable threshold with one flagged item (e.g. a placeholder
    // requirement) was blocked exactly like an empty PRD.
    //
    // Threshold reuses getStoryMinimumScoreByCategory (already imported above for
    // userStoryQualityValidation) -- the SAME function the parallel legacy PRD_BOILERPLATE
    // check already uses (see the `isRefactorBrief ? 50 : getStoryMinimumScoreByCategory(...)`
    // call in PlanToExecVerifier.js's verifyHandoff -- deliberately not citing a line number
    // here, since one already went stale once in review), so the two checks agree on the
    // NUMERIC threshold instead of independently drifting (this SD's original defect was a
    // 50-vs-55 mismatch). Two divergences remain ACCEPTED, not fixed, by this SD: (1) that
    // call site's `isRefactorBrief ? 50 : ...` carve-out is not replicated here; (2) that
    // legacy check's leniency (via validatePRDForHandoff) applies to BOTH the heuristic and
    // AI-rubric paths, while this gate's leniency is deliberately heuristic-only. A full
    // consolidation of the two checks is a larger refactor, out of this bugfix's scope.
    //
    // leo_validation_rules.criteria.min_score for this rule (currently 50) is NOT read here --
    // confirmed inert: ValidationOrchestrator.js places rule.criteria on gate.meta only, never
    // into the validator context. Documented here rather than silently left to mislead a future
    // reader into thinking that DB value governs this threshold.
    const isHeuristic = result.details?.method === 'heuristic';
    const rawIssues = result.issues || [];
    const unconditionalIssues = rawIssues.filter((i) =>
      PRD_QUALITY_UNCONDITIONAL_BLOCK_PATTERNS.some((p) => p.test(i)));
    const reclassifiableIssues = rawIssues.filter((i) =>
      !PRD_QUALITY_UNCONDITIONAL_BLOCK_PATTERNS.some((p) => p.test(i)));
    const threshold = getStoryMinimumScoreByCategory(sd?.category, sd?.sd_type);
    const scoreClears = typeof result.score === 'number' && result.score >= threshold;

    let passed = result.passed;
    let issues = rawIssues;
    let warnings = result.warnings || [];

    if (isHeuristic && !passed && scoreClears && unconditionalIssues.length === 0) {
      passed = true;
      warnings = [...warnings, ...reclassifiableIssues];
      issues = [];
    }

    return registry.normalizeResult({ passed, score: result.score, max_score: 100, issues, warnings, details: result.details });
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
      // SD-PRD-USER-STORIES-TABLE-ORCH-001: Distinguish missing vs misplaced stories
      const jsonbLocations = [];
      if (prd?.content?.user_stories?.length > 0) jsonbLocations.push('prd.content.user_stories');
      if (prd?.metadata?.user_stories?.length > 0) jsonbLocations.push('prd.metadata.user_stories');
      if (prd?.content?.stories?.length > 0) jsonbLocations.push('prd.content.stories');

      if (jsonbLocations.length > 0) {
        return {
          passed: false, score: 0, max_score: 100,
          issues: [
            `User stories found in PRD JSONB (${jsonbLocations.join(', ')}) but NOT in user_stories table.`,
            'REMEDIATION: Run autoTriggerStories() or use add-prd-to-database.js (canonical path) to populate user_stories table.',
            'Stories must be in the user_stories table with prd_id and sd_id foreign keys.'
          ]
        };
      }

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

    // Orchestrator children are tactical decompositions — DESIGN sub-agent
    // is run at the orchestrator level, not per-child.
    if (sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: ['DESIGN sub-agent skipped for orchestrator child SD']
      };
    }

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

    // Orchestrator children — DATABASE sub-agent runs at orchestrator level
    if (sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: ['DATABASE sub-agent skipped for orchestrator child SD']
      };
    }

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

  // SD-LEO-FIX-REMOVE-RUBBER-STAMP-001: Removed fileScopeValidation and executionPlanValidation.
  // These gates can never meaningfully evaluate because the required data fields (file_scope,
  // execution_plan) are never populated by any PRD creation path. They always returned
  // score 70-100 with advisory warnings, inflating aggregate scores without adding value.

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

  // SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001: Wireframe artifact validation
  registry.register('wireframeArtifactValidation', async (context) => {
    const result = await validateWireframeArtifact(context);
    return registry.normalizeResult(result);
  }, 'Wireframe artifact validation for UI-producing SDs');
}
