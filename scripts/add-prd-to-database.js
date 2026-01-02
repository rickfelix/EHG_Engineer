#!/usr/bin/env node

/**
 * Add PRD to database
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with:
 * - Auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * - Semantic component recommendations with explainable AI
 *
 * Part of Phase 3.2: User story validation enforcement
 * Part of Semantic Component Selector: PRD enhancement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';
import { getComponentRecommendations, formatForPRD, generateInstallScript } from '../lib/shadcn-semantic-explainable-selector.js';
import {
  autoDetectSdType,
  shouldSkipCodeValidation as _shouldSkipCodeValidation,
  getValidationRequirements
} from '../lib/utils/sd-type-validation.js';
import {
  extractPersonasFromSD,
  isPersonaIngestionEnabled,
  isPersonaPromptInjectionEnabled,
  isPersonaSoftGateEnabled,
  isVisionBriefApproved,
  buildPersonaContextString
} from './lib/persona-extractor.js';
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// LLM-BASED PRD CONTENT GENERATION (v1.0.0)
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses GPT 5.2 to generate actual PRD content instead of placeholder text.
// This addresses NC-PLAN-005 (No Placeholder Requirements) systemically.
//
// Key Features:
// - SD-aware generation based on sd_type (feature, database, infrastructure, etc.)
// - Incorporates DESIGN and DATABASE sub-agent analysis
// - Embeds PRD quality rubric criteria so LLM knows scoring dimensions
// - Produces implementation-ready requirements, not boilerplate
//
// ═══════════════════════════════════════════════════════════════════════════

const LLM_PRD_CONFIG = {
  model: 'gpt-5.2',  // Same capable model used for story generation
  temperature: 0.6,   // Slightly lower for more structured PRD content
  maxTokens: 32000,   // Extended for comprehensive PRD generation (user requested)
  enabled: process.env.LLM_PRD_GENERATION !== 'false'  // Enabled by default
};

/**
 * PRD Quality Rubric Criteria for LLM context injection
 *
 * This is embedded in the LLM prompt so it generates content that will pass
 * the Russian Judge quality validation.
 */
const PRD_QUALITY_RUBRIC_CRITERIA = `
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
 * Generate PRD content using LLM (GPT 5.2)
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
 * @returns {Promise<Object|null>} Generated PRD content or null if failed
 */
async function generatePRDContentWithLLM(sd, context = {}) {
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
    const systemPrompt = `You are a Technical Product Manager creating a Product Requirements Document (PRD) for a software engineering team.

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
 */
function buildPRDGenerationContext(sd, context = {}) {
  // Note: User stories are passed in context.existingStories if available
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

  // 3. Design Analysis (if available) - Extended
  if (context.designAnalysis) {
    sections.push(`## DESIGN ANALYSIS (from DESIGN sub-agent)

This analysis defines the UI/UX requirements and user workflows:

${typeof context.designAnalysis === 'string'
  ? context.designAnalysis.substring(0, 5000)
  : JSON.stringify(context.designAnalysis, null, 2).substring(0, 5000)}`);
  }

  // 4. Database Analysis (if available) - Extended
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

  // 5. Persona Context (if available) - Extended
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

/**
 * Format array fields for context
 */
function formatArrayField(arr, itemName) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return `- No ${itemName}s defined`;
  }
  return arr.map((item, i) => {
    if (typeof item === 'string') return `${i + 1}. ${item}`;
    return `${i + 1}. ${item.text || item.description || item.name || JSON.stringify(item)}`;
  }).join('\n');
}

/**
 * Format risks for context
 */
function formatRisks(risks) {
  if (!risks || !Array.isArray(risks) || risks.length === 0) {
    return '- No risks identified';
  }
  return risks.map((risk, i) => {
    if (typeof risk === 'string') return `${i + 1}. ${risk}`;
    const parts = [`${i + 1}. ${risk.risk || risk.description || risk.name || 'Unknown risk'}`];
    if (risk.mitigation) parts.push(`   Mitigation: ${risk.mitigation}`);
    if (risk.probability) parts.push(`   Probability: ${risk.probability}`);
    if (risk.impact) parts.push(`   Impact: ${risk.impact}`);
    return parts.join('\n');
  }).join('\n');
}

/**
 * Format metadata for context - extracts important fields
 */
function formatMetadata(metadata) {
  const sections = [];

  // Skip deeply nested or very long fields
  const skipKeys = ['vision_spec_references', 'governance', 'vision_discovery'];

  for (const [key, value] of Object.entries(metadata)) {
    if (skipKeys.includes(key)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      sections.push(`**${key}**: ${value}`);
    } else if (Array.isArray(value)) {
      sections.push(`**${key}**: ${value.slice(0, 5).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}${value.length > 5 ? '...' : ''}`);
    } else if (typeof value === 'object') {
      // Shallow representation for objects
      const objStr = JSON.stringify(value, null, 2).substring(0, 500);
      sections.push(`**${key}**:\n\`\`\`json\n${objStr}\n\`\`\``);
    }
  }

  return sections.join('\n\n') || 'No additional metadata';
}

/**
 * Format vision spec references
 */
function formatVisionSpecs(specs) {
  if (!specs) return 'No vision specs referenced';

  if (Array.isArray(specs)) {
    return specs.map((spec, i) => {
      if (typeof spec === 'string') return `${i + 1}. ${spec}`;
      return `${i + 1}. ${spec.name || spec.path || JSON.stringify(spec)}`;
    }).join('\n');
  }

  if (typeof specs === 'object') {
    return Object.entries(specs).map(([key, value]) => `- **${key}**: ${value}`).join('\n');
  }

  return String(specs);
}

/**
 * Format governance requirements
 */
function formatGovernance(governance) {
  if (!governance) return 'No governance requirements';

  const parts = [];

  if (governance.strangler_pattern !== undefined) {
    parts.push(`**Strangler Pattern**: ${governance.strangler_pattern ? 'Enabled' : 'Disabled'}`);
  }
  if (governance.workflow_policies) {
    parts.push(`**Workflow Policies**: ${JSON.stringify(governance.workflow_policies)}`);
  }
  if (governance.creation_mode) {
    parts.push(`**Creation Mode**: ${governance.creation_mode}`);
  }

  return parts.join('\n') || JSON.stringify(governance, null, 2);
}

/**
 * Format strategic objectives for context
 */
function formatObjectives(objectives) {
  if (!objectives) return '- No objectives defined';
  if (Array.isArray(objectives)) {
    return objectives.map((obj, i) => {
      if (typeof obj === 'string') return `${i + 1}. ${obj}`;
      return `${i + 1}. ${obj.objective || obj.description || JSON.stringify(obj)}`;
    }).join('\n');
  }
  return JSON.stringify(objectives);
}

/**
 * Format LLM-generated PRD content into markdown
 */
function formatPRDContent(sdId, sdData, llmContent) {
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
*Generated by LLM PRD Content Generation (GPT 5.2)*
*Date: ${new Date().toISOString()}*`);

  return sections.join('\n\n');
}

async function addPRDToDatabase(sdId, prdTitle) {
  console.log(`📋 Adding PRD for ${sdId} to database...\n`);
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key for full access to LEO tables (anon key blocked by RLS on some tables)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Generate PRD ID
  const prdId = `PRD-${sdId}`;
  
  try {
    // First check if table exists
    const { error: checkError } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation')) {
      console.log('❌ Table product_requirements_v2 does not exist!');
      console.log('\n📝 Please create it first by running this SQL in Supabase SQL Editor:');
      console.log('----------------------------------------');
      console.log(`
CREATE TABLE IF NOT EXISTS product_requirements_v2 (
    id VARCHAR(100) PRIMARY KEY,
    directive_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(50) DEFAULT 'draft',
    category VARCHAR(50) DEFAULT 'technical',
    priority VARCHAR(20) DEFAULT 'high',
    executive_summary TEXT,
    plan_checklist JSONB DEFAULT '[]'::jsonb,
    exec_checklist JSONB DEFAULT '[]'::jsonb,
    validation_checklist JSONB DEFAULT '[]'::jsonb,
    progress INTEGER DEFAULT 0,
    phase VARCHAR(50) DEFAULT 'planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'PLAN',
    content TEXT
);
      `);
      console.log('----------------------------------------');
      console.log(`\nGo to: ${supabaseUrl}`);
      console.log('Navigate to: SQL Editor → New Query');
      console.log('Paste the SQL above and click "Run"');
      process.exit(1);
    }

    // SD ID SCHEMA CLEANUP (2025-12-12):
    // - strategic_directives_v2.id is the canonical identifier (PRIMARY KEY)
    // - uuid_id column is DEPRECATED - do not use for FK relationships
    // - product_requirements_v2.sd_id references strategic_directives_v2.id
    //
    // Query supports both legacy_id (SD-XXX-001) and UUID formats.
    // The SD's "id" column is used for the PRD's sd_id foreign key.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'legacy_id';

    // Fetch ALL SD fields for comprehensive PRD generation
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, scope, description, strategic_objectives, title, sd_type, category, metadata, target_application, priority, status, rationale, success_criteria, key_changes, dependencies, risks, strategic_intent, success_metrics')
      .eq(queryField, sdId)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${sdId} not found in database`);
      console.log('   Create SD first before creating PRD');
      process.exit(1);
    }

    // Use SD.id (the primary key) for FK relationships
    const sdIdValue = sdData.id;
    console.log(`   SD ID: ${sdIdValue}`);
    console.log(`   SD legacy_id: ${sdData.legacy_id}`);

    // SD-TECH-DEBT-DOCS-001: Auto-detect sd_type and warn if documentation-only
    const typeDetection = autoDetectSdType(sdData);
    const currentSdType = sdData.sd_type || 'feature';

    console.log(`   SD Type (current): ${currentSdType}`);
    console.log(`   SD Type (detected): ${typeDetection.sd_type} (${typeDetection.confidence}% confidence)`);

    // Check for sd_type mismatch
    if (typeDetection.detected && typeDetection.sd_type !== currentSdType && typeDetection.confidence >= 70) {
      console.log('\n   ⚠️  SD TYPE MISMATCH DETECTED');
      console.log(`      Current: ${currentSdType}`);
      console.log(`      Detected: ${typeDetection.sd_type}`);
      console.log(`      Reason: ${typeDetection.reason}`);

      // Auto-update sd_type if confidence is high enough
      if (typeDetection.confidence >= 80) {
        console.log(`\n   🔄 Auto-updating sd_type to '${typeDetection.sd_type}'...`);
        const { error: updateError } = await supabase
          .from('strategic_directives_v2')
          .update({ sd_type: typeDetection.sd_type })
          .eq('id', sdId);

        if (updateError) {
          console.log(`   ⚠️  Failed to update sd_type: ${updateError.message}`);
        } else {
          console.log(`   ✅ Updated sd_type to '${typeDetection.sd_type}'`);
          sdData.sd_type = typeDetection.sd_type;  // Update local reference
        }
      } else {
        console.log('\n   💡 Consider manually setting sd_type:');
        console.log(`      UPDATE strategic_directives_v2 SET sd_type = '${typeDetection.sd_type}' WHERE id = '${sdId}';`);
      }
    }

    // Warn if documentation-only SD is going through full workflow
    const validationReqs = getValidationRequirements(sdData);
    if (validationReqs.skipCodeValidation) {
      console.log('\n   ⚠️  DOCUMENTATION-ONLY SD DETECTED');
      console.log('      This SD does NOT require code validation (TESTING/GITHUB)');
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('\n   💡 Consider using Quick Fix workflow for documentation-only tasks:');
      console.log('      /quick-fix [describe the documentation task]');
    }

    // ═══════════════════════════════════════════════════════════
    // PERSONA INGESTION (Vision Discovery Pipeline)
    // ═══════════════════════════════════════════════════════════
    let stakeholderPersonas = [];
    let personaSource = 'disabled';

    if (isPersonaIngestionEnabled()) {
      const personaResult = extractPersonasFromSD(sdData);
      stakeholderPersonas = personaResult.personas;
      personaSource = personaResult.source;

      if (personaResult.source === 'metadata') {
        console.log(`\n   👥 PERSONA_INGESTION: found ${personaResult.count} personas in SD.metadata`);
        stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
      } else if (personaResult.source === 'defaults') {
        console.log(`\n   👥 PERSONA_INGESTION: using ${personaResult.count} defaults (reason: missing/empty in metadata)`);
        stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
      }
    } else {
      console.log('\n   ℹ️  PERSONA_INGESTION: disabled via PERSONA_INGESTION_ENABLED=false');
    }

    // ═══════════════════════════════════════════════════════════
    // SOFT GATE: Feature SDs require approved vision brief
    // ═══════════════════════════════════════════════════════════
    const effectiveSdType = sdData.sd_type || 'unknown';
    const hasRealPersonas = personaSource === 'metadata'; // From SD.metadata, not auto-generated defaults
    const briefApproved = isVisionBriefApproved(sdData);
    const skipVisionBrief = process.argv.includes('--skip-vision-brief');

    // Gate requires: soft gate enabled + ingestion enabled + feature type
    // Must have BOTH: real personas from metadata AND approved vision brief
    if (isPersonaSoftGateEnabled() && isPersonaIngestionEnabled() && effectiveSdType === 'feature') {
      const gatePass = hasRealPersonas && briefApproved;

      if (!gatePass && !skipVisionBrief) {
        console.log('\n   ⚠️  PERSONA SOFT GATE: Feature SD requires approved vision brief');

        if (!hasRealPersonas) {
          // Case 1: No persona payload at all
          console.log('      No persona payload found in SD.metadata.vision_discovery');
          console.log('      Feature SDs benefit from stakeholder personas for better PRD quality.\n');
          console.log('   💡 Generate vision brief:');
          console.log('      node scripts/generate-vision-brief.js ' + sdId + ' --confirm\n');
        } else if (!briefApproved) {
          // Case 2: Personas exist but not approved
          const currentStatus = sdData?.metadata?.vision_discovery?.approval?.status || 'unknown';
          console.log(`      Persona payload exists but is not approved (status: ${currentStatus})`);
          console.log('      Chairman must approve vision brief before PRD creation.\n');
          console.log('   💡 Approve vision brief:');
          console.log('      node scripts/approve-vision-brief.js ' + sdId + '\n');
        }

        console.log('   🚫 Blocking PRD creation. To proceed without approval:');
        console.log('      node scripts/add-prd-to-database.js ' + sdId + ' --skip-vision-brief\n');
        process.exit(1);
      } else if (!gatePass && skipVisionBrief) {
        console.log('\n   ⏭️  Proceeding without approved vision brief (--skip-vision-brief flag provided)\n');
      }
    }

    // Create PRD entry
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert({
        id: prdId,
        directive_id: sdId,
        sd_id: sdIdValue,  // Canonical FK to strategic_directives_v2.id
        title: prdTitle || `Product Requirements for ${sdId}`,
        status: 'planning',
        category: 'technical',
        priority: 'high',
        executive_summary: `Product requirements document for Strategic Directive ${sdId}`,
        phase: 'planning',
        created_by: 'PLAN',
        plan_checklist: [
          { text: 'PRD created and saved', checked: true },
          { text: 'SD requirements mapped to technical specs', checked: false },
          { text: 'Technical architecture defined', checked: false },
          { text: 'Implementation approach documented', checked: false },
          { text: 'Test scenarios defined', checked: false },
          { text: 'Acceptance criteria established', checked: false },
          { text: 'Resource requirements estimated', checked: false },
          { text: 'Timeline and milestones set', checked: false },
          { text: 'Risk assessment completed', checked: false }
        ],
        exec_checklist: [
          { text: 'Development environment setup', checked: false },
          { text: 'Core functionality implemented', checked: false },
          { text: 'Unit tests written', checked: false },
          { text: 'Integration tests completed', checked: false },
          { text: 'Code review completed', checked: false },
          { text: 'Documentation updated', checked: false }
        ],
        validation_checklist: [
          { text: 'All acceptance criteria met', checked: false },
          { text: 'Performance requirements validated', checked: false },
          { text: 'Security review completed', checked: false },
          { text: 'User acceptance testing passed', checked: false },
          { text: 'Deployment readiness confirmed', checked: false }
        ],
        acceptance_criteria: [
          'All functional requirements implemented',
          'All tests passing (unit + E2E)',
          'No regressions introduced'
        ],
        functional_requirements: [
          { id: 'FR-1', requirement: 'To be defined based on SD objectives', priority: 'HIGH' },
          { id: 'FR-2', requirement: 'To be defined during planning', priority: 'MEDIUM' },
          { id: 'FR-3', requirement: 'To be defined during technical analysis', priority: 'MEDIUM' }
        ],
        test_scenarios: [
          { id: 'TS-1', scenario: 'To be defined during planning', test_type: 'unit' }
        ],
        progress: 10,
        stakeholders: stakeholderPersonas,
        content: `# Product Requirements Document

## Strategic Directive
${sdId}

## Status
Planning

## Executive Summary
This PRD defines the technical requirements and implementation approach for ${sdId}.

## Functional Requirements
- To be defined based on SD objectives

## Technical Requirements  
- To be defined based on technical analysis

## Implementation Approach
- To be defined by EXEC agent

## Test Scenarios
- To be defined during planning

## Acceptance Criteria
- To be defined based on success metrics
`
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  PRD ${prdId} already exists in database`);
      } else {
        console.error('❌ Database insert error:', error.message);
      }
      process.exit(1);
    }
    
    console.log(`✅ ${prdId} added to database successfully!`);
    console.log('Database record:', JSON.stringify(data, null, 2));

    // ═══════════════════════════════════════════════════════════
    // BUILD PERSONA CONTEXT FOR SUB-AGENT PROMPTS
    // ═══════════════════════════════════════════════════════════
    let personaContextBlock = '';

    if (isPersonaPromptInjectionEnabled() && stakeholderPersonas.length > 0) {
      const { context, truncated } = buildPersonaContextString(stakeholderPersonas);
      personaContextBlock = context;

      if (truncated) {
        console.log('\n   ⚠️  PERSONA_PROMPT_INJECTION: context truncated (exceeded max length)');
      } else {
        console.log(`\n   ✅ PERSONA_PROMPT_INJECTION: built context for ${stakeholderPersonas.length} personas`);
      }
    } else if (!isPersonaPromptInjectionEnabled()) {
      console.log('\n   ℹ️  PERSONA_PROMPT_INJECTION: disabled via PERSONA_PROMPT_INJECTION_ENABLED=false');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: DESIGN ANALYSIS (UI/UX workflows → informs user stories)
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 PHASE 1: DESIGN ANALYSIS');
    console.log('═══════════════════════════════════════════════════');

    let designAnalysis = null;
    let databaseAnalysis = null;  // Capture for LLM PRD generation
    let securityAnalysis = null;  // Capture for LLM PRD generation
    let _apiAnalysis = null;       // Capture for LLM PRD generation
    let riskAnalysis = null;      // Capture for LLM PRD generation

    try {
      console.log('🔍 Invoking DESIGN sub-agent to analyze UI/UX workflows...\n');

      const { execSync } = await import('child_process');

      // Prepare comprehensive context for design agent (with full SD metadata)
      const designPrompt = `Analyze UI/UX design and user workflows for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id || sdId}
**Legacy ID**: ${sdData.legacy_id || 'N/A'}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Category**: ${sdData.category || 'Not specified'}
**Priority**: ${sdData.priority || 'Not specified'}

**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Success Criteria**:
${formatArrayField(sdData.success_criteria, 'criterion')}

**Key Changes**:
${formatArrayField(sdData.key_changes, 'change')}

**Success Metrics**:
${formatArrayField(sdData.success_metrics, 'metric')}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks**:
${formatRisks(sdData.risks)}

**Target Application**: ${sdData.target_application || 'EHG_Engineer'}

${sdData.metadata ? `## SD METADATA (Extended Context)\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
**Task**:
1. Identify user workflows and interaction patterns
2. Determine UI components and layouts needed
3. Analyze user journey and navigation flows
4. Identify data that users will view/create/edit
5. Determine what user actions trigger database changes

**Output Format**:
{
  "user_workflows": [
    {
      "workflow_name": "Workflow 1",
      "steps": ["step1", "step2"],
      "user_actions": ["create", "edit", "delete"],
      "data_displayed": ["field1", "field2"],
      "data_modified": ["field1", "field2"]
    }
  ],
  "ui_components_needed": ["component1", "component2"],
  "user_journey": "Description of user flow",
  "data_requirements": {
    "fields_to_display": ["field1", "field2"],
    "fields_to_edit": ["field1"],
    "relationships": ["parent_entity -> child_entity"]
  }
}

Please analyze user workflows and design requirements.`;

      // Write prompt to temp file
      const fs = await import('fs');
      const path = await import('path');
      const designPromptFile = path.join('/tmp', `design-agent-prompt-${Date.now()}.txt`);
      fs.writeFileSync(designPromptFile, designPrompt);

      console.log('📝 Prompt written to:', designPromptFile);
      console.log('\n🤖 Executing DESIGN sub-agent...\n');

      // Execute design sub-agent
      const designOutput = execSync(
        `node lib/sub-agent-executor.js DESIGN --context-file "${designPromptFile}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000
        }
      );

      console.log('✅ Design analysis complete!\n');
      console.log('─────────────────────────────────────────────────');
      console.log(designOutput);
      console.log('─────────────────────────────────────────────────\n');

      designAnalysis = designOutput;

      // Clean up temp file
      fs.unlinkSync(designPromptFile);

    } catch (error) {
      console.warn('⚠️  Design analysis failed:', error.message);
      console.log('   Continuing with manual design review...\n');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: DATABASE SCHEMA ANALYSIS (based on design + user stories)
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 PHASE 2: DATABASE SCHEMA ANALYSIS');
    console.log('═══════════════════════════════════════════════════');

    try {
      console.log('🔍 Invoking DATABASE sub-agent to analyze schema and recommend changes...\n');

      const { execSync } = await import('child_process');

      // Prepare comprehensive context for database agent (with full SD metadata)
      const dbAgentPrompt = `Analyze database schema for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id || sdId}
**Legacy ID**: ${sdData.legacy_id || 'N/A'}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Category**: ${sdData.category || 'Not specified'}
**Priority**: ${sdData.priority || 'Not specified'}

**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Success Criteria**:
${formatArrayField(sdData.success_criteria, 'criterion')}

**Key Changes**:
${formatArrayField(sdData.key_changes, 'change')}

**Success Metrics**:
${formatArrayField(sdData.success_metrics, 'metric')}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks**:
${formatRisks(sdData.risks)}

**Target Application**: ${sdData.target_application || 'EHG_Engineer'}

${sdData.metadata ? `## SD METADATA (Extended Context)\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
${designAnalysis ? `
**DESIGN ANALYSIS CONTEXT** (from DESIGN sub-agent):
${designAnalysis}

Use this design analysis to understand:
- What data users will view/create/edit (drives table structure)
- User workflows and actions (drives CRUD requirements)
- UI component data needs (drives column selection)
- Data relationships (drives foreign keys and joins)
` : ''}

**Task**:
1. Review the EHG_Engineer database schema documentation at docs/reference/schema/engineer/database-schema-overview.md
2. ${designAnalysis ? 'Based on design analysis, ' : ''}Identify which tables will be affected by this SD
3. Recommend specific database changes (new tables, new columns, modified columns, new RLS policies)
4. ${designAnalysis ? 'Ensure schema supports all user workflows identified in design analysis' : 'Provide technical_approach recommendations for database integration'}
5. List any schema dependencies or constraints to be aware of

**Output Format**:
{
  "affected_tables": ["table1", "table2"],
  "new_tables": [
    {
      "name": "table_name",
      "purpose": "description",
      "key_columns": ["col1", "col2"]
    }
  ],
  "table_modifications": [
    {
      "table": "existing_table",
      "changes": ["add column x", "modify column y"]
    }
  ],
  "rls_policies_needed": ["policy description 1", "policy description 2"],
  "technical_approach": "Detailed technical approach for database integration",
  "dependencies": ["dependency 1", "dependency 2"],
  "migration_complexity": "LOW|MEDIUM|HIGH",
  "estimated_migration_lines": 50
}

Please analyze and provide structured recommendations.`;

      // Write prompt to temp file
      const fs = await import('fs');
      const path = await import('path');
      const promptFile = path.join('/tmp', `db-agent-prompt-${Date.now()}.txt`);
      fs.writeFileSync(promptFile, dbAgentPrompt);

      console.log('📝 Prompt written to:', promptFile);
      console.log('\n🤖 Executing DATABASE sub-agent...\n');

      // Execute database sub-agent
      const dbAgentOutput = execSync(
        `node lib/sub-agent-executor.js DATABASE --context-file "${promptFile}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 120000 // 2 minute timeout
        }
      );

      console.log('✅ Database sub-agent analysis complete!\n');
      console.log('─────────────────────────────────────────────────');
      console.log(dbAgentOutput);
      console.log('─────────────────────────────────────────────────\n');

      // Capture for LLM PRD generation
      databaseAnalysis = dbAgentOutput;

      // Parse output to extract recommendations (if structured output available)
      // For now, we'll store the full output in PRD metadata
      const { error: updateError } = await supabase
        .from('product_requirements_v2')
        .update({
          metadata: {
            ...(data.metadata || {}),
            design_analysis: designAnalysis ? {
              generated_at: new Date().toISOString(),
              sd_context: {
                id: sdId,
                title: sdData.title,
                scope: sdData.scope
              },
              raw_analysis: designAnalysis.substring(0, 5000) // Store first 5000 chars
            } : null,
            database_analysis: {
              generated_at: new Date().toISOString(),
              sd_context: {
                id: sdId,
                title: sdData.title,
                scope: sdData.scope
              },
              raw_analysis: dbAgentOutput.substring(0, 5000), // Store first 5000 chars
              design_informed: designAnalysis ? true : false
            }
          }
        })
        .eq('id', prdId);

      if (updateError) {
        console.warn('⚠️  Failed to update PRD with analyses:', updateError.message);
      } else {
        console.log('✅ PRD updated with design + database schema analyses\n');
      }

      // Clean up temp file
      fs.unlinkSync(promptFile);

    } catch (error) {
      console.warn('⚠️  Database schema analysis failed:', error.message);
      console.log('   Continuing with manual schema review...\n');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2.1: SECURITY ANALYSIS (for security-related SDs)
    // ═══════════════════════════════════════════════════════════
    const sdType = sdData.sd_type || sdData.category || 'feature';
    const needsSecurity = sdType === 'security' ||
                         sdData.scope?.toLowerCase().includes('auth') ||
                         sdData.scope?.toLowerCase().includes('security') ||
                         sdData.description?.toLowerCase().includes('permission') ||
                         sdData.description?.toLowerCase().includes('rls');

    if (needsSecurity) {
      console.log('\n═══════════════════════════════════════════════════');
      console.log('🔒 PHASE 2.1: SECURITY ANALYSIS');
      console.log('═══════════════════════════════════════════════════');

      try {
        console.log('🔍 Invoking SECURITY sub-agent to analyze security requirements...\n');

        const { execSync } = await import('child_process');
        const fs = await import('fs');
        const path = await import('path');

        const securityPrompt = `Analyze security requirements for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - SECURITY ANALYSIS CONTEXT

**ID**: ${sdData.id || sdId}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdType}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}

**Task**:
1. Identify authentication requirements (login flows, session management)
2. Analyze authorization needs (roles, permissions, RLS policies)
3. Identify data access boundaries and sensitivity levels
4. Recommend security test scenarios
5. Identify potential security risks and mitigations

**Output Format**:
{
  "auth_requirements": ["requirement1", "requirement2"],
  "authorization_model": {
    "roles": ["role1", "role2"],
    "permissions": ["permission1", "permission2"],
    "rls_policies_needed": ["policy1", "policy2"]
  },
  "data_sensitivity": {
    "sensitive_fields": ["field1", "field2"],
    "protection_mechanisms": ["encryption", "masking"]
  },
  "security_test_scenarios": ["scenario1", "scenario2"],
  "security_risks": [
    {
      "risk": "risk description",
      "mitigation": "mitigation strategy"
    }
  ]
}`;

        const securityPromptFile = path.join('/tmp', `security-agent-prompt-${Date.now()}.txt`);
        fs.writeFileSync(securityPromptFile, securityPrompt);

        console.log('📝 Prompt written to:', securityPromptFile);
        console.log('\n🤖 Executing SECURITY sub-agent...\n');

        const securityOutput = execSync(
          `node lib/sub-agent-executor.js SECURITY --context-file "${securityPromptFile}"`,
          {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 120000
          }
        );

        console.log('✅ Security analysis complete!\n');
        console.log('─────────────────────────────────────────────────');
        console.log(securityOutput);
        console.log('─────────────────────────────────────────────────\n');

        securityAnalysis = securityOutput;
        fs.unlinkSync(securityPromptFile);

      } catch (error) {
        console.warn('⚠️  Security analysis failed:', error.message);
        console.log('   Continuing without security analysis...\n');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2.2: RISK ANALYSIS (for all SDs - 10% of PRD quality score)
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('⚠️  PHASE 2.2: RISK ANALYSIS');
    console.log('═══════════════════════════════════════════════════');

    try {
      console.log('🔍 Invoking RISK sub-agent to assess implementation risks...\n');

      const { execSync } = await import('child_process');
      const fs = await import('fs');
      const path = await import('path');

      const riskPrompt = `Analyze implementation risks for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - RISK ANALYSIS CONTEXT

**ID**: ${sdData.id || sdId}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdType}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks from SD**:
${formatRisks(sdData.risks)}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}

**Task**:
1. Identify technical implementation risks specific to this SD
2. Assess probability and impact of each risk
3. Propose concrete mitigation strategies
4. Define rollback plans for critical changes
5. Suggest monitoring strategies to detect issues early

**Output Format**:
{
  "technical_risks": [
    {
      "risk": "specific risk description",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "HIGH|MEDIUM|LOW",
      "mitigation": "concrete mitigation strategy",
      "rollback_plan": "rollback approach if this fails",
      "monitoring": "how to detect early warning signs"
    }
  ],
  "dependency_risks": ["risk from dependency 1"],
  "timeline_risks": ["potential delays"],
  "overall_risk_level": "HIGH|MEDIUM|LOW"
}`;

      const riskPromptFile = path.join('/tmp', `risk-agent-prompt-${Date.now()}.txt`);
      fs.writeFileSync(riskPromptFile, riskPrompt);

      console.log('📝 Prompt written to:', riskPromptFile);
      console.log('\n🤖 Executing RISK sub-agent...\n');

      const riskOutput = execSync(
        `node lib/sub-agent-executor.js RISK --context-file "${riskPromptFile}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000
        }
      );

      console.log('✅ Risk analysis complete!\n');
      console.log('─────────────────────────────────────────────────');
      console.log(riskOutput);
      console.log('─────────────────────────────────────────────────\n');

      riskAnalysis = riskOutput;
      fs.unlinkSync(riskPromptFile);

    } catch (error) {
      console.warn('⚠️  Risk analysis failed:', error.message);
      console.log('   Continuing without risk analysis...\n');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: LLM-BASED PRD CONTENT GENERATION
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🧠 PHASE 3: LLM-BASED PRD CONTENT GENERATION');
    console.log('═══════════════════════════════════════════════════');

    try {
      // Fetch existing user stories for consistency (if PRD being regenerated)
      let existingStories = [];
      const { data: storiesData } = await supabase
        .from('user_stories')
        .select('story_key, title, user_role, user_want, user_benefit, acceptance_criteria')
        .eq('sd_id', sdIdValue)
        .order('story_key');

      if (storiesData && storiesData.length > 0) {
        existingStories = storiesData;
        console.log(`   📚 Found ${existingStories.length} existing user stories for consistency`);
      }

      // Generate comprehensive PRD content using GPT 5.2
      // Uses full SD metadata + ALL sub-agent analyses + existing stories for thorough generation
      const llmPrdContent = await generatePRDContentWithLLM(sdData, {
        designAnalysis: designAnalysis,
        databaseAnalysis: databaseAnalysis,
        securityAnalysis: securityAnalysis,
        riskAnalysis: riskAnalysis,
        personas: stakeholderPersonas,
        existingStories: existingStories
      });

      if (llmPrdContent) {
        console.log('\n📝 Updating PRD with LLM-generated content...');

        // Build update object with LLM-generated content
        const prdUpdate = {
          updated_at: new Date().toISOString()
        };

        // Update executive_summary
        if (llmPrdContent.executive_summary) {
          prdUpdate.executive_summary = llmPrdContent.executive_summary;
        }

        // Update functional_requirements
        if (llmPrdContent.functional_requirements && llmPrdContent.functional_requirements.length > 0) {
          prdUpdate.functional_requirements = llmPrdContent.functional_requirements;
        }

        // Update technical_requirements
        if (llmPrdContent.technical_requirements && llmPrdContent.technical_requirements.length > 0) {
          prdUpdate.technical_requirements = llmPrdContent.technical_requirements;
        }

        // Update system_architecture
        if (llmPrdContent.system_architecture) {
          prdUpdate.system_architecture = llmPrdContent.system_architecture;
        }

        // Update test_scenarios
        if (llmPrdContent.test_scenarios && llmPrdContent.test_scenarios.length > 0) {
          prdUpdate.test_scenarios = llmPrdContent.test_scenarios;
        }

        // Update acceptance_criteria
        if (llmPrdContent.acceptance_criteria && llmPrdContent.acceptance_criteria.length > 0) {
          prdUpdate.acceptance_criteria = llmPrdContent.acceptance_criteria;
        }

        // Update risks
        if (llmPrdContent.risks && llmPrdContent.risks.length > 0) {
          prdUpdate.risks = llmPrdContent.risks;
        }

        // Update implementation_approach
        if (llmPrdContent.implementation_approach) {
          prdUpdate.implementation_approach = llmPrdContent.implementation_approach;
        }

        // Update content field with formatted PRD
        prdUpdate.content = formatPRDContent(sdId, sdData, llmPrdContent);

        // Mark more checklist items as complete
        prdUpdate.plan_checklist = [
          { text: 'PRD created and saved', checked: true },
          { text: 'SD requirements mapped to technical specs', checked: true },
          { text: 'Technical architecture defined', checked: !!llmPrdContent.system_architecture },
          { text: 'Implementation approach documented', checked: !!llmPrdContent.implementation_approach },
          { text: 'Test scenarios defined', checked: llmPrdContent.test_scenarios?.length > 0 },
          { text: 'Acceptance criteria established', checked: llmPrdContent.acceptance_criteria?.length > 0 },
          { text: 'Resource requirements estimated', checked: false },
          { text: 'Timeline and milestones set', checked: false },
          { text: 'Risk assessment completed', checked: llmPrdContent.risks?.length > 0 }
        ];

        // Calculate progress based on completed items
        const checkedCount = prdUpdate.plan_checklist.filter(item => item.checked).length;
        prdUpdate.progress = Math.round((checkedCount / prdUpdate.plan_checklist.length) * 100);

        const { error: llmUpdateError } = await supabase
          .from('product_requirements_v2')
          .update(prdUpdate)
          .eq('id', prdId);

        if (llmUpdateError) {
          console.warn('   ⚠️  Failed to update PRD with LLM content:', llmUpdateError.message);
        } else {
          console.log('   ✅ PRD updated with LLM-generated content');
          console.log(`   📊 Progress: ${prdUpdate.progress}%`);
          console.log(`   📋 Functional Requirements: ${llmPrdContent.functional_requirements?.length || 0}`);
          console.log(`   🧪 Test Scenarios: ${llmPrdContent.test_scenarios?.length || 0}`);
          console.log(`   ⚠️  Risks Identified: ${llmPrdContent.risks?.length || 0}`);
        }
      } else {
        console.log('   ℹ️  LLM generation skipped or failed, PRD has template content');
        console.log('   💡 PRD content will need manual updates to pass quality validation');
      }

    } catch (llmError) {
      console.warn('⚠️  LLM PRD generation failed:', llmError.message);
      console.log('   Continuing with template PRD content...');
    }

    // Generate semantic component recommendations
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 SEMANTIC COMPONENT RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════');

    try {
      console.log('🔍 Analyzing SD scope and generating component recommendations...\n');

      const { recommendations, summary } = await getComponentRecommendations({
        sdScope: sdData.scope || sdData.title || sdId,
        sdDescription: sdData.description || '',
        sdObjectives: sdData.strategic_objectives || '',
        maxComponents: 8,
        similarityThreshold: 0.65, // Lower threshold to show more options
        supabase
      });

      if (recommendations.length > 0) {
        console.log(`✅ Found ${recommendations.length} component recommendations:\n`);

        recommendations.forEach((rec, idx) => {
          console.log(`${idx + 1}. ${rec.component_name} (${rec.registry_source})`);
          console.log(`   Priority: ${rec.explanation.installation_priority}`);
          console.log(`   Confidence: ${rec.explanation.confidence_percentage}% (${rec.explanation.confidence_tier})`);
          console.log(`   Install: ${rec.install_command}`);
          console.log(`   Reason: ${rec.explanation.reasons.join('; ')}`);
          if (rec.explanation.warnings.length > 0) {
            console.log(`   ⚠️  Warnings: ${rec.explanation.warnings.map(w => w.message).join('; ')}`);
          }
          console.log('');
        });

        // Format for PRD
        const _prdComponents = formatForPRD(recommendations); // Unused: ui_components fields don't exist in schema

        // Update PRD with component recommendations in metadata field
        // NOTE: ui_components and ui_components_summary fields don't exist in schema
        // Store in metadata JSONB field instead
        const { data: currentPrd, error: fetchError } = await supabase
          .from('product_requirements_v2')
          .select('metadata')
          .eq('id', prdId)
          .single();

        if (fetchError) {
          console.warn('⚠️  Failed to fetch PRD for component update:', fetchError.message);
        } else {
          const updatedMetadata = {
            ...(currentPrd.metadata || {}),
            // FIX: ui_components moved to metadata

            // ui_components: prdComponents.ui_components,
            // FIX: ui_components_summary moved to metadata

            // ui_components_summary: prdComponents.ui_components_summary,
            component_recommendations_generated_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase
            .from('product_requirements_v2')
            .update({
              metadata: updatedMetadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', prdId);

          if (updateError) {
            console.warn('⚠️  Failed to update PRD with component recommendations:', updateError.message);
          } else {
            console.log('✅ Component recommendations added to PRD metadata\n');
          }
        }

        // Generate installation script
        const installScript = generateInstallScript(recommendations, ['CRITICAL', 'RECOMMENDED']);
        if (installScript) {
          console.log('📦 Installation Script (Critical + Recommended):');
          console.log('-'.repeat(70));
          console.log(installScript);
          console.log('-'.repeat(70));
          console.log('');
        }

        console.log('Summary:');
        console.log(`- ${summary.breakdown.critical} CRITICAL components`);
        console.log(`- ${summary.breakdown.recommended} RECOMMENDED components`);
        console.log(`- ${summary.breakdown.optional} OPTIONAL components`);

        if (summary.top_recommendation) {
          console.log(`\nTop recommendation: ${summary.top_recommendation.component} (${summary.top_recommendation.confidence}% confidence, ${summary.top_recommendation.priority} priority)`);
        }

      } else {
        console.log('ℹ️  No component recommendations found above confidence threshold');
        console.log(`   Threshold: ${0.65 * 100}%`);
        console.log('   Consider lowering threshold or refining SD description');
      }

    } catch (componentError) {
      console.warn('⚠️  Component recommendation warning:', componentError.message);
      console.log('   PRD created successfully, but component recommendations could not be generated');
      console.log('   This is likely due to:');
      console.log('   - Missing OPENAI_API_KEY in .env');
      console.log('   - component_registry_embeddings table not yet created');
      console.log('   - No components seeded in registry');
    }

    // Auto-invoke ALL PLAN phase sub-agents (Gap #1 Fix - 2026-01-01)
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🤖 AUTO-INVOKE: PLAN Phase Sub-Agents (orchestrate)');
    console.log('═══════════════════════════════════════════════════');

    try {
      // Use orchestrator instead of individual sub-agent calls
      const { orchestrate } = await import('./orchestrate-phase-subagents.js');
      const orchestrationResult = await orchestrate('PLAN_PRD', sdId, {
        autoRemediate: true,
        skipIfExists: true
      });

      if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
        console.log('✅ Sub-agents completed successfully');
        if (orchestrationResult.executed?.length > 0) {
          console.log(`   Executed: ${orchestrationResult.executed.join(', ')}`);
        }
        if (orchestrationResult.skipped?.length > 0) {
          console.log(`   Skipped (already exist): ${orchestrationResult.skipped.join(', ')}`);
        }
      } else if (orchestrationResult.status === 'PARTIAL') {
        console.log('⚠️  Some sub-agents completed with issues');
        console.log(`   Summary: ${JSON.stringify(orchestrationResult.summary || {})}`);
      } else {
        console.log(`⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
        console.log('   Some sub-agents may need manual invocation');
      }
    } catch (orchestrationError) {
      console.error('');
      console.error('⚠️  Sub-agent orchestration failed:', orchestrationError.message);
      console.error('');
      console.error('   SD ID: ' + sdId);
      console.error('   PRD ID: ' + prdId);
      console.error('');
      console.error('   To invoke sub-agents manually, run:');
      console.error(`   node scripts/orchestrate-phase-subagents.js PLAN_PRD ${sdId}`);
      console.error('');
      // Fallback: try just stories for backward compatibility
      try {
        console.log('   Attempting fallback: STORIES sub-agent only...');
        const storiesResult = await autoTriggerStories(supabase, sdId, prdId, {
          skipIfExists: true,
          notifyOnSkip: true,
          logExecution: true,
          personaContext: stakeholderPersonas
        });
        if (storiesResult.executed) {
          console.log('   ✅ Fallback: User stories generated');
        }
      } catch (fallbackError) {
        console.error('   ❌ Fallback also failed:', fallbackError.message);
      }
    }

    console.log('\n📝 Next steps:');
    console.log('1. Review sub-agent results (auto-invoked above)');
    console.log('2. Verify PRD metadata and component recommendations');
    console.log('3. Mark checklist items as complete');
    console.log('4. Run PLAN-TO-EXEC handoff when ready');
    
  } catch (error) {
    console.error('❌ Error adding PRD to database:', error.message);
    process.exit(1);
  }
}

// Get parameters from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]');
  console.log('Example: node scripts/add-prd-to-database.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
  process.exit(1);
}

const sdId = args[0];
const prdTitle = args.slice(1).join(' ');
addPRDToDatabase(sdId, prdTitle);