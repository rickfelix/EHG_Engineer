/**
 * PRD Generation Configuration
 * Configuration constants and LLM settings
 *
 * Extracted from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 */

import { getOpenAIModel } from '../../lib/config/model-config.js';

/**
 * LLM Configuration for PRD Content Generation
 */
export const LLM_PRD_CONFIG = {
  model: getOpenAIModel('generation'),
  temperature: 0.6,   // Slightly lower for more structured PRD content
  maxTokens: 32000,   // Extended for comprehensive PRD generation
  enabled: process.env.LLM_PRD_GENERATION !== 'false'  // Enabled by default
};

/**
 * PRD Quality Rubric Criteria for LLM context injection
 *
 * This is embedded in the LLM prompt so it generates content that will pass
 * the Russian Judge quality validation.
 */
export const PRD_QUALITY_RUBRIC_CRITERIA = `
## QUALITY CRITERIA (You will be judged on these dimensions)

### 1. Requirements Depth & Specificity (40% weight)
- 0-3: Mostly placeholders ("To be defined", "TBD", generic statements) - WILL FAIL
- 4-6: Some specific requirements but many vague or incomplete
- 7-8: Most requirements are specific, actionable, and complete
- 9-10: All requirements are detailed, specific, testable, with clear acceptance criteria

**Target**: Score 7-8 minimum. Each requirement must be implementation-ready.

### 2. Architecture Explanation Quality (30% weight)
- 0-3: No architecture details or vague high-level statements
- 4-6: Basic architecture mentioned but missing key details
- 7-8: Clear architecture with components, data flow, and integration points
- 9-10: Comprehensive: components + data flow + integration + trade-offs + scalability

**Target**: Score 7-8 minimum. Must enable implementation without guessing.

### 3. Test Scenario Sophistication (20% weight)
- 0-3: No test scenarios or only trivial happy path - WILL FAIL
- 4-6: Happy path covered but missing edge cases and error conditions
- 7-8: Happy path + common edge cases + error handling scenarios
- 9-10: Comprehensive: happy path + edge cases + errors + performance + security

**Target**: Score 7-8 minimum. Must demonstrate failure mode understanding.

### 4. Risk Analysis Completeness (10% weight)
- 0-3: No technical risks or listed without mitigation
- 4-6: Basic risks with generic mitigation ("test thoroughly")
- 7-8: Specific technical risks with concrete mitigation strategies
- 9-10: Comprehensive: risks + mitigation + rollback plan + monitoring

**Target**: Score 7-8 minimum. Must be proactive and specific to this SD.
`;

/**
 * Build LLM system prompt for PRD generation
 * @param {string} sdType - The SD type (feature, database, infrastructure, etc.)
 * @returns {string} Complete system prompt
 */
export function buildSystemPrompt(sdType) {
  return `You are a Technical Product Manager creating a Product Requirements Document (PRD) for a software engineering team.

Your PRD must be IMPLEMENTATION-READY. The development team will use this document to build the feature.

${PRD_QUALITY_RUBRIC_CRITERIA}

## OUTPUT REQUIREMENTS

Return a JSON object with exactly these fields:
{
  "executive_summary": "string - 200-500 chars describing WHAT, WHY, and IMPACT",
  "functional_requirements": [
    {
      "id": "FR-1",
      "requirement": "Specific, actionable requirement statement",
      "description": "Detailed description of what this achieves",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "acceptance_criteria": ["AC-1", "AC-2", "AC-3"]
    }
  ],
  "technical_requirements": [
    {
      "id": "TR-1",
      "requirement": "Technical constraint or requirement",
      "rationale": "Why this is needed"
    }
  ],
  "system_architecture": {
    "overview": "High-level architecture description",
    "components": [
      {
        "name": "Component Name",
        "responsibility": "What this component does",
        "technology": "Tech stack used"
      }
    ],
    "data_flow": "Description of how data moves through the system",
    "integration_points": ["Integration point 1", "Integration point 2"]
  },
  "test_scenarios": [
    {
      "id": "TS-1",
      "scenario": "Test scenario description",
      "test_type": "unit|integration|e2e|performance|security",
      "given": "Preconditions",
      "when": "Action taken",
      "then": "Expected outcome"
    }
  ],
  "acceptance_criteria": [
    "Specific, measurable criterion 1",
    "Specific, measurable criterion 2"
  ],
  "risks": [
    {
      "risk": "Specific risk description",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "HIGH|MEDIUM|LOW",
      "mitigation": "Concrete mitigation strategy",
      "rollback_plan": "How to rollback if this fails"
    }
  ],
  "implementation_approach": {
    "phases": [
      {
        "phase": "Phase 1",
        "description": "What happens in this phase",
        "deliverables": ["Deliverable 1", "Deliverable 2"]
      }
    ],
    "technical_decisions": ["Key decision 1 with rationale", "Key decision 2"]
  }
}

## CRITICAL RULES

1. **NO PLACEHOLDERS**: Never use "To be defined", "TBD", "Will be determined", or similar
2. **SPECIFIC**: Every requirement must be specific enough to implement immediately
3. **TESTABLE**: Every acceptance criterion must be verifiable
4. **SD-ALIGNED**: All content must directly relate to the SD objectives
5. **TYPE-AWARE**: Tailor depth based on SD type (${sdType})

SD Type-Specific Guidance:
${sdType === 'database' ? '- Focus heavily on schema design, migration safety, RLS policies, data integrity' : ''}
${sdType === 'infrastructure' ? '- Focus on deployment, CI/CD, monitoring, rollback procedures' : ''}
${sdType === 'security' ? '- Focus on threat modeling, auth flows, permission boundaries, audit logging' : ''}
${sdType === 'documentation' ? '- Focus on content completeness, accuracy verification, maintenance plan' : ''}
${sdType === 'feature' || !sdType ? '- Balance functional requirements, UX, and technical implementation' : ''}`;
}
