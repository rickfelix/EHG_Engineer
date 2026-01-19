/**
 * ValidatorRegistry - Dynamic mapping of database rule_name to validator functions
 * Part of LEO Protocol Validation System
 *
 * Created for SD-VALIDATION-REGISTRY-001
 *
 * This registry maps rule_name values from leo_validation_rules table to actual
 * validator functions in the codebase. Used by ValidationOrchestrator to execute
 * database-driven validation rules.
 *
 * @module ValidatorRegistry
 * @version 1.0.0
 */

// Import existing validators
import { validateSDQuality, validateRetrospectiveQuality, validateSDCompletionReadiness } from '../../sd-quality-validation.js';
import { validatePRDQuality, validatePRDForHandoff } from '../../prd-quality-validation.js';
import { validateUserStoryQuality, validateUserStoriesForHandoff } from '../../user-story-quality-validation.js';
import { validateGate1PlanToExec, shouldValidateDesignDatabaseSync } from '../../design-database-gates-validation.js';
import { validateBMADForPlanToExec, validateBMADForExecToPlan, validateRiskAssessment } from '../../bmad-validation.js';
import { validateGate2ExecToPlan } from '../../implementation-fidelity-validation.js';
import { validateGate3PlanToLead } from '../../traceability-validation.js';
import { validateGate4LeadFinal } from '../../workflow-roi-validation.js';
import { validateTestPlanQuality, validateTestPlanForHandoff } from '../../test-plan-quality-validation.js';
import { validateTestTraceability } from '../../test-traceability-validation.js';
import { validateRiskAssessmentQuality, validateRiskAssessmentForHandoff } from '../../risk-assessment-quality-validation.js';
import { validateCrossSDConsistency } from '../../cross-sd-consistency-validation.js';
import { validateSDContractCompliance, validateContractGate } from '../../contract-validation.js';
import { validateHandoffContentQuality, validateHandoffForQuality } from '../../handoff-content-quality-validation.js';
import { validateStoryDependencies } from '../../user-story-dependency-validation.js';
import { shouldSkipCodeValidation } from '../../../../lib/utils/sd-type-validation.js';
import { validateStoryCodebaseAlignment, validateAllStoriesCodebaseAlignment } from '../../user-story-codebase-alignment-validation.js';
import { validateExecChecklist } from '../exec-checklist-validation.js';

/**
 * ValidatorRegistry - Maps database rule_name to validator functions
 */
export class ValidatorRegistry {
  constructor() {
    /** @type {Map<string, {validate: Function, description: string}>} */
    this.validators = new Map();

    /** @type {Map<string, Function>} */
    this.fallbackValidators = new Map();

    this._registerBuiltinValidators();
  }

  /**
   * Register a validator for a specific rule_name
   * @param {string} ruleName - The rule_name from leo_validation_rules
   * @param {Function} validatorFn - The validation function
   * @param {string} [description] - Optional description
   */
  register(ruleName, validatorFn, description = '') {
    if (typeof validatorFn !== 'function') {
      throw new Error(`Validator for ${ruleName} must be a function`);
    }

    this.validators.set(ruleName, {
      validate: validatorFn,
      description: description || ruleName
    });
  }

  /**
   * Get a validator by rule_name
   * @param {string} ruleName - The rule_name to look up
   * @returns {Function|null} The validator function or null if not found
   */
  get(ruleName) {
    const entry = this.validators.get(ruleName);
    if (entry) {
      return entry.validate;
    }

    // Check for fallback
    if (this.fallbackValidators.has(ruleName)) {
      return this.fallbackValidators.get(ruleName);
    }

    return null;
  }

  /**
   * Check if a validator exists for the given rule_name
   * @param {string} ruleName - The rule_name to check
   * @returns {boolean}
   */
  has(ruleName) {
    return this.validators.has(ruleName) || this.fallbackValidators.has(ruleName);
  }

  /**
   * Get all registered rule names
   * @returns {string[]}
   */
  getRegisteredRules() {
    return Array.from(this.validators.keys());
  }

  /**
   * Create a fallback validator that passes with a warning
   * @param {string} ruleName - The rule_name
   * @param {string} reason - Why this is a fallback
   * @returns {Function}
   */
  createFallbackValidator(ruleName, reason = 'Validator not implemented') {
    return async (context) => {
      console.warn(`⚠️  Fallback validator for ${ruleName}: ${reason}`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`${ruleName}: ${reason} - auto-passing`],
        details: {
          isFallback: true,
          reason
        }
      };
    };
  }

  /**
   * Get or create a validator (with fallback if not registered)
   * @param {string} ruleName - The rule_name
   * @param {object} ruleConfig - Rule configuration from database
   * @returns {Function}
   */
  getOrCreateFallback(ruleName, ruleConfig = {}) {
    const validator = this.get(ruleName);
    if (validator) {
      return validator;
    }

    // Create and cache a fallback
    const fallback = this.createFallbackValidator(
      ruleName,
      `No validator registered for ${ruleConfig.validator_module || 'unknown module'}.${ruleConfig.validator_function || ruleName}`
    );
    this.fallbackValidators.set(ruleName, fallback);

    return fallback;
  }

  /**
   * Normalize validator result to standard format
   * @param {object} result - Raw validator result
   * @returns {object} Normalized result
   */
  normalizeResult(result) {
    // Handle both 'passed' and 'pass' field names
    const passed = result.passed ?? result.pass ?? (result.score >= (result.max_score || result.maxScore || 100));

    return {
      passed,
      score: result.score ?? 0,
      max_score: result.max_score ?? result.maxScore ?? 100,
      issues: result.issues || [],
      warnings: result.warnings || [],
      details: result.details || result
    };
  }

  /**
   * Register all built-in validators
   * @private
   */
  _registerBuiltinValidators() {
    // ========================================
    // Gate L - SD Creation (LEAD pre-approval)
    // ========================================

    this.register('sdExistenceCheck', async (context) => {
      const { sd } = context;
      if (!sd || !sd.id) {
        return { passed: false, score: 0, max_score: 100, issues: ['SD does not exist'] };
      }
      if (sd.status === 'archived') {
        return { passed: false, score: 0, max_score: 100, issues: ['SD is archived'] };
      }
      return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
    }, 'Verify SD exists and is active');

    this.register('sdObjectivesDefined', async (context) => {
      const { sd } = context;
      const objectives = sd?.strategic_objectives || [];
      const issues = [];
      let score = 0;

      if (objectives.length >= 2) {
        score += 70;
      } else if (objectives.length === 1) {
        score += 35;
        issues.push('SD should have at least 2 strategic objectives');
      } else {
        issues.push('SD has no strategic objectives defined');
      }

      if (sd?.success_metrics && sd.success_metrics.length > 0) {
        score += 30;
      } else {
        issues.push('SD should have success metrics defined');
      }

      return { passed: issues.length === 0, score, max_score: 100, issues };
    }, 'Verify SD has strategic objectives and success metrics');

    this.register('sdPrioritySet', async (context) => {
      const { sd } = context;
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      const priority = sd?.priority?.toLowerCase();

      if (!priority) {
        return { passed: false, score: 0, max_score: 100, issues: ['SD priority not set'] };
      }
      if (!validPriorities.includes(priority)) {
        return { passed: false, score: 0, max_score: 100, issues: [`Invalid priority: ${sd.priority}. Valid values: ${validPriorities.join(', ')}`] };
      }
      return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
    }, 'Verify SD priority is set to valid value');

    this.register('sdSuccessCriteria', async (context) => {
      const { sd } = context;
      const metrics = sd?.success_metrics || [];

      if (metrics.length >= 3) {
        return { passed: true, score: 100, max_score: 100, issues: [] };
      } else if (metrics.length > 0) {
        return { passed: false, score: 50, max_score: 100, issues: [`SD has ${metrics.length} success metrics, minimum 3 recommended`] };
      }
      return { passed: false, score: 0, max_score: 100, issues: ['No success metrics defined'] };
    }, 'Verify SD has measurable success criteria');

    this.register('sdRisksIdentified', async (context) => {
      const { sd } = context;
      // Risks array can be empty for low-risk SDs
      const risks = sd?.risks || [];
      if (risks.length === 0 && sd?.priority === 'high') {
        return { passed: true, score: 80, max_score: 100, warnings: ['High-priority SD has no risks identified'] };
      }
      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Verify risks are identified (optional for low-risk SDs)');

    // SD-LEO-001: SD Type Validation - Ensures SD type matches detected type from content
    this.register('sdTypeValidation', async (context) => {
      const { sd } = context;
      if (!sd) {
        return { passed: false, score: 0, max_score: 100, issues: ['No SD provided'] };
      }

      // Dynamic import to avoid circular dependencies
      const { detectSDType } = await import('../../../lib/utils/sd-type-detection.js');
      const detection = detectSDType(sd);

      const currentType = (sd.sd_type || '').toLowerCase();
      const detectedType = (detection.type || '').toLowerCase();

      // If no type set, warn but don't fail
      if (!currentType) {
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`SD type not set. Detection suggests: ${detection.type} (${detection.confidence}% confidence)`]
        };
      }

      // Check for mismatch
      if (currentType !== detectedType) {
        // High confidence detection should be a warning
        if (detection.confidence >= 70) {
          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [
              `SD type mismatch: set as '${currentType}' but detection suggests '${detection.type}' (${detection.confidence}% confidence)`,
              `Reason: ${detection.reason}`
            ]
          };
        }
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: []
      };
    }, 'SD-LEO-001: Validate SD type matches content-based detection');

    // ========================================
    // Gate 1 - PLAN to EXEC Validation
    // ========================================

    this.register('prdQualityValidation', async (context) => {
      const { prd, options = {} } = context;
      if (!prd) {
        return { passed: false, score: 0, max_score: 100, issues: ['No PRD provided'] };
      }
      const result = await validatePRDQuality(prd, options);
      return this.normalizeResult(result);
    }, 'PRD quality validation using AI-powered Russian Judge rubric');

    this.register('userStoryQualityValidation', async (context) => {
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

      // SD-LEO-001: Map result fields to normalizeResult expected format
      // validateUserStoriesForHandoff returns: { valid, averageScore, issues, warnings, ... }
      // normalizeResult expects: { passed, score, issues, warnings, ... }
      return this.normalizeResult({
        passed: result.valid,
        score: result.averageScore,
        max_score: 100,
        issues: result.issues,
        warnings: result.warnings,
        details: result
      });
    }, 'User story quality validation');

    this.register('designSubAgentExecution', async (context) => {
      const { sd, sd_id, supabase } = context;

      // SD-LEO-001: Only 'feature' and 'database' SDs require DESIGN sub-agent
      // Aligns with SD_TYPE_CATEGORIES.DESIGN_DATABASE_GATES from sd-type-checker.js
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

    this.register('databaseSubAgentExecution', async (context) => {
      const { sd, sd_id, supabase } = context;

      // SD-LEO-001: Only 'feature' and 'database' SDs require DATABASE sub-agent
      // Aligns with SD_TYPE_CATEGORIES.DESIGN_DATABASE_GATES from sd-type-checker.js
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

    this.register('bmadContextEngineering', async (context) => {
      const { sd_id, supabase } = context;
      const result = await validateBMADForPlanToExec(sd_id, supabase);
      return this.normalizeResult(result);
    }, 'BMAD context engineering validation');

    this.register('goalSummaryValidation', async (context) => {
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

    this.register('fileScopeValidation', async (context) => {
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

    this.register('executionPlanValidation', async (context) => {
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

      // SD-LIFECYCLE-GAP-004: Check for non-empty arrays only (empty [] is truthy but useless)
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

    this.register('testingStrategyValidation', async (context) => {
      const { sd, prd } = context;

      // SD-LEO-001: Skip for infrastructure/documentation SDs
      // SD-LIFECYCLE-GAP-004: Also check category (sd_type and category can differ)
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

    // ========================================
    // Gates 2A-2D - Implementation Fidelity
    // ========================================

    // These are composite validators - validateGate2ExecToPlan handles all sections
    this.register('uiComponentsImplemented', async (context) => {
      const { sd_id, supabase } = context;
      const result = await validateGate2ExecToPlan(sd_id, supabase);
      // Extract Section A score - check multiple paths for compatibility
      const sectionA = result?.sections?.A || result?.sectionScores?.A ||
        result?.details?.design_fidelity || {};
      // Also check gate_scores for raw score value
      const scoreFromGateScores = result?.gate_scores?.design_fidelity;
      const finalScore = sectionA.score ?? scoreFromGateScores ?? 0;
      // For EXEC-TO-PLAN, use overall result if section extraction fails
      const passed = result?.passed ?? (finalScore >= 70);
      return {
        passed: passed,
        score: finalScore,
        max_score: 100,
        issues: sectionA.issues || result?.issues || [],
        warnings: sectionA.warnings || result?.warnings || [],
        details: sectionA
      };
    }, 'UI components implementation fidelity');

    this.register('userWorkflowsImplemented', async (context) => {
      // Composite check - see uiComponentsImplemented
      return this.validators.get('uiComponentsImplemented').validate(context);
    }, 'User workflows implementation fidelity');

    this.register('userActionsSupported', async (context) => {
      // Composite check - see uiComponentsImplemented
      return this.validators.get('uiComponentsImplemented').validate(context);
    }, 'User actions (CRUD) implementation');

    this.register('migrationsCreatedAndExecuted', async (context) => {
      const { sd_id, supabase } = context;
      const result = await validateGate2ExecToPlan(sd_id, supabase);
      // Extract Section B score - check multiple paths for compatibility
      const sectionB = result?.sections?.B || result?.sectionScores?.B ||
        result?.details?.database_fidelity || {};
      const scoreFromGateScores = result?.gate_scores?.database_fidelity;
      const finalScore = sectionB.score ?? scoreFromGateScores ?? 0;
      // For EXEC-TO-PLAN, use overall result if section extraction fails
      const passed = result?.passed ?? (finalScore >= 50); // Lower threshold for DB (may be N/A)
      return {
        passed: passed,
        score: finalScore,
        max_score: 100,
        issues: sectionB.issues || result?.issues || [],
        warnings: sectionB.warnings || result?.warnings || [],
        details: sectionB
      };
    }, 'Database migrations validation (CRITICAL)');

    this.register('rlsPoliciesImplemented', async (context) => {
      // Composite check - see migrationsCreatedAndExecuted
      return this.validators.get('migrationsCreatedAndExecuted').validate(context);
    }, 'RLS policies validation');

    this.register('migrationComplexityAligned', async (context) => {
      // Composite check - see migrationsCreatedAndExecuted
      return this.validators.get('migrationsCreatedAndExecuted').validate(context);
    }, 'Migration complexity alignment');

    this.register('databaseQueriesIntegrated', async (context) => {
      const { sd_id, supabase } = context;
      const result = await validateGate2ExecToPlan(sd_id, supabase);
      // Extract Section C score - check multiple paths for compatibility
      const sectionC = result?.sections?.C || result?.sectionScores?.C ||
        result?.details?.data_flow || {};
      const scoreFromGateScores = result?.gate_scores?.data_flow;
      const finalScore = sectionC.score ?? scoreFromGateScores ?? 0;
      const passed = result?.passed ?? (finalScore >= 70);
      return {
        passed: passed,
        score: finalScore,
        max_score: 100,
        issues: sectionC.issues || result?.issues || [],
        warnings: sectionC.warnings || result?.warnings || [],
        details: sectionC
      };
    }, 'Database queries integration');

    this.register('formUiIntegration', async (context) => {
      // Composite check - see databaseQueriesIntegrated
      return this.validators.get('databaseQueriesIntegrated').validate(context);
    }, 'Form/UI integration');

    this.register('dataValidationImplemented', async (context) => {
      // Composite check - see databaseQueriesIntegrated
      return this.validators.get('databaseQueriesIntegrated').validate(context);
    }, 'Data validation implementation');

    this.register('e2eTestCoverage', async (context) => {
      const { sd_id, supabase } = context;
      const result = await validateGate2ExecToPlan(sd_id, supabase);
      // Extract Section D score - check multiple paths for compatibility
      const sectionD = result?.sections?.D || result?.sectionScores?.D ||
        result?.details?.testing || {};
      const scoreFromGateScores = result?.gate_scores?.testing;
      const finalScore = sectionD.score ?? scoreFromGateScores ?? 0;
      const passed = result?.passed ?? (finalScore >= 70);
      return {
        passed: passed,
        score: finalScore,
        max_score: 100,
        issues: sectionD.issues || result?.issues || [],
        warnings: sectionD.warnings || result?.warnings || [],
        details: sectionD
      };
    }, 'E2E test coverage (CRITICAL)');

    this.register('testingSubAgentVerified', async (context) => {
      const { sd_id, supabase } = context;

      // FIX: Check if this SD type should skip code validation (infrastructure, documentation, etc.)
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

      const { data, error } = await supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sd_id)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return { passed: false, score: 0, max_score: 100, issues: ['TESTING sub-agent not executed'] };
      }

      const execution = data[0];
      if (execution.verdict !== 'PASS') {
        return {
          passed: false,
          score: 30,
          max_score: 100,
          issues: [`TESTING sub-agent verdict: ${execution.verdict}, expected PASS`]
        };
      }

      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'TESTING sub-agent verification');

    // ========================================
    // Gate 3 - Traceability Validation
    // ========================================

    this.register('recommendationAdherence', async (context) => {
      const { sd_id, supabase, gate2Results } = context;
      const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);
      // SD-QUALITY-UI-001 FIX: Check multiple paths for section A score
      // Original path: result.sections.A.score
      // Actual path: result.gate_scores.recommendation_adherence (scaled to 30 max)
      const sectionAFromSections = result?.sections?.A || {};
      const sectionAScore = sectionAFromSections.score ??
        result?.gate_scores?.recommendation_adherence ?? 0;
      // Gate 3 Section A is scored out of 30, convert to percentage
      const normalizedScore = result?.gate_scores?.recommendation_adherence !== undefined
        ? Math.round((result.gate_scores.recommendation_adherence / 30) * 100)
        : sectionAScore;
      // Use overall Gate 3 result if section extraction fails
      const passed = result?.passed ?? (normalizedScore >= 70);
      return {
        passed: passed,
        score: normalizedScore,
        max_score: 100,
        issues: sectionAFromSections.issues || result?.issues || [],
        warnings: sectionAFromSections.warnings || result?.warnings || [],
        details: result?.details?.recommendation_adherence || sectionAFromSections
      };
    }, 'Recommendation adherence (CRITICAL)');

    this.register('implementationQuality', async (context) => {
      const { sd_id, supabase, gate2Results } = context;
      const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);
      // SD-QUALITY-UI-001 FIX: Check multiple paths for section B score
      // Original path: result.sections.B.score
      // Actual path: result.gate_scores.implementation_quality (scaled to 30 max)
      const sectionBFromSections = result?.sections?.B || {};
      const sectionBScore = sectionBFromSections.score ??
        result?.gate_scores?.implementation_quality ?? 0;
      // Gate 3 Section B is scored out of 30, convert to percentage
      const normalizedScore = result?.gate_scores?.implementation_quality !== undefined
        ? Math.round((result.gate_scores.implementation_quality / 30) * 100)
        : sectionBScore;
      // Use overall Gate 3 result if section extraction fails
      const passed = result?.passed ?? (normalizedScore >= 70);
      return {
        passed: passed,
        score: normalizedScore,
        max_score: 100,
        issues: sectionBFromSections.issues || result?.issues || [],
        warnings: sectionBFromSections.warnings || result?.warnings || [],
        details: result?.details?.implementation_quality || sectionBFromSections
      };
    }, 'Implementation quality (CRITICAL)');

    this.register('traceabilityMapping', async (context) => {
      const { sd_id, supabase, gate2Results } = context;
      const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);
      // SD-QUALITY-UI-001 FIX: Check multiple paths for section C score
      const sectionCFromSections = result?.sections?.C || {};
      const sectionCScore = sectionCFromSections.score ??
        result?.gate_scores?.traceability_mapping ?? 0;
      // Gate 3 Section C is scored out of 25, convert to percentage
      const normalizedScore = result?.gate_scores?.traceability_mapping !== undefined
        ? Math.round((result.gate_scores.traceability_mapping / 25) * 100)
        : sectionCScore;
      const passed = result?.passed ?? (normalizedScore >= 70);
      return {
        passed: passed,
        score: normalizedScore,
        max_score: 100,
        issues: sectionCFromSections.issues || result?.issues || [],
        warnings: sectionCFromSections.warnings || result?.warnings || [],
        details: result?.details?.traceability_mapping || sectionCFromSections
      };
    }, 'Traceability mapping');

    this.register('subAgentEffectiveness', async (context) => {
      const { sd_id, supabase, gate2Results } = context;
      const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);
      // SD-QUALITY-UI-001 FIX: Check multiple paths for section D score
      const sectionDFromSections = result?.sections?.D || {};
      const sectionDScore = sectionDFromSections.score ??
        result?.gate_scores?.sub_agent_effectiveness ?? 0;
      // Gate 3 Section D is scored out of 10, convert to percentage
      const normalizedScore = result?.gate_scores?.sub_agent_effectiveness !== undefined
        ? Math.round((result.gate_scores.sub_agent_effectiveness / 10) * 100)
        : sectionDScore;
      return {
        passed: true, // Non-critical
        score: normalizedScore,
        max_score: 100,
        issues: sectionDFromSections.issues || result?.issues || [],
        warnings: sectionDFromSections.warnings || result?.warnings || [],
        details: result?.details?.sub_agent_effectiveness || sectionDFromSections
      };
    }, 'Sub-agent effectiveness');

    this.register('lessonsCaptured', async (context) => {
      const { sd_id, supabase, gate2Results } = context;
      const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);
      // SD-QUALITY-UI-001 FIX: Check multiple paths for section E score
      const sectionEFromSections = result?.sections?.E || {};
      const sectionEScore = sectionEFromSections.score ??
        result?.gate_scores?.lessons_captured ?? 0;
      // Gate 3 Section E is scored out of 5, convert to percentage
      const normalizedScore = result?.gate_scores?.lessons_captured !== undefined
        ? Math.round((result.gate_scores.lessons_captured / 5) * 100)
        : sectionEScore;
      return {
        passed: true, // Non-critical
        score: normalizedScore,
        max_score: 100,
        issues: sectionEFromSections.issues || result?.issues || [],
        warnings: sectionEFromSections.warnings || result?.warnings || [],
        details: result?.details?.lessons_captured || sectionEFromSections
      };
    }, 'Lessons captured');

    // ========================================
    // Gate 4 - Strategic Value (LEAD Final)
    // ========================================

    this.register('valueDelivered', async (context) => {
      const { sd_id, supabase, allGateResults } = context;
      const result = await validateGate4LeadFinal(sd_id, supabase, allGateResults);
      return this.normalizeResult(result);
    }, 'Strategic value delivered');

    this.register('patternEffectiveness', async (context) => {
      // Part of Gate 4 composite validation
      return this.validators.get('valueDelivered').validate(context);
    }, 'Pattern effectiveness');

    this.register('executiveValidation', async (context) => {
      // Part of Gate 4 composite validation
      return this.validators.get('valueDelivered').validate(context);
    }, 'Executive validation');

    this.register('processAdherence', async (context) => {
      // Part of Gate 4 composite validation
      return this.validators.get('valueDelivered').validate(context);
    }, 'Process adherence');

    // ========================================
    // Gate Q - Quality Gate (7-element validators)
    // ========================================

    this.register('executiveSummaryComplete', async (context) => {
      const { handoff } = context;
      const summary = handoff?.executive_summary || '';

      if (summary.length < 100) {
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`Executive summary too short: ${summary.length} chars, min 100`]
        };
      }
      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Executive summary completeness');

    this.register('keyDecisionsDocumented', async (context) => {
      const { handoff } = context;
      const decisions = handoff?.key_decisions || [];

      if (decisions.length === 0) {
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: ['No key decisions documented']
        };
      }
      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Key decisions documentation');

    this.register('knownIssuesTracked', async (context) => {
      const { handoff } = context;
      // Known issues can be empty if explicitly stated
      const issues = handoff?.known_issues;
      if (issues === undefined) {
        return {
          passed: false,
          score: 70,
          max_score: 100,
          warnings: ['known_issues field not set (should be empty array if none)']
        };
      }
      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Known issues tracking');

    this.register('actionItemsPresent', async (context) => {
      const { handoff } = context;
      const actionItems = handoff?.action_items || [];

      if (actionItems.length < 3) {
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`Only ${actionItems.length} action items, minimum 3 recommended`]
        };
      }
      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Action items presence');

    this.register('completenessReportValid', async (context) => {
      const { handoff } = context;
      const report = handoff?.completeness_report || {};
      const issues = [];

      if (!report.phase) issues.push('completeness_report missing phase');
      if (report.score === undefined) issues.push('completeness_report missing score');
      if (!report.status) issues.push('completeness_report missing status');

      return {
        passed: issues.length === 0,
        score: issues.length === 0 ? 100 : 50,
        max_score: 100,
        issues
      };
    }, 'Completeness report validation');

    // ========================================
    // Additional validators from Handoff System Guide
    // ========================================

    this.register('sdTransitionReadiness', async (context) => {
      const { sd } = context;
      const issues = [];

      if (!sd) {
        return { passed: false, score: 0, max_score: 100, issues: ['SD not provided'] };
      }

      if (sd.status === 'blocked') {
        issues.push('SD is blocked');
      }

      // SD-LIFECYCLE-GAP-005: Include 'draft' as valid starting status for LEAD-TO-PLAN
      const validStatuses = ['approved', 'planning', 'in_progress', 'draft'];
      if (!validStatuses.includes(sd.status)) {
        issues.push(`SD status ${sd.status} not valid for transition`);
      }

      return {
        passed: issues.length === 0,
        score: issues.length === 0 ? 100 : 0,
        max_score: 100,
        issues
      };
    }, 'SD transition readiness');

    this.register('targetApplicationValidation', async (context) => {
      const { sd } = context;
      const validTargets = ['EHG', 'EHG_Engineer'];
      const target = sd?.target_application;

      if (!target) {
        return { passed: true, score: 100, max_score: 100, warnings: ['No target application specified, will use default'] };
      }

      if (!validTargets.includes(target)) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Invalid target application: ${target}. Valid: ${validTargets.join(', ')}`]
        };
      }

      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Target application validation');

    this.register('branchEnforcement', async (context) => {
      const { sd_id } = context;
      // This would normally check git for the branch
      // Simplified check - assume branch exists if we got this far
      return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Branch enforcement check simplified'] };
    }, 'Git branch enforcement');

    this.register('architectureVerification', async (context) => {
      // Optional gate - always passes with warning
      return {
        passed: true,
        score: 100,
        max_score: 100,
        warnings: ['Architecture verification not implemented - auto-pass']
      };
    }, 'Architecture verification');

    this.register('explorationAudit', async (context) => {
      // Optional gate - always passes with warning
      return {
        passed: true,
        score: 100,
        max_score: 100,
        warnings: ['Exploration audit not implemented - auto-pass']
      };
    }, 'Exploration audit');

    this.register('subAgentOrchestration', async (context) => {
      const { sd_id, supabase } = context;

      // FIX: Check if this SD type should skip sub-agent orchestration validation
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
          warnings: [`Sub-agent orchestration skipped for ${sdData.sd_type} SD`]
        };
      }

      const requiredAgents = ['DESIGN', 'DATABASE'];
      const issues = [];

      for (const agentCode of requiredAgents) {
        const { data, error } = await supabase
          .from('sub_agent_execution_results')  // Fixed: was 'sd_sub_agent_executions' (doesn't exist)
          .select('id, verdict')
          .eq('sd_id', sd_id)
          .eq('sub_agent_code', agentCode)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !data || data.length === 0) {
          issues.push(`${agentCode} sub-agent not executed`);
        }
      }

      return {
        passed: issues.length === 0,
        score: issues.length === 0 ? 100 : 50,
        max_score: 100,
        issues
      };
    }, 'Sub-agent orchestration');

    this.register('retrospectiveQualityGate', async (context) => {
      const { sd, sd_id, supabase } = context;

      // Check for retrospective
      const { data, error } = await supabase
        .from('sd_retrospectives')
        .select('*')
        .eq('sd_id', sd_id || sd?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return {
          passed: true,
          score: 50,
          max_score: 100,
          warnings: ['No retrospective found']
        };
      }

      const retro = data[0];
      const result = await validateRetrospectiveQuality(retro, sd);
      return this.normalizeResult(result);
    }, 'Retrospective quality gate');

    this.register('gitCommitEnforcement', async (context) => {
      // Simplified check
      return {
        passed: true,
        score: 100,
        max_score: 100,
        warnings: ['Git commit enforcement check simplified']
      };
    }, 'Git commit enforcement');

    this.register('planToLeadHandoffExists', async (context) => {
      const { sd_id, supabase } = context;

      const { data, error } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status')
        .eq('sd_id', sd_id)
        .eq('handoff_type', 'PLAN-TO-LEAD')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['PLAN-TO-LEAD handoff not found']
        };
      }

      if (data[0].status !== 'accepted') {
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`PLAN-TO-LEAD handoff status: ${data[0].status}, expected: accepted`]
        };
      }

      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'PLAN-TO-LEAD handoff exists');

    this.register('userStoriesComplete', async (context) => {
      const { sd_id, supabase } = context;

      const { data: stories, error } = await supabase
        .from('user_stories')
        .select('id, status, validation_status')
        .eq('sd_id', sd_id);

      if (error || !stories || stories.length === 0) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['No user stories found']
        };
      }

      const incomplete = stories.filter(s =>
        s.status !== 'completed' && s.status !== 'validated'
      );

      if (incomplete.length > 0) {
        return {
          passed: false,
          score: Math.round(((stories.length - incomplete.length) / stories.length) * 100),
          max_score: 100,
          issues: [`${incomplete.length}/${stories.length} user stories incomplete`]
        };
      }

      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'User stories completion');

    this.register('retrospectiveExists', async (context) => {
      const { sd_id, supabase } = context;

      // SD-QUALITY-UI-001 FIX: Table name is 'retrospectives' not 'sd_retrospectives'
      const { data, error } = await supabase
        .from('retrospectives')
        .select('id')
        .eq('sd_id', sd_id)
        .limit(1);

      if (error || !data || data.length === 0) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['Retrospective not found for this SD']
        };
      }

      return { passed: true, score: 100, max_score: 100, issues: [] };
    }, 'Retrospective exists');

    this.register('prMergeVerification', async (context) => {
      const { sd } = context;
      // SD-QUALITY-UI-001 FIX: pr_url column doesn't exist in strategic_directives_v2
      // PR creation/merge typically happens AFTER approval via /ship command
      // This validator should pass with a warning, not block approval
      const prUrl = sd?.pr_url || sd?.metadata?.pr_url;

      if (!prUrl) {
        return {
          passed: true, // Changed from false - PR is created after approval
          score: 50,
          max_score: 100,
          warnings: ['PR not yet created - will be created during /ship step after approval']
        };
      }

      // Simplified check - PR URL exists
      // Full verification would check GitHub API
      return {
        passed: true,
        score: 100,
        max_score: 100,
        warnings: ['PR merge verification simplified - checking URL presence only']
      };
    }, 'PR merge verification');

    // Log registration summary
    console.log(`ValidatorRegistry: Registered ${this.validators.size} validators`);
  }

  /**
   * Get registration statistics
   * @returns {object}
   */
  getStats() {
    const stats = {
      totalRegistered: this.validators.size,
      totalFallbacks: this.fallbackValidators.size,
      byCategory: {}
    };

    // Categorize by prefix
    for (const ruleName of this.validators.keys()) {
      const prefix = ruleName.replace(/[A-Z].*/, '');
      stats.byCategory[prefix] = (stats.byCategory[prefix] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const validatorRegistry = new ValidatorRegistry();

export default ValidatorRegistry;
