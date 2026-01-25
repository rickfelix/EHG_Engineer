/**
 * Child SD Template Generator
 * LEO Protocol v4.4 - Shift-Left Validation
 *
 * PURPOSE: Auto-populates child SDs from parent SD template
 * Uses AI inference to generate context-appropriate strategic fields.
 *
 * ROOT CAUSE FIX: SD-STAGE-ARCH-001-P4 discovered child SDs were created
 * without strategic fields. This module now uses LLM to generate
 * appropriate fields based on the child's specific context.
 *
 * Usage:
 *   import { generateChildSD, generateChildSDAsync } from './modules/child-sd-template.js';
 *   const childData = await generateChildSDAsync(parentSD, childConfig); // With AI
 *   const childData = generateChildSD(parentSD, childConfig); // Sync fallback
 *
 * @module child-sd-template
 * @version 2.0.0
 */

import { validateSDCreation } from './sd-creation-validator.js';
import {
  isLLMAvailable,
  generateStrategicFieldsWithLLM
} from './child-sd-llm-service.mjs';

/**
 * Default child SD template structure
 * All children must have these fields populated
 */
export const CHILD_SD_TEMPLATE = {
  // Required strategic fields (inherited or generated)
  success_metrics: [],
  key_principles: [],
  strategic_objectives: [],
  success_criteria: [],
  risks: [],

  // Required core fields
  title: '',
  description: '',
  scope: '',
  rationale: '',
  category: 'feature',
  priority: 'high',
  sd_type: 'implementation', // Default, should be inferred via inferSDType()

  // Child-specific fields
  parent_sd_id: null,
  phase_number: null,
  dependency_requirements: []
};

/**
 * SD Type Inference Keywords
 * Used to automatically determine sd_type from title/scope
 */
const SD_TYPE_KEYWORDS = {
  documentation: [
    'research', 'analysis', 'mapping', 'documentation', 'docs', 'audit',
    'investigation', 'discovery', 'assessment', 'review', 'study'
  ],
  infrastructure: [
    'migration', 'infrastructure', 'setup', 'configuration', 'deployment',
    'pipeline', 'ci/cd', 'devops', 'platform', 'tooling'
  ],
  feature: [
    'ui', 'ux', 'user interface', 'dashboard', 'form', 'page', 'component',
    'button', 'modal', 'wizard', 'experience', 'intake', 'flow'
  ],
  testing: [
    'e2e', 'end-to-end', 'test', 'testing', 'qa', 'quality', 'validation',
    'verification', 'regression', 'playwright'
  ],
  refactor: [
    'refactor', 'restructure', 'cleanup', 'optimize', 'consolidate',
    'modernize', 'simplify'
  ],
  bugfix: [
    'fix', 'bug', 'issue', 'hotfix', 'patch', 'repair', 'resolve'
  ]
};

/**
 * Infer SD type from title and scope keywords
 * Prevents incorrect type assignments that cause workflow issues
 *
 * @param {string} title - SD title
 * @param {string} scope - SD scope
 * @param {string} description - SD description (optional)
 * @returns {Object} { sdType: string, confidence: number, matchedKeywords: string[] }
 */
export function inferSDType(title, scope = '', description = '') {
  const textToAnalyze = `${title} ${scope} ${description}`.toLowerCase();
  const scores = {};
  const matches = {};

  for (const [sdType, keywords] of Object.entries(SD_TYPE_KEYWORDS)) {
    const matched = keywords.filter(kw => textToAnalyze.includes(kw.toLowerCase()));
    scores[sdType] = matched.length;
    matches[sdType] = matched;
  }

  // Find highest scoring type
  const sortedTypes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sortedTypes[0];
  const [secondType, secondScore] = sortedTypes[1] || ['none', 0];

  // Calculate confidence (difference between top two scores)
  const confidence = topScore > 0 ? Math.min(95, 60 + (topScore - secondScore) * 15) : 50;

  return {
    sdType: topScore > 0 ? topType : 'implementation', // Default if no keywords match
    confidence,
    matchedKeywords: matches[topType] || [],
    allScores: scores
  };
}

/**
 * Inherit strategic fields from parent SD
 * Transforms parent fields to be child-appropriate
 *
 * @param {Object} parentSD - Parent Strategic Directive
 * @param {Object} childContext - Child-specific context
 * @returns {Object} Inherited strategic fields
 */
export function inheritStrategicFields(parentSD, childContext = {}) {
  const { phaseNumber, phaseTitle, phaseObjective } = childContext;

  // Start with parent's strategic fields
  const inherited = {};

  // Inherit success_metrics - add phase-specific context
  if (parentSD.success_metrics?.length > 0) {
    inherited.success_metrics = parentSD.success_metrics.map(metric => ({
      metric: metric.metric,
      target: metric.target,
      unit: metric.unit || 'percent',
      phase_relevance: `P${phaseNumber}: ${phaseTitle}`
    }));
  } else {
    // Generate minimal metrics if parent has none
    inherited.success_metrics = [
      { metric: `P${phaseNumber} completion`, target: 100, unit: 'percent' },
      { metric: 'Quality gate pass rate', target: 85, unit: 'percent' },
      { metric: 'Regressions introduced', target: 0, unit: 'count' }
    ];
  }

  // Inherit key_principles - contextualize for phase
  if (parentSD.key_principles?.length > 0) {
    inherited.key_principles = parentSD.key_principles.map(p => {
      if (typeof p === 'string') {
        return { principle: p, description: `Applied in ${phaseTitle}` };
      }
      return {
        principle: p.principle,
        description: p.description || 'Inherited from parent SD'
      };
    });
  } else {
    inherited.key_principles = [
      { principle: 'Phase Isolation', description: 'Changes confined to phase scope' },
      { principle: 'Backward Compatibility', description: 'No breaking changes to existing functionality' }
    ];
  }

  // Inherit strategic_objectives - scope to phase
  if (parentSD.strategic_objectives?.length > 0) {
    inherited.strategic_objectives = parentSD.strategic_objectives
      .slice(0, 3) // Take top 3 from parent
      .map(obj => {
        if (typeof obj === 'string') {
          return { objective: obj, metric: 'Completion verified' };
        }
        return {
          objective: `${obj.objective} (P${phaseNumber} contribution)`,
          metric: obj.metric || 'Phase deliverables complete'
        };
      });

    // Add phase-specific objective
    if (phaseObjective) {
      inherited.strategic_objectives.push({
        objective: phaseObjective,
        metric: `P${phaseNumber} deliverables complete`
      });
    }
  } else {
    inherited.strategic_objectives = [
      { objective: phaseObjective || `Complete P${phaseNumber}`, metric: 'Phase gate passed' },
      { objective: 'Maintain code quality', metric: 'No linting errors' }
    ];
  }

  // Inherit success_criteria - make phase-specific
  if (parentSD.success_criteria?.length > 0) {
    inherited.success_criteria = parentSD.success_criteria.map(c => {
      if (typeof c === 'string') {
        return { criterion: c, measure: 'Verified complete' };
      }
      return {
        criterion: c.criterion,
        measure: c.measure || 'Verified complete'
      };
    });
  } else {
    inherited.success_criteria = [
      { criterion: 'All phase tasks completed', measure: 'Checklist 100%' },
      { criterion: 'Tests passing', measure: 'CI green' },
      { criterion: 'Code reviewed', measure: 'PR approved' }
    ];
  }

  // Inherit risks - filter/adjust for phase scope
  if (parentSD.risks?.length > 0) {
    inherited.risks = parentSD.risks
      .filter(r => r.severity !== 'LOW') // Skip low risks for children
      .map(r => ({
        risk: r.risk,
        severity: r.severity || 'MEDIUM',
        mitigation: r.mitigation,
        phase_impact: `Relevant to P${phaseNumber}`
      }));

    // Ensure at least empty array if no relevant risks
    if (inherited.risks.length === 0) {
      inherited.risks = [];
    }
  } else {
    inherited.risks = []; // Empty is valid for low-risk phases
  }

  return inherited;
}

/**
 * Generate a complete child SD from parent template
 *
 * @param {Object} parentSD - Parent Strategic Directive from database
 * @param {Object} config - Child configuration
 * @param {number} config.phaseNumber - Phase number (0-10)
 * @param {string} config.phaseTitle - Short title for this phase
 * @param {string} config.phaseDescription - Full description (50+ chars)
 * @param {string} config.phaseScope - Scope definition (30+ chars)
 * @param {string} config.phaseObjective - Main objective for this phase
 * @param {string} config.category - Category override (optional)
 * @param {string} config.priority - Priority override (optional)
 * @param {string} config.sdType - SD type override (optional, auto-inferred if not provided)
 * @param {Object} config.customMetrics - Additional success_metrics (optional)
 * @param {Object} config.customRisks - Additional risks (optional)
 * @returns {Object} Complete child SD data ready for database insert
 */
export function generateChildSD(parentSD, config) {
  const {
    phaseNumber,
    phaseTitle,
    phaseDescription,
    phaseScope,
    phaseObjective,
    category = parentSD.category || 'feature',
    priority = parentSD.priority || 'high',
    sdType = null, // Will be inferred if not provided
    customMetrics = [],
    customRisks = []
  } = config;

  // Infer SD type from title/scope if not explicitly provided
  const inferredType = inferSDType(phaseTitle, phaseScope, phaseDescription);
  const finalSDType = sdType || inferredType.sdType;

  // Generate SD key pattern: PARENT-ID-P{N}
  const parentKey = parentSD.sd_key || parentSD.id;
  const childKey = `${parentKey}-P${phaseNumber}`;

  // Inherit strategic fields from parent
  const inherited = inheritStrategicFields(parentSD, {
    phaseNumber,
    phaseTitle,
    phaseObjective
  });

  // Merge custom metrics/risks with inherited
  const mergedMetrics = [...inherited.success_metrics, ...customMetrics];
  const mergedRisks = [...inherited.risks, ...customRisks];

  // Build complete child SD
  const childSD = {
    // Identity
    id: childKey,
    sd_key: childKey,
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    parent_sd_id: parentSD.id,

    // Core fields (required)
    title: `Phase ${phaseNumber}: ${phaseTitle}`,
    description: phaseDescription,
    scope: phaseScope,
    rationale: `Part of ${parentSD.title} - ${phaseObjective || phaseTitle}`,
    category,
    priority,
    sd_type: finalSDType, // Auto-inferred from title/scope keywords

    // Strategic fields (inherited + merged)
    success_metrics: mergedMetrics,
    key_principles: inherited.key_principles,
    strategic_objectives: inherited.strategic_objectives,
    success_criteria: inherited.success_criteria,
    risks: mergedRisks,

    // Workflow fields
    status: 'draft',
    progress: 0,
    phase: 'LEAD',

    // Metadata
    metadata: {
      phase_number: phaseNumber,
      parent_sd_key: parentKey,
      inherited_from: parentSD.id,
      generation_date: new Date().toISOString(),
      // SD type inference audit trail
      sd_type_inference: {
        inferred_type: inferredType.sdType,
        confidence: inferredType.confidence,
        matched_keywords: inferredType.matchedKeywords,
        explicit_override: sdType !== null
      }
    },

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return childSD;
}

/**
 * Generate a complete child SD with AI-generated strategic fields
 * This is the PREFERRED method - uses LLM for context-appropriate fields
 *
 * @param {Object} parentSD - Parent Strategic Directive from database
 * @param {Object} config - Child configuration (same as generateChildSD)
 * @returns {Promise<Object>} Complete child SD data with AI-generated strategic fields
 */
export async function generateChildSDAsync(parentSD, config) {
  const {
    phaseNumber,
    phaseTitle,
    phaseDescription,
    phaseScope,
    phaseObjective,
    category = parentSD.category || 'feature',
    priority = parentSD.priority || 'high',
    sdType = null,
    customMetrics = [],
    customRisks = []
  } = config;

  // Infer SD type from title/scope if not explicitly provided
  const inferredType = inferSDType(phaseTitle, phaseScope, phaseDescription);
  const finalSDType = sdType || inferredType.sdType;

  // Generate SD key pattern: PARENT-ID-P{N}
  const parentKey = parentSD.sd_key || parentSD.id;
  const childKey = `${parentKey}-P${phaseNumber}`;

  // Build child context for LLM
  const childContext = {
    title: `Phase ${phaseNumber}: ${phaseTitle}`,
    description: phaseDescription,
    scope: phaseScope,
    sd_type: finalSDType,
    phaseNumber
  };

  // Build parent context for LLM alignment
  const parentContext = {
    title: parentSD.title,
    description: parentSD.description,
    strategic_objectives: parentSD.strategic_objectives,
    rationale: parentSD.rationale
  };

  // Try AI generation first
  let strategicFields = null;
  if (isLLMAvailable()) {
    try {
      strategicFields = await generateStrategicFieldsWithLLM(childContext, parentContext);
    } catch (err) {
      console.warn(`⚠️ LLM generation failed for ${childKey}, falling back to templates: ${err.message}`);
    }
  }

  // Fallback to template-based inheritance if LLM fails
  if (!strategicFields) {
    console.log(`ℹ️ Using template-based inheritance for ${childKey}`);
    strategicFields = inheritStrategicFields(parentSD, {
      phaseNumber,
      phaseTitle,
      phaseObjective
    });
  }

  // Merge custom metrics/risks with generated
  const mergedMetrics = [...(strategicFields.success_metrics || []), ...customMetrics];
  const mergedRisks = [...(strategicFields.risks || []), ...customRisks];

  // Build complete child SD
  const childSD = {
    // Identity
    id: childKey,
    sd_key: childKey,
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    parent_sd_id: parentSD.id,

    // Core fields (required)
    title: `Phase ${phaseNumber}: ${phaseTitle}`,
    description: phaseDescription,
    scope: phaseScope,
    rationale: `Part of ${parentSD.title} - ${phaseObjective || phaseTitle}`,
    category,
    priority,
    sd_type: finalSDType,

    // Strategic fields (AI-generated or inherited)
    success_metrics: mergedMetrics,
    key_principles: strategicFields.key_principles || [],
    strategic_objectives: strategicFields.strategic_objectives || [],
    success_criteria: strategicFields.success_criteria || [],
    risks: mergedRisks,

    // Workflow fields
    status: 'draft',
    progress: 0,
    phase: 'LEAD',

    // Metadata
    metadata: {
      phase_number: phaseNumber,
      parent_sd_key: parentKey,
      inherited_from: parentSD.id,
      generation_date: new Date().toISOString(),
      // Generation source tracking
      strategic_fields_source: strategicFields ? 'llm' : 'template',
      // SD type inference audit trail
      sd_type_inference: {
        inferred_type: inferredType.sdType,
        confidence: inferredType.confidence,
        matched_keywords: inferredType.matchedKeywords,
        explicit_override: sdType !== null
      }
    },

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return childSD;
}

/**
 * Generate multiple child SDs for an orchestrator parent (async with AI)
 *
 * @param {Object} parentSD - Parent Strategic Directive
 * @param {Array} phases - Array of phase configurations
 * @returns {Promise<Object>} Result with children array and errors
 */
export async function generatePhaseChildrenAsync(parentSD, phases) {
  const children = [];
  const errors = [];

  for (const phase of phases) {
    try {
      const childSD = await generateChildSDAsync(parentSD, phase);

      // Validate the generated child
      const validation = validateSDCreation(childSD, { isChildSD: true });

      if (validation.valid) {
        children.push({
          sd: childSD,
          validation,
          source: childSD.metadata?.strategic_fields_source || 'unknown'
        });
      } else {
        errors.push({
          phaseNumber: phase.phaseNumber,
          errors: validation.errors,
          warnings: validation.warnings
        });
      }
    } catch (err) {
      errors.push({
        phaseNumber: phase.phaseNumber,
        errors: [`Generation failed: ${err.message}`],
        warnings: []
      });
    }
  }

  return {
    children,
    errors,
    allValid: errors.length === 0,
    summary: `Generated ${children.length}/${phases.length} valid child SDs`,
    llmUsed: children.filter(c => c.source === 'llm').length
  };
}

/**
 * Generate multiple child SDs for an orchestrator parent
 *
 * @param {Object} parentSD - Parent Strategic Directive
 * @param {Array} phases - Array of phase configurations
 * @returns {Array} Array of validated child SD data
 */
export function generatePhaseChildren(parentSD, phases) {
  const children = [];
  const errors = [];

  for (const phase of phases) {
    const childSD = generateChildSD(parentSD, phase);

    // Validate the generated child
    const validation = validateSDCreation(childSD, { isChildSD: true });

    if (validation.valid) {
      children.push({
        sd: childSD,
        validation
      });
    } else {
      errors.push({
        phaseNumber: phase.phaseNumber,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }
  }

  return {
    children,
    errors,
    allValid: errors.length === 0,
    summary: `Generated ${children.length}/${phases.length} valid child SDs`
  };
}

/**
 * Create a minimal phase configuration
 * Use this when you don't have detailed phase info
 *
 * @param {number} phaseNumber - Phase number
 * @param {string} phaseTitle - Short title
 * @returns {Object} Minimal phase config
 */
export function createMinimalPhaseConfig(phaseNumber, phaseTitle) {
  return {
    phaseNumber,
    phaseTitle,
    phaseDescription: `Phase ${phaseNumber} implementation: ${phaseTitle}. This phase contributes to the overall strategic directive objectives.`,
    phaseScope: `Implementation of ${phaseTitle} as defined in parent SD scope.`,
    phaseObjective: `Complete ${phaseTitle} deliverables`
  };
}

/**
 * Validate a child SD meets requirements before creation
 *
 * @param {Object} childData - Child SD data to validate
 * @returns {Object} Validation result with details
 */
export function validateChildBeforeCreation(childData) {
  // Use strict child validation (isChildSD: true)
  const result = validateSDCreation(childData, {
    isChildSD: true,
    allowWarnings: false
  });

  // Add additional child-specific checks
  const additionalChecks = [];

  // Check parent_sd_id is set
  if (!childData.parent_sd_id) {
    additionalChecks.push('parent_sd_id is required for child SDs');
  }

  // Check sd_key follows pattern
  const keyPattern = /-P\d+$/;
  if (!keyPattern.test(childData.sd_key || childData.id)) {
    additionalChecks.push('sd_key should end with -P{N} pattern for child SDs');
  }

  // Check title includes phase number
  if (!/Phase \d+/.test(childData.title)) {
    additionalChecks.push('title should include "Phase N:" for clarity');
  }

  return {
    ...result,
    additionalChecks,
    canCreate: result.valid && additionalChecks.length === 0
  };
}

/**
 * Get example phase configurations for common SD types
 *
 * @param {string} sdType - Type of SD (feature, infrastructure, refactor)
 * @param {number} phaseCount - Number of phases to generate
 * @returns {Array} Example phase configurations
 */
export function getExamplePhaseConfigs(sdType, phaseCount = 3) {
  const examples = {
    feature: [
      { phaseTitle: 'Foundation Setup', phaseObjective: 'Create base infrastructure' },
      { phaseTitle: 'Core Implementation', phaseObjective: 'Implement main functionality' },
      { phaseTitle: 'Testing & Polish', phaseObjective: 'Complete testing and refinements' }
    ],
    infrastructure: [
      { phaseTitle: 'Audit & Analysis', phaseObjective: 'Analyze current state' },
      { phaseTitle: 'Migration', phaseObjective: 'Execute migration plan' },
      { phaseTitle: 'Verification', phaseObjective: 'Verify and document changes' }
    ],
    refactor: [
      { phaseTitle: 'Baseline Capture', phaseObjective: 'Capture current behavior' },
      { phaseTitle: 'Restructure', phaseObjective: 'Refactor code structure' },
      { phaseTitle: 'Regression Testing', phaseObjective: 'Verify no behavior changes' }
    ]
  };

  const baseConfigs = examples[sdType] || examples.feature;

  return baseConfigs.slice(0, phaseCount).map((config, index) => ({
    phaseNumber: index,
    ...config,
    phaseDescription: `Phase ${index} implementation: ${config.phaseTitle}. ${config.phaseObjective} as part of the strategic directive.`,
    phaseScope: `${config.phaseTitle} - focused on ${config.phaseObjective.toLowerCase()}.`
  }));
}

export default {
  // Async methods (preferred - use AI)
  generateChildSDAsync,
  generatePhaseChildrenAsync,
  // Sync methods (fallback - template-based)
  generateChildSD,
  generatePhaseChildren,
  // Utilities
  inheritStrategicFields,
  createMinimalPhaseConfig,
  validateChildBeforeCreation,
  getExamplePhaseConfigs,
  inferSDType,
  CHILD_SD_TEMPLATE,
  SD_TYPE_KEYWORDS
};
