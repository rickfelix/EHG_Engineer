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

You are an AI Quality Judge evaluating a protocol improvement proposal. Your task is to:
1. Check for constitution rule violations
2. Score the improvement on multiple criteria
3. Provide a clear recommendation

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

## YOUR TASK

1. **Constitution Check**: First, identify any violations of the constitution rules above.
   - CRITICAL violations (CONST-001, CONST-002, CONST-007, CONST-009) = auto-reject
   - HIGH violations require mandatory human review
   - MEDIUM violations are warnings

2. **Criterion Scoring**: Score each criterion 0-10 with brief justification.

3. **Recommendation**: Based on weighted score:
   - 85-100: APPROVE (high confidence)
   - 70-84: APPROVE (medium confidence, human review recommended)
   - 50-69: NEEDS_REVISION
   - 0-49: REJECT

## RESPONSE FORMAT

Respond with JSON in this exact format:
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

Evaluate the following ${improvements.length} improvement proposals.

${constitutionContext}

## IMPROVEMENTS TO EVALUATE
${improvementSections}

## SCORING CRITERIA
${criteriaSection}

## RESPONSE FORMAT

Respond with JSON array:
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
Please evaluate if the issues from the previous assessment have been addressed.
`;

  return basePrompt + '\n\n' + previousContext;
}

export default {
  generateEvaluationPrompt,
  generateBatchEvaluationPrompt,
  generateReEvaluationPrompt,
  buildConstitutionContext
};
