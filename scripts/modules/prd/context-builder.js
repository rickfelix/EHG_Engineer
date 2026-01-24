/**
 * PRD Context Builder
 *
 * Functions for building comprehensive context for PRD generation.
 * Extracted from add-prd-to-database.js for maintainability.
 *
 * Part of SD-LEO-REFACTOR-PRD-001
 */

/**
 * Format array fields for context
 */
export function formatArrayField(arr, itemName) {
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
export function formatRisks(risks) {
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
export function formatMetadata(metadata) {
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
export function formatVisionSpecs(specs) {
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
export function formatGovernance(governance) {
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
export function formatObjectives(objectives) {
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
 * Build comprehensive context string for PRD generation
 * Includes ALL available SD metadata for thorough PRD generation
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
