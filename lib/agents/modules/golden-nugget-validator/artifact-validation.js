/**
 * Golden Nugget Validator - Artifact Validation Module
 *
 * Validates individual artifact quality.
 * THE LAW: Existence is NOT enough. Quality is MANDATORY for transition.
 *
 * @module lib/agents/modules/golden-nugget-validator/artifact-validation
 */

import {
  checkSemanticEntropy,
  validateSemanticKeywords,
  checkEpistemicClassification
} from './semantic-validation.js';
import { checkDesignFidelity } from './design-fidelity.js';
import { ARTIFACT_TYPES } from '../../../eva/artifact-types.js';

/**
 * Minimum length requirements based on artifact type
 */
const MIN_LENGTH_REQUIREMENTS = {
  // High-value documents
  [ARTIFACT_TYPES.TRUTH_IDEA_BRIEF]: 200,
  [ARTIFACT_TYPES.TRUTH_AI_CRITIQUE]: 300,
  [ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION]: 300,
  [ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS]: 400,
  [ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL]: 300,
  [ARTIFACT_TYPES.ENGINE_RISK_MATRIX]: 200,
  [ARTIFACT_TYPES.ENGINE_PRICING_MODEL]: 200,
  [ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS]: 400,
  [ARTIFACT_TYPES.ENGINE_EXIT_STRATEGY]: 200,
  [ARTIFACT_TYPES.IDENTITY_BRAND_GUIDELINES]: 300,
  [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: 300,
  [ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY]: 200,
  [ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP]: 200,
  [ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL]: 300,
  [ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK]: 300,
  [ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT]: 200,
  [ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC]: 200,

  // Medium-value artifacts
  [ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM]: 100,
  [ARTIFACT_TYPES.BUILD_SYSTEM_PROMPT]: 150,
  [ARTIFACT_TYPES.BUILD_CICD_CONFIG]: 100,
  [ARTIFACT_TYPES.BUILD_SECURITY_AUDIT]: 200,
  [ARTIFACT_TYPES.LAUNCH_TEST_PLAN]: 200,
  [ARTIFACT_TYPES.LAUNCH_UAT_REPORT]: 150,
  [ARTIFACT_TYPES.LAUNCH_DEPLOYMENT_RUNBOOK]: 150,
  [ARTIFACT_TYPES.LAUNCH_MARKETING_CHECKLIST]: 100,
  [ARTIFACT_TYPES.LAUNCH_ANALYTICS_DASHBOARD]: 100,
  [ARTIFACT_TYPES.LAUNCH_OPTIMIZATION_ROADMAP]: 200,
  [ARTIFACT_TYPES.LAUNCH_ASSUMPTIONS_VS_REALITY]: 300,

  // Default for unknown types
  'default': 100
};

/**
 * Validate individual artifact quality
 * Quality rules:
 * - Content must not be empty
 * - Content must meet minimum length (100 chars for documents, 50 for others)
 * - Certain artifacts must have specific fields
 *
 * @param {Object} artifact - Artifact to validate {type, content, metadata}
 * @param {string} requiredType - Expected artifact type
 * @returns {Object} {valid, reason, details}
 */
export function validateArtifactQuality(artifact, requiredType) {
  // Empty content check
  if (!artifact.content || artifact.content.trim().length === 0) {
    return {
      valid: false,
      reason: 'Artifact content is empty',
      details: { content_length: 0 }
    };
  }

  const contentLength = artifact.content.trim().length;
  const minLength = MIN_LENGTH_REQUIREMENTS[requiredType] || MIN_LENGTH_REQUIREMENTS.default;

  if (contentLength < minLength) {
    return {
      valid: false,
      reason: `Content too short (${contentLength} chars, minimum ${minLength})`,
      details: { content_length: contentLength, required_length: minLength }
    };
  }

  // COGNITIVE UPGRADE v2.6.0: SEMANTIC VALIDATION
  // 1. Anti-Entropy Check (applies to all artifacts)
  const entropyCheck = checkSemanticEntropy(artifact.content);
  if (!entropyCheck.passed) {
    return {
      valid: false,
      reason: `Anti-entropy check failed (score: ${entropyCheck.entropy_score}/100): ${entropyCheck.issues.join('; ')}`,
      details: {
        content_length: contentLength,
        entropy_score: entropyCheck.entropy_score,
        issues: entropyCheck.issues
      }
    };
  }

  // 2. Semantic Keyword Validation (for typed artifacts)
  const keywordCheck = validateSemanticKeywords(requiredType, artifact.content);
  if (!keywordCheck.passed && keywordCheck.required_keywords) {
    return {
      valid: false,
      reason: keywordCheck.reason,
      details: {
        content_length: contentLength,
        found_required: keywordCheck.found_required,
        missing_required: keywordCheck.missing_required,
        found_optional: keywordCheck.found_optional
      }
    };
  }

  // Type-specific validation
  switch (requiredType) {
    case ARTIFACT_TYPES.TRUTH_IDEA_BRIEF:
      if (!artifact.metadata?.title || !artifact.metadata?.description) {
        return {
          valid: false,
          reason: 'Idea brief missing title or description metadata',
          details: { content_length: contentLength, has_metadata: false }
        };
      }
      break;

    case ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL: {
      const hasFinancialMetrics = /\$|revenue|margin|cost|profit|CAC|LTV/i.test(artifact.content);
      if (!hasFinancialMetrics) {
        return {
          valid: false,
          reason: 'Financial model does not contain recognizable financial metrics',
          details: { content_length: contentLength, has_metrics: false }
        };
      }
      break;
    }

    case ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION: {
      const hasValidation = /score|validate|rating|decision|approve|reject/i.test(artifact.content);
      if (!hasValidation) {
        return {
          valid: false,
          reason: 'Validation report missing validation decision or score',
          details: { content_length: contentLength, has_validation: false }
        };
      }
      break;
    }

    case 'epistemic_classification': {
      const hasBuckets = /facts|assumptions|simulations|unknowns/i.test(artifact.content);
      if (!hasBuckets) {
        return {
          valid: false,
          reason: 'Epistemic classification missing required buckets (facts/assumptions/simulations/unknowns)',
          details: { content_length: contentLength, has_buckets: false }
        };
      }
      break;
    }

    case ARTIFACT_TYPES.ENGINE_RISK_MATRIX: {
      // Risk Matrix requires epistemic classification
      const epistemicCheck = checkEpistemicClassification(artifact.content);
      if (!epistemicCheck.passed) {
        return {
          valid: false,
          reason: `Risk matrix lacks epistemic rigor: ${epistemicCheck.reason}`,
          details: {
            content_length: contentLength,
            buckets_found: epistemicCheck.buckets_found,
            bucket_count: epistemicCheck.bucket_count
          }
        };
      }

      // Must have structured risk entries (table or list format)
      const hasRiskStructure = /\|.*risk.*\||\-\s+risk|\d+\.\s+risk|risk\s*id|risk-\d+/i.test(artifact.content);
      if (!hasRiskStructure) {
        return {
          valid: false,
          reason: 'Risk matrix must contain structured risk entries (table or list format)',
          details: { content_length: contentLength, has_structure: false }
        };
      }

      // Must have mitigation strategies
      const hasMitigation = /mitigat|contingenc|control|prevent|reduc/i.test(artifact.content);
      if (!hasMitigation) {
        return {
          valid: false,
          reason: 'Risk matrix must include mitigation strategies',
          details: { content_length: contentLength, has_mitigation: false }
        };
      }
      break;
    }

    case 'prd':
    case 'design_spec':
    case 'ui_spec': {
      // GOLDEN NUGGET #8: Design Fidelity
      const designCheck = checkDesignFidelity(artifact);
      if (!designCheck.passed) {
        return {
          valid: false,
          reason: designCheck.failures.map(f => f.reason).join('; '),
          details: {
            content_length: contentLength,
            design_failures: designCheck.failures,
            persona_check: designCheck.persona_check,
            ux_check: designCheck.ux_check
          }
        };
      }
      // Log warnings even if passed (for visibility)
      const warnings = designCheck.failures.filter(f => f.severity === 'WARNING');
      if (warnings.length > 0) {
        console.log(`   [GoldenNuggetValidator] Design warnings for ${requiredType}:`);
        warnings.forEach(w => console.log(`      - ${w.reason}`));
      }
      break;
    }
  }

  // All checks passed - include semantic validation details
  return {
    valid: true,
    reason: 'Artifact meets quality and semantic standards',
    details: {
      content_length: contentLength,
      entropy_score: entropyCheck.entropy_score,
      semantic_keywords: keywordCheck.found_required?.length || 0
    }
  };
}
