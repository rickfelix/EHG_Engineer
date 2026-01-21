/**
 * LLM-Based PRD Content Generation
 * Uses GPT to generate actual PRD content instead of placeholder text
 *
 * Extracted from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 */

import OpenAI from 'openai';
import { LLM_PRD_CONFIG, buildSystemPrompt } from './config.js';
import {
  formatObjectives,
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance
} from './formatters.js';

/**
 * Generate PRD content using LLM (GPT 5.2)
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
  const sdType = sd.sd_type || sd.category || 'feature';

  console.log('   🤖 Generating PRD content with GPT 5.2...');
  console.log(`   📋 SD Type: ${sdType}`);

  try {
    const systemPrompt = buildSystemPrompt(sdType);

    // Build user prompt with context
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
 * Build comprehensive context string for PRD generation
 * Includes ALL available SD metadata for thorough PRD generation
 * Also includes existing user stories for consistency
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context
 * @returns {string} Complete context string for LLM
 */
export function buildPRDGenerationContext(sd, context = {}) {
  const sections = [];

  // 1. Strategic Directive Context - COMPREHENSIVE
  sections.push(`## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sd.id || sd.legacy_id}
**Legacy ID**: ${sd.legacy_id || 'N/A'}
**Title**: ${sd.title || 'Untitled'}
**Type**: ${sd.sd_type || sd.category || 'feature'}
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

This analysis defines the UI/UX requirements and user workflows:

${typeof context.designAnalysis === 'string'
  ? context.designAnalysis.substring(0, 5000)
  : JSON.stringify(context.designAnalysis, null, 2).substring(0, 5000)}`);
  }

  // 4. Database Analysis (if available)
  if (context.databaseAnalysis) {
    sections.push(`## DATABASE ANALYSIS (from DATABASE sub-agent)

This analysis defines schema requirements and data architecture:

${typeof context.databaseAnalysis === 'string'
  ? context.databaseAnalysis.substring(0, 5000)
  : JSON.stringify(context.databaseAnalysis, null, 2).substring(0, 5000)}`);
  }

  // 4.1 Security Analysis (if available)
  if (context.securityAnalysis) {
    sections.push(`## SECURITY ANALYSIS (from SECURITY sub-agent)

This analysis defines authentication, authorization, and security requirements:

${typeof context.securityAnalysis === 'string'
  ? context.securityAnalysis.substring(0, 4000)
  : JSON.stringify(context.securityAnalysis, null, 2).substring(0, 4000)}`);
  }

  // 4.2 Risk Analysis (if available)
  if (context.riskAnalysis) {
    sections.push(`## RISK ANALYSIS (from RISK sub-agent)

This analysis identifies implementation risks and mitigation strategies:

${typeof context.riskAnalysis === 'string'
  ? context.riskAnalysis.substring(0, 4000)
  : JSON.stringify(context.riskAnalysis, null, 2).substring(0, 4000)}`);
  }

  // 5. Persona Context (if available)
  if (context.personas && context.personas.length > 0) {
    sections.push(`## STAKEHOLDER PERSONAS

These personas represent the users who will interact with this feature:

${context.personas.map(p => {
  const details = [];
  details.push(`### ${p.name}`);
  if (p.role) details.push(`**Role**: ${p.role}`);
  if (p.description) details.push(`**Description**: ${p.description}`);
  if (p.goals) details.push(`**Goals**: ${Array.isArray(p.goals) ? p.goals.join(', ') : p.goals}`);
  if (p.pain_points) details.push(`**Pain Points**: ${Array.isArray(p.pain_points) ? p.pain_points.join(', ') : p.pain_points}`);
  return details.join('\n');
}).join('\n\n')}`);
  }

  // 6. Vision Spec References (if in metadata)
  if (sd.metadata?.vision_spec_references) {
    sections.push(`## VISION SPECIFICATION REFERENCES

${formatVisionSpecs(sd.metadata.vision_spec_references)}`);
  }

  // 7. Governance Requirements (if in metadata)
  if (sd.metadata?.governance) {
    sections.push(`## GOVERNANCE REQUIREMENTS

${formatGovernance(sd.metadata.governance)}`);
  }

  // 8. Existing User Stories (for consistency if PRD being regenerated)
  if (context.existingStories && context.existingStories.length > 0) {
    sections.push(`## EXISTING USER STORIES (Ensure PRD Consistency)

The following user stories already exist for this SD. The PRD MUST be consistent with these stories:

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

  // 9. Generation Instructions - Comprehensive
  sections.push(`## TASK - GENERATE COMPREHENSIVE PRD

Using ALL the context above, generate a complete PRD that:

1. **Is Implementation-Ready**: Every requirement must be specific enough for a developer to implement immediately without asking clarifying questions
2. **Aligns with SD Objectives**: Each requirement must trace back to a strategic objective or success criterion
3. **Incorporates Sub-Agent Analysis**: Use the design and database analysis to inform technical requirements and architecture
4. **Addresses All Personas**: Ensure requirements cover the needs of identified stakeholders
5. **Follows Vision Specs**: If vision spec references exist, ensure PRD aligns with those specifications
6. **Identifies Real Risks**: Document genuine technical and business risks specific to THIS implementation
7. **Defines Testable Criteria**: Every acceptance criterion must be verifiable through automated or manual testing
8. **Consistent with User Stories**: If existing user stories are provided, the PRD functional requirements MUST support and align with those stories. Do not contradict user story acceptance criteria.

### Minimum Content Requirements:
- At least 5 functional requirements with acceptance criteria
- At least 3 technical requirements
- At least 5 test scenarios covering happy path, edge cases, and error conditions
- At least 3 identified risks with mitigation strategies
- Complete system architecture with components and data flow

Return the PRD as a valid JSON object following the schema in the system prompt.`);

  return sections.join('\n\n');
}
