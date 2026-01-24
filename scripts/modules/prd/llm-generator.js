/**
 * PRD LLM Generator
 *
 * LLM-based PRD content generation using GPT.
 * Extracted from add-prd-to-database.js for maintainability.
 *
 * Part of SD-LEO-REFACTOR-PRD-001
 */

import OpenAI from 'openai';
import { getOpenAIModel } from '../../../lib/config/model-config.js';
import { buildPRDGenerationContext } from './context-builder.js';

/**
 * LLM Configuration for PRD Generation
 */
export const LLM_PRD_CONFIG = {
  model: getOpenAIModel('generation'),
  temperature: 0.6,   // Slightly lower for more structured PRD content
  maxTokens: 32000,   // Extended for comprehensive PRD generation
  enabled: process.env.LLM_PRD_GENERATION !== 'false'  // Enabled by default
};

/**
 * PRD Quality Rubric Criteria for LLM context injection
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
 * Build the system prompt for PRD generation
 */
function buildSystemPrompt(sdType) {
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

/**
 * Generate PRD content using LLM
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
 * @returns {Promise<Object|null>} Generated PRD content or null if failed
 */
export async function generatePRDContentWithLLM(sd, context = {}) {
  if (!LLM_PRD_CONFIG.enabled) {
    console.log('   ℹ️  LLM PRD generation disabled via LLM_PRD_GENERATION=false');
    return null;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn('   ⚠️  OPENAI_API_KEY not set, falling back to template PRD');
    return null;
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const sdType = sd.sd_type || 'feature';

  console.log('   🤖 Generating PRD content with GPT...');
  console.log(`   📋 SD Type: ${sdType}`);

  try {
    const systemPrompt = buildSystemPrompt(sdType);
    const userPrompt = buildPRDGenerationContext(sd, context);

    const response = await openai.chat.completions.create({
      model: LLM_PRD_CONFIG.model,
      temperature: LLM_PRD_CONFIG.temperature,
      max_completion_tokens: LLM_PRD_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;

    if (!content) {
      console.warn('   ⚠️  LLM returned empty content');
      return null;
    }

    if (finishReason === 'length') {
      console.warn('   ⚠️  LLM response truncated (token limit), attempting parse anyway');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('   ⚠️  Could not extract JSON from LLM response');
      console.log('   Response preview:', content.substring(0, 500));
      return null;
    }

    const prdContent = JSON.parse(jsonMatch[0]);

    console.log('   ✅ PRD content generated successfully');
    console.log(`   📊 Generated: ${prdContent.functional_requirements?.length || 0} functional requirements`);
    console.log(`   📊 Generated: ${prdContent.test_scenarios?.length || 0} test scenarios`);
    console.log(`   📊 Generated: ${prdContent.risks?.length || 0} risks identified`);

    return prdContent;

  } catch (error) {
    console.error('   ❌ LLM PRD generation failed:', error.message);
    if (error.response?.data) {
      console.error('   API Error:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

/**
 * Format LLM-generated PRD content into markdown
 */
export function formatPRDContent(sdId, sdData, llmContent) {
  const sections = [];

  sections.push(`# Product Requirements Document

## Strategic Directive
${sdId}

## Title
${sdData.title || 'Untitled'}

## Status
Planning

## Executive Summary
${llmContent.executive_summary || 'See functional requirements below.'}`);

  // Functional Requirements
  if (llmContent.functional_requirements && llmContent.functional_requirements.length > 0) {
    sections.push(`## Functional Requirements

${llmContent.functional_requirements.map(req => {
  const lines = [`### ${req.id}: ${req.requirement}`];
  if (req.description) lines.push(`\n${req.description}`);
  if (req.priority) lines.push(`\n**Priority**: ${req.priority}`);
  if (req.acceptance_criteria && req.acceptance_criteria.length > 0) {
    lines.push('\n**Acceptance Criteria**:');
    req.acceptance_criteria.forEach(ac => lines.push(`- ${ac}`));
  }
  return lines.join('');
}).join('\n\n')}`);
  }

  // Technical Requirements
  if (llmContent.technical_requirements && llmContent.technical_requirements.length > 0) {
    sections.push(`## Technical Requirements

${llmContent.technical_requirements.map(req => {
  const lines = [`### ${req.id}: ${req.requirement}`];
  if (req.rationale) lines.push(`\n**Rationale**: ${req.rationale}`);
  return lines.join('');
}).join('\n\n')}`);
  }

  // System Architecture
  if (llmContent.system_architecture) {
    const arch = llmContent.system_architecture;
    const archLines = ['## System Architecture'];
    if (arch.overview) archLines.push(`\n### Overview\n${arch.overview}`);
    if (arch.components && arch.components.length > 0) {
      archLines.push('\n### Components');
      arch.components.forEach(comp => {
        archLines.push(`\n#### ${comp.name}`);
        if (comp.responsibility) archLines.push(`- **Responsibility**: ${comp.responsibility}`);
        if (comp.technology) archLines.push(`- **Technology**: ${comp.technology}`);
      });
    }
    if (arch.data_flow) archLines.push(`\n### Data Flow\n${arch.data_flow}`);
    if (arch.integration_points && arch.integration_points.length > 0) {
      archLines.push('\n### Integration Points');
      arch.integration_points.forEach(point => archLines.push(`- ${point}`));
    }
    sections.push(archLines.join(''));
  }

  // Implementation Approach
  if (llmContent.implementation_approach) {
    const impl = llmContent.implementation_approach;
    const implLines = ['## Implementation Approach'];
    if (impl.phases && impl.phases.length > 0) {
      implLines.push('\n### Phases');
      impl.phases.forEach(phase => {
        implLines.push(`\n#### ${phase.phase}`);
        if (phase.description) implLines.push(phase.description);
        if (phase.deliverables && phase.deliverables.length > 0) {
          implLines.push('\n**Deliverables**:');
          phase.deliverables.forEach(d => implLines.push(`- ${d}`));
        }
      });
    }
    if (impl.technical_decisions && impl.technical_decisions.length > 0) {
      implLines.push('\n### Key Technical Decisions');
      impl.technical_decisions.forEach(dec => implLines.push(`- ${dec}`));
    }
    sections.push(implLines.join(''));
  }

  // Test Scenarios
  if (llmContent.test_scenarios && llmContent.test_scenarios.length > 0) {
    sections.push(`## Test Scenarios

${llmContent.test_scenarios.map(ts => {
  const lines = [`### ${ts.id}: ${ts.scenario}`];
  if (ts.test_type) lines.push(`\n**Type**: ${ts.test_type}`);
  if (ts.given) lines.push(`\n**Given**: ${ts.given}`);
  if (ts.when) lines.push(`\n**When**: ${ts.when}`);
  if (ts.then) lines.push(`\n**Then**: ${ts.then}`);
  return lines.join('');
}).join('\n\n')}`);
  }

  // Acceptance Criteria
  if (llmContent.acceptance_criteria && llmContent.acceptance_criteria.length > 0) {
    sections.push(`## Acceptance Criteria

${llmContent.acceptance_criteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}`);
  }

  // Risks
  if (llmContent.risks && llmContent.risks.length > 0) {
    sections.push(`## Risks & Mitigations

${llmContent.risks.map(risk => {
  const lines = [`### ${risk.risk}`];
  if (risk.probability) lines.push(`\n**Probability**: ${risk.probability}`);
  if (risk.impact) lines.push(`\n**Impact**: ${risk.impact}`);
  if (risk.mitigation) lines.push(`\n**Mitigation**: ${risk.mitigation}`);
  if (risk.rollback_plan) lines.push(`\n**Rollback Plan**: ${risk.rollback_plan}`);
  return lines.join('');
}).join('\n\n')}`);
  }

  sections.push(`
---
*Generated by LLM PRD Content Generation*
*Date: ${new Date().toISOString()}*`);

  return sections.join('\n\n');
}
