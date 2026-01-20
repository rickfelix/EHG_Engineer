/**
 * Format Helpers for PRD Generator
 * Part of SD-LEO-REFACTOR-PRD-DB-001
 *
 * Utility functions for formatting SD data into context strings
 */

/**
 * Format array fields for context
 *
 * @param {Array} arr - Array to format
 * @param {string} itemName - Name of items for "no items" message
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
 *
 * @param {Array} risks - Risks array
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
 * Format strategic objectives for context
 *
 * @param {Array|Object|string} objectives - Objectives to format
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
 * Format metadata for context - extracts important fields
 *
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
 *
 * @param {Array|Object|string} specs - Vision spec references
 * @returns {string} Formatted vision specs string
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
 *
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
