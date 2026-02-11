/**
 * PRD LLM Service Module
 * Extracted from add-prd-to-database.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P2-001: add-prd-to-database Refactoring
 *
 * Contains LLM/GPT integration for PRD content generation.
 * @module PRDLLMService
 * @version 1.0.0
 */

import { getLLMClient } from '../../lib/llm/client-factory.js';
import {
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance,
  formatObjectives
} from './prd-business-logic.mjs';

// =============================================================================
// LLM CONFIGURATION
// =============================================================================

export const LLM_PRD_CONFIG = {
  temperature: 0.6,   // Lower for structured PRD content
  maxTokens: 32000,   // Extended for comprehensive PRD generation
  enabled: process.env.LLM_PRD_GENERATION !== 'false'
};

// =============================================================================
// QUALITY RUBRIC (Embedded in LLM prompts)
// =============================================================================

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

// =============================================================================
// LLM CLIENT
// =============================================================================

/**
 * Get LLM client from factory for PRD generation
 * Uses factory-resolved model for PLAN phase
 */
async function getPRDLLMClient() {
  if (!LLM_PRD_CONFIG.enabled) {
    return null;
  }

  try {
    const client = await getLLMClient({
      purpose: 'prd-generation',
      subAgent: 'PRD',
      phase: 'PLAN'
    });
    return client;
  } catch (error) {
    console.warn(`⚠️ LLM client unavailable: ${error.message}`);
    return null;
  }
}

/**
 * Check if LLM generation is available
 */
export function isLLMAvailable() {
  return LLM_PRD_CONFIG.enabled;
}

// =============================================================================
// PRD CONTENT GENERATION
// =============================================================================

/**
 * Generate PRD content using LLM
 * @param {object} sd - Strategic Directive data
 * @param {object} context - Additional context (personas, components, etc.)
 * @returns {Promise<object>} Generated PRD content
 */
export async function generatePRDContentWithLLM(sd, context = {}) {
  if (!isLLMAvailable()) {
    console.log('⚠️ LLM PRD generation disabled');
    return null;
  }

  const llmClient = await getPRDLLMClient();
  if (!llmClient) {
    console.log('⚠️ LLM client not available');
    return null;
  }

  const contextStr = buildPRDGenerationContext(sd, context);

  const systemPrompt = `You are a senior product manager creating a Product Requirements Document (PRD) for a software development team.

${PRD_QUALITY_RUBRIC_CRITERIA}

CRITICAL INSTRUCTIONS:
1. Generate SPECIFIC, ACTIONABLE content - NO placeholders like "TBD" or "To be defined"
2. Requirements must be testable with clear acceptance criteria
3. Include realistic test scenarios with expected behaviors
4. Identify concrete technical risks with specific mitigations
5. Output valid JSON format

SD Type: ${sd.sd_type || 'feature'}
Category: ${sd.category || 'feature'}`;

  const userPrompt = `Generate a comprehensive PRD for:

STRATEGIC DIRECTIVE:
Title: ${sd.title}
Description: ${sd.description || 'No description provided'}

${contextStr}

Generate a JSON object with these fields:
{
  "executive_summary": "2-3 paragraph summary of what, why, and impact",
  "business_context": "Business justification and value proposition",
  "technical_context": "Technical landscape, constraints, and integration points",
  "functional_requirements": [
    {
      "id": "FR-1",
      "requirement": "Specific requirement",
      "description": "Detailed description",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "acceptance_criteria": ["Criterion 1", "Criterion 2"]
    }
  ],
  "non_functional_requirements": [
    {"type": "performance|security|scalability", "requirement": "Requirement", "target_metric": "Metric"}
  ],
  "system_architecture": "Detailed architecture description with components and data flow",
  "implementation_approach": "Phased implementation plan",
  "test_scenarios": [
    {"id": "TS-1", "scenario": "Name", "description": "What to test", "expected_result": "Expected outcome", "test_type": "unit|integration|e2e"}
  ],
  "risks": [
    {"category": "Technical", "risk": "Risk description", "severity": "LOW|MEDIUM|HIGH", "probability": "LOW|MEDIUM|HIGH", "impact": "Impact", "mitigation": "Mitigation"}
  ],
  "acceptance_criteria": ["Criterion 1", "Criterion 2", "Criterion 3"]
}`;

  try {
    console.log('🤖 Generating PRD content with LLM...');
    const response = await llmClient.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: LLM_PRD_CONFIG.temperature,
      max_completion_tokens: LLM_PRD_CONFIG.maxTokens,  // Updated from deprecated max_tokens
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('⚠️ No content in LLM response');
      return null;
    }

    const parsed = JSON.parse(content);
    console.log('✅ LLM PRD content generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ LLM PRD generation failed:', error.message);
    return null;
  }
}

/**
 * Build comprehensive context string for PRD generation
 * Includes ALL available SD metadata for thorough PRD generation
 * @param {object} sd - Strategic Directive
 * @param {object} context - Additional context (analyses, personas, stories)
 * @returns {string} Formatted context string
 */
export function buildPRDGenerationContext(sd, context = {}) {
  const sections = [];

  // 1. Strategic Directive Context - COMPREHENSIVE
  sections.push(`## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sd.id || sd.sd_key}
**SD Key**: ${sd.sd_key || 'N/A'}
**Title**: ${sd.title || 'Untitled'}
**Type**: ${sd.sd_type || 'feature'}
**Category**: ${sd.category || 'Not specified'}
**Priority**: ${sd.priority || 'Not specified'}
**Status**: ${sd.status || 'draft'}

### Description
${sd.description || 'No description provided'}

### Scope
${sd.scope || 'No scope defined'}

### Rationale
${sd.rationale || 'No rationale provided'}

### Strategic Objectives
${formatObjectives(sd.strategic_objectives)}

### Success Criteria
${formatArrayField(sd.success_criteria, 'success criterion')}

### Key Changes
${formatArrayField(sd.key_changes, 'key change')}

### Success Metrics
${formatArrayField(sd.success_metrics, 'success metric')}

### Dependencies
${formatArrayField(sd.dependencies, 'dependency')}

### Risks
${formatRisks(sd.risks)}

### Target Application
${sd.target_application || 'EHG_Engineer'}`);

  // 2. SD Metadata (contains vision specs, governance, etc.)
  if (sd.metadata && Object.keys(sd.metadata).length > 0) {
    sections.push(`## SD METADATA (Extended Context)

${formatMetadata(sd.metadata)}`);
  }

  // 3. Design Analysis (if available)
  if (context.designAnalysis) {
    sections.push(`## DESIGN ANALYSIS (from DESIGN sub-agent)

${typeof context.designAnalysis === 'string'
  ? context.designAnalysis.substring(0, 5000)
  : JSON.stringify(context.designAnalysis, null, 2).substring(0, 5000)}`);
  }

  // 4. Database Analysis (if available)
  if (context.databaseAnalysis) {
    sections.push(`## DATABASE ANALYSIS (from DATABASE sub-agent)

${typeof context.databaseAnalysis === 'string'
  ? context.databaseAnalysis.substring(0, 5000)
  : JSON.stringify(context.databaseAnalysis, null, 2).substring(0, 5000)}`);
  }

  // 5. Security Analysis (if available)
  if (context.securityAnalysis) {
    sections.push(`## SECURITY ANALYSIS (from SECURITY sub-agent)

${typeof context.securityAnalysis === 'string'
  ? context.securityAnalysis.substring(0, 4000)
  : JSON.stringify(context.securityAnalysis, null, 2).substring(0, 4000)}`);
  }

  // 6. Risk Analysis (if available)
  if (context.riskAnalysis) {
    sections.push(`## RISK ANALYSIS (from RISK sub-agent)

${typeof context.riskAnalysis === 'string'
  ? context.riskAnalysis.substring(0, 4000)
  : JSON.stringify(context.riskAnalysis, null, 2).substring(0, 4000)}`);
  }

  // 7. Persona Context (if available)
  if (context.personas && context.personas.length > 0) {
    sections.push(`## STAKEHOLDER PERSONAS

${context.personas.map(p => {
  const details = [`### ${p.name}`];
  if (p.role) details.push(`**Role**: ${p.role}`);
  if (p.description) details.push(`**Description**: ${p.description}`);
  if (p.goals) details.push(`**Goals**: ${Array.isArray(p.goals) ? p.goals.join(', ') : p.goals}`);
  if (p.pain_points) details.push(`**Pain Points**: ${Array.isArray(p.pain_points) ? p.pain_points.join(', ') : p.pain_points}`);
  return details.join('\n');
}).join('\n\n')}`);
  }

  // 8. Vision Spec References (if in metadata)
  if (sd.metadata?.vision_spec_references) {
    sections.push(`## VISION SPECIFICATION REFERENCES

${formatVisionSpecs(sd.metadata.vision_spec_references)}`);
  }

  // 9. Governance Requirements (if in metadata)
  if (sd.metadata?.governance) {
    sections.push(`## GOVERNANCE REQUIREMENTS

${formatGovernance(sd.metadata.governance)}`);
  }

  // 10. Existing User Stories (for consistency)
  if (context.existingStories && context.existingStories.length > 0) {
    sections.push(`## EXISTING USER STORIES (Ensure PRD Consistency)

${context.existingStories.map(story => {
  const lines = [`### ${story.story_key}: ${story.title}`];
  if (story.user_role) lines.push(`**As a** ${story.user_role}`);
  if (story.user_want) lines.push(`**I want** ${story.user_want}`);
  if (story.user_benefit) lines.push(`**So that** ${story.user_benefit}`);
  if (story.acceptance_criteria && story.acceptance_criteria.length > 0) {
    lines.push('\n**Acceptance Criteria**:');
    story.acceptance_criteria.forEach(ac => {
      if (typeof ac === 'string') {
        lines.push(`- ${ac}`);
      } else if (ac.criterion) {
        lines.push(`- ${ac.criterion}`);
      }
    });
  }
  return lines.join('\n');
}).join('\n\n')}`);
  }

  // 11. Generation Instructions
  sections.push(`## TASK - GENERATE COMPREHENSIVE PRD

Using ALL the context above, generate a complete PRD that:
1. Is Implementation-Ready with specific, actionable requirements
2. Aligns with SD Objectives and success criteria
3. Incorporates Sub-Agent Analysis for technical requirements
4. Addresses All Personas and their needs
5. Follows Vision Specs if referenced
6. Identifies Real Risks specific to THIS implementation
7. Defines Testable Criteria for all requirements
8. Is Consistent with User Stories if provided

Return the PRD as a valid JSON object following the schema in the system prompt.`);

  return sections.join('\n\n');
}

export default {
  LLM_PRD_CONFIG,
  PRD_QUALITY_RUBRIC_CRITERIA,
  isLLMAvailable,
  generatePRDContentWithLLM,
  buildPRDGenerationContext
};
