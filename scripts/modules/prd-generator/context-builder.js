/**
 * Context Builder for PRD Generator
 * Part of SD-LEO-REFACTOR-PRD-DB-001
 *
 * Builds comprehensive context strings for LLM PRD generation
 */

import {
  formatArrayField,
  formatRisks,
  formatObjectives,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance
} from './format-helpers.js';

/**
 * Build comprehensive context string for PRD generation
 * Includes ALL available SD metadata for thorough PRD generation
 * Also includes existing user stories for consistency
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
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
 * Build design agent prompt
 *
 * @param {string} sdId - SD ID
 * @param {Object} sdData - SD data
 * @param {string} personaContextBlock - Persona context string
 * @returns {string} Design agent prompt
 */
export function buildDesignAgentPrompt(sdId, sdData, personaContextBlock = '') {
  return `Analyze UI/UX design and user workflows for Strategic Directive: ${sdId}

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
}

/**
 * Build database agent prompt
 *
 * @param {string} sdId - SD ID
 * @param {Object} sdData - SD data
 * @param {string} designAnalysis - Design analysis output (optional)
 * @param {string} personaContextBlock - Persona context string
 * @returns {string} Database agent prompt
 */
export function buildDatabaseAgentPrompt(sdId, sdData, designAnalysis = null, personaContextBlock = '') {
  return `Analyze database schema for Strategic Directive: ${sdId}

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
}

/**
 * Build security agent prompt
 *
 * @param {string} sdId - SD ID
 * @param {Object} sdData - SD data
 * @param {string} sdType - SD type
 * @returns {string} Security agent prompt
 */
export function buildSecurityAgentPrompt(sdId, sdData, sdType) {
  return `Analyze security requirements for Strategic Directive: ${sdId}

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
}

/**
 * Build risk agent prompt
 *
 * @param {string} sdId - SD ID
 * @param {Object} sdData - SD data
 * @param {string} sdType - SD type
 * @returns {string} Risk agent prompt
 */
export function buildRiskAgentPrompt(sdId, sdData, sdType) {
  return `Analyze implementation risks for Strategic Directive: ${sdId}

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
}
