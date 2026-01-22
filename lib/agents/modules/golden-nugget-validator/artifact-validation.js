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

/**
 * Minimum length requirements based on artifact type
 */
const MIN_LENGTH_REQUIREMENTS = {
  // High-value documents
  'idea_brief': 200,
  'critique_report': 300,
  'validation_report': 300,
  'competitive_analysis': 400,
  'financial_model': 300,
  'risk_matrix': 200,
  'pricing_model': 200,
  'business_model_canvas': 400,
  'exit_strategy': 200,
  'brand_guidelines': 300,
  'gtm_plan': 300,
  'marketing_manifest': 200,
  'sales_playbook': 200,
  'tech_stack_decision': 200,
  'data_model': 300,
  'user_story_pack': 300,
  'api_contract': 200,
  'schema_spec': 200,

  // Medium-value artifacts
  'erd_diagram': 100,
  'system_prompt': 150,
  'cicd_config': 100,
  'security_audit': 200,
  'test_plan': 200,
  'uat_report': 150,
  'deployment_runbook': 150,
  'launch_checklist': 100,
  'analytics_dashboard': 100,
  'optimization_roadmap': 200,
  'assumptions_vs_reality_report': 300,

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
    case 'idea_brief':
      if (!artifact.metadata?.title || !artifact.metadata?.description) {
        return {
          valid: false,
          reason: 'Idea brief missing title or description metadata',
          details: { content_length: contentLength, has_metadata: false }
        };
      }
      break;

    case 'financial_model': {
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

    case 'validation_report': {
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

    case 'risk_matrix': {
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
