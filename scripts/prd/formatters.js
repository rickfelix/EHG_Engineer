/**
 * PRD Formatting Functions
 * Format various data structures for PRD content generation
 *
 * Extracted from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 */

/**
 * Format array fields for context
 * @param {Array} arr - Array to format
 * @param {string} itemName - Name of item type for default message
 * @returns {string} Formatted string
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
 * @param {Array} risks - Risks array from SD
 * @returns {string} Formatted risks string
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
 * @param {Object} metadata - SD metadata object
 * @returns {string} Formatted metadata string
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
 * @param {*} specs - Vision spec references
 * @returns {string} Formatted specs string
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
 * @param {Object} governance - Governance object
 * @returns {string} Formatted governance string
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
 * @param {*} objectives - Strategic objectives
 * @returns {string} Formatted objectives string
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
 * Format LLM-generated PRD content into markdown
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data from database
 * @param {Object} llmContent - LLM-generated content
 * @returns {string} Complete PRD markdown
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
*Generated by LLM PRD Content Generation (GPT 5.2)*
*Date: ${new Date().toISOString()}*`);

  return sections.join('\n\n');
}
