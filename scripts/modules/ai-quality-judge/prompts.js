/**
 * AI Prompts for Quality Judge
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Constitution-aware prompts for improvement evaluation
 */

import { SCORING_CRITERIA } from './config.js';

/**
 * Build the scoring criteria section for prompts
 */
function buildCriteriaSection() {
  const lines = [];

  for (const [criterion, config] of Object.entries(SCORING_CRITERIA)) {
    lines.push(`**${criterion.toUpperCase()}** (Weight: ${config.weight}%)`);
    lines.push(`   ${config.description}`);
    lines.push(`   Scale: ${config.scale}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build constitution rules context for prompts
 *
 * @param {Array} constitutionRules - Rules from database
 */
export function buildConstitutionContext(constitutionRules) {
  const lines = ['## CONSTITUTION RULES (Must Not Violate)', ''];

  for (const rule of constitutionRules) {
    lines.push(`**${rule.rule_code}**: ${rule.rule_text}`);
    if (rule.rationale) {
      lines.push(`   Rationale: ${rule.rationale}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the main evaluation prompt
 *
 * @param {Object} improvement - The improvement to evaluate
 * @param {Array} constitutionRules - Constitution rules for validation
 * @returns {string} Complete evaluation prompt
 */
export function generateEvaluationPrompt(improvement, constitutionRules) {
  const criteriaSection = buildCriteriaSection();
  const constitutionContext = buildConstitutionContext(constitutionRules);

  return `# AI Quality Judge: Improvement Proposal Evaluation

Evaluate the protocol improvement proposal below using the Russian Judge methodology:
1. Check for constitution rule violations.
2. Score the improvement on five weighted criteria.
3. Issue a clear recommendation tied to the weighted score.

${constitutionContext}

## IMPROVEMENT PROPOSAL TO EVALUATE

**ID:** ${improvement.id}
**Type:** ${improvement.improvement_type || 'UNKNOWN'}
**Target Table:** ${improvement.target_table || 'NOT SPECIFIED'}
**Target Operation:** ${improvement.target_operation || 'NOT SPECIFIED'}
**Risk Tier:** ${improvement.risk_tier || 'UNKNOWN'}
**Evidence Count:** ${improvement.evidence_count || 0} retrospectives

**Description:**
${improvement.description || 'No description provided'}

**Payload:**
\`\`\`json
${JSON.stringify(improvement.payload || {}, null, 2)}
\`\`\`

**Source Retrospective ID:** ${improvement.source_retro_id || 'None'}

## SCORING CRITERIA

Score each criterion from 0-10:

${criteriaSection}

## EVALUATION STEPS

1. **Constitution Check**: Identify any violations of the constitution rules above.
   - Flag CRITICAL violations (CONST-001, CONST-002, CONST-007, CONST-009) for auto-reject.
   - Flag HIGH violations for mandatory human review.
   - Surface MEDIUM violations as warnings.

2. **Criterion Scoring**: Score each criterion 0-10 with brief justification.

3. **Recommendation**: Map the weighted score to one of:
   - 85-100: APPROVE (high confidence)
   - 70-84: APPROVE (medium confidence, human review recommended)
   - 50-69: NEEDS_REVISION
   - 0-49: REJECT

## RESPONSE FORMAT

Return strictly this JSON, with no surrounding text:
\`\`\`json
{
  "constitution_check": {
    "violations": [
      {
        "rule_code": "CONST-XXX",
        "severity": "CRITICAL|HIGH|MEDIUM",
        "explanation": "Why this is a violation"
      }
    ],
    "passed": true|false
  },
  "criteria_scores": {
    "safety": 0-10,
    "specificity": 0-10,
    "necessity": 0-10,
    "evidence": 0-10,
    "atomicity": 0-10
  },
  "reasoning": {
    "safety": "Brief justification",
    "specificity": "Brief justification",
    "necessity": "Brief justification",
    "evidence": "Brief justification",
    "atomicity": "Brief justification"
  },
  "recommendation": "APPROVE|NEEDS_REVISION|REJECT",
  "confidence": "HIGH|MEDIUM|LOW",
  "summary": "One paragraph overall assessment"
}
\`\`\``;
}

/**
 * Generate a prompt for batch evaluation
 *
 * @param {Array} improvements - Array of improvements to evaluate
 * @param {Array} constitutionRules - Constitution rules
 * @returns {string} Batch evaluation prompt
 */
export function generateBatchEvaluationPrompt(improvements, constitutionRules) {
  const constitutionContext = buildConstitutionContext(constitutionRules);
  const criteriaSection = buildCriteriaSection();

  const improvementSections = improvements.map((imp, idx) => `
### Improvement ${idx + 1}
**ID:** ${imp.id}
**Type:** ${imp.improvement_type || 'UNKNOWN'}
**Target Table:** ${imp.target_table || 'NOT SPECIFIED'}
**Target Operation:** ${imp.target_operation || 'NOT SPECIFIED'}
**Risk Tier:** ${imp.risk_tier || 'UNKNOWN'}
**Description:** ${(imp.description || 'No description').substring(0, 200)}...
`).join('\n');

  return `# AI Quality Judge: Batch Evaluation

Evaluate the ${improvements.length} improvement proposals below. Apply the constitution rules, score each proposal against the five criteria, and return one entry per improvement.

${constitutionContext}

## IMPROVEMENTS TO EVALUATE
${improvementSections}

## SCORING CRITERIA
${criteriaSection}

## RESPONSE FORMAT

Return strictly this JSON array, with no surrounding text:
\`\`\`json
{
  "evaluations": [
    {
      "improvement_id": "uuid",
      "constitution_passed": true|false,
      "score": 0-100,
      "recommendation": "APPROVE|NEEDS_REVISION|REJECT",
      "key_issues": ["issue1", "issue2"]
    }
  ]
}
\`\`\``;
}

/**
 * Generate a prompt for re-evaluation after revision
 *
 * @param {Object} improvement - The revised improvement
 * @param {Object} previousAssessment - Previous assessment
 * @param {Array} constitutionRules - Constitution rules
 * @returns {string} Re-evaluation prompt
 */
export function generateReEvaluationPrompt(improvement, previousAssessment, constitutionRules) {
  const basePrompt = generateEvaluationPrompt(improvement, constitutionRules);

  const previousContext = `
## PREVIOUS ASSESSMENT

**Previous Score:** ${previousAssessment.score}%
**Previous Recommendation:** ${previousAssessment.recommendation}
**Previous Issues:**
${previousAssessment.reasoning || 'Not specified'}

**Changes Made:**
Verify whether the issues from the previous assessment have been addressed in the revised proposal above.
`;

  return basePrompt + '\n\n' + previousContext;
}

/**
 * Shape validator: evaluation prompt must contain markers downstream consumers
 * (constitution-validator + scoring.js + AIQualityJudge response parser) rely on.
 * Used by replay tests to assert V1->V2 imperative rewrites preserve structure.
 *
 * @param {string} prompt
 * @returns {{passed: boolean, details: string}}
 */
export function validateEvaluationPromptShape(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { passed: false, details: 'prompt must be a non-empty string' };
  }
  const required = [
    'constitution', 'criteria_scores', 'reasoning', 'recommendation',
    'safety', 'specificity', 'necessity', 'evidence', 'atomicity',
    'APPROVE', 'NEEDS_REVISION', 'REJECT',
    'JSON',
  ];
  const lower = prompt.toLowerCase();
  const missing = required.filter(m => !lower.includes(m.toLowerCase()));
  if (missing.length > 0) {
    return { passed: false, details: `missing markers: ${missing.join(',')}` };
  }
  return { passed: true, details: `${required.length} required markers present` };
}

/**
 * Shape validator: batch evaluation prompt.
 *
 * @param {string} prompt
 * @returns {{passed: boolean, details: string}}
 */
export function validateBatchEvaluationPromptShape(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { passed: false, details: 'prompt must be a non-empty string' };
  }
  const required = [
    'constitution', 'evaluations', 'improvement_id',
    'score', 'recommendation', 'key_issues', 'JSON',
  ];
  const lower = prompt.toLowerCase();
  const missing = required.filter(m => !lower.includes(m.toLowerCase()));
  if (missing.length > 0) {
    return { passed: false, details: `missing markers: ${missing.join(',')}` };
  }
  return { passed: true, details: `${required.length} required markers present` };
}

/**
 * Shape validator: re-evaluation prompt (super-set of evaluation + previous-assessment).
 *
 * @param {string} prompt
 * @returns {{passed: boolean, details: string}}
 */
export function validateReEvaluationPromptShape(prompt) {
  const baseResult = validateEvaluationPromptShape(prompt);
  if (!baseResult.passed) {
    return { passed: false, details: `base evaluation markers missing: ${baseResult.details}` };
  }
  const lower = prompt.toLowerCase();
  if (!lower.includes('previous')) {
    return { passed: false, details: 'missing previous-assessment marker' };
  }
  return { passed: true, details: 'evaluation + previous-assessment markers present' };
}

export default {
  generateEvaluationPrompt,
  generateBatchEvaluationPrompt,
  generateReEvaluationPrompt,
  buildConstitutionContext,
  validateEvaluationPromptShape,
  validateBatchEvaluationPromptShape,
  validateReEvaluationPromptShape,
};
