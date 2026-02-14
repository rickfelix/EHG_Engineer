/**
 * Section Formatters for CLAUDE.md Generator
 * Handles formatting of various sections into markdown
 *
 * ARCHITECTURE (2026-01-25):
 * Keywords are sourced from lib/keyword-intent-scorer.js (single source of truth).
 * This ensures CLAUDE.md and CLAUDE_CORE.md have consistent trigger keywords.
 */

import { extractKeywordsFromScorer, flattenKeywords } from './keyword-extractor.js';

// Cache the scorer keywords (loaded once per generation)
let _scorerKeywordsCache = null;
function getScorerKeywords() {
  if (!_scorerKeywordsCache) {
    _scorerKeywordsCache = extractKeywordsFromScorer();
  }
  return _scorerKeywordsCache;
}

/**
 * Format a protocol section
 * @param {Object} section - Section data
 * @returns {string} Formatted markdown
 */
function formatSection(section) {
  let content = section.content;
  const headerPattern = new RegExp(`^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'i');
  content = content.replace(headerPattern, '');
  return `## ${section.title}\n\n${content}`;
}

/**
 * Get metadata for generation
 * @param {Object} protocol - Protocol data
 * @returns {Object} Metadata with today and time
 */
function getMetadata(protocol) {
  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString();
  return { today, time, protocol };
}

/**
 * Generate agent responsibility section
 * @param {Array} agents - List of agents
 * @returns {string} Formatted markdown table
 */
function generateAgentSection(agents) {
  let table = '| Agent | Code | Responsibilities | % Split |\n';
  table += '|-------|------|------------------|----------|\n';

  agents.forEach(agent => {
    const responsibilities = agent.responsibilities.substring(0, 80) + (agent.responsibilities.length > 80 ? '...' : '');
    const percentages = [];
    if (agent.planning_percentage) percentages.push(`P:${agent.planning_percentage}`);
    if (agent.implementation_percentage) percentages.push(`I:${agent.implementation_percentage}`);
    if (agent.verification_percentage) percentages.push(`V:${agent.verification_percentage}`);
    if (agent.approval_percentage) percentages.push(`A:${agent.approval_percentage}`);
    const split = percentages.join(' ') + ` = ${agent.total_percentage}%`;

    table += `| ${agent.name} | ${agent.agent_code} | ${responsibilities} | ${split} |\n`;
  });

  table += '\n**Legend**: P=Planning, I=Implementation, V=Verification, A=Approval\n';
  table += '**Total**: EXEC (30%) + LEAD (35%) + PLAN (35%) = 100%';

  return table;
}

/**
 * Generate sub-agent section
 * Uses scorer file as single source of truth for keywords (not database triggers table)
 * @param {Array} subAgents - List of sub-agents
 * @returns {string} Formatted markdown
 */
function generateSubAgentSection(subAgents) {
  if (!subAgents || subAgents.length === 0) {
    return '';
  }

  // Get keywords from scorer file (single source of truth)
  const scorerKeywords = getScorerKeywords();

  let section = `## Available Sub-Agents

**Usage**: Invoke sub-agents using the Task tool with matching subagent_type.
**IMPORTANT**: When user query contains trigger keywords, PROACTIVELY invoke the corresponding sub-agent.

`;

  // Categorize agents based on scorer keywords (not database triggers)
  const withKeywords = subAgents.filter(sa => scorerKeywords[sa.code]);
  const withoutKeywords = subAgents.filter(sa => !scorerKeywords[sa.code]);

  if (withoutKeywords.length > 0) {
    section += '### Sub-Agents Without Keyword Triggers\n\n';
    withoutKeywords.forEach(sa => {
      section += `- **${sa.name}** (\`${sa.code || 'N/A'}\`): ${sa.description?.substring(0, 80) || 'N/A'}\n`;
    });
    section += '\n';
  }

  section += '### Keyword-Triggered Sub-Agents\n\n';

  withKeywords.forEach(sa => {
    // Get keywords from scorer file
    const agentKw = scorerKeywords[sa.code] || {};
    const allKeywords = [
      ...(agentKw.primary || []),
      ...(agentKw.secondary || [])
    ];
    const desc = sa.description?.substring(0, 100) || 'N/A';

    section += `#### ${sa.name} (\`${sa.code || 'N/A'}\`)\n`;
    section += `${desc}\n\n`;

    if (allKeywords.length > 0) {
      section += `**Trigger Keywords**: \`${allKeywords.join('\`, \`')}\`\n\n`;
    }
  });

  section += `
**Note**: Sub-agent results MUST be persisted to \`sub_agent_execution_results\` table.
`;

  return section;
}

/**
 * Generate trigger quick reference for router
 * Uses scorer file as single source of truth (not database triggers)
 * @param {Array} _subAgents - List of sub-agents (unused - kept for API compatibility)
 * @returns {string} Formatted markdown
 */
function generateTriggerQuickReference(_subAgents) {
  // Get keywords from scorer file (single source of truth)
  const scorerKeywords = getScorerKeywords();

  if (Object.keys(scorerKeywords).length === 0) {
    return '## Sub-Agent Trigger Keywords (Quick Reference)\n\n*Keywords not available*\n';
  }

  let section = `## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
`;

  // Sort agents alphabetically and generate rows
  Object.keys(scorerKeywords).sort().forEach(agent => {
    const agentKw = scorerKeywords[agent];
    const flat = flattenKeywords(agentKw, 3);
    const totalCount = (agentKw.primary?.length || 0) +
                       (agentKw.secondary?.length || 0) +
                       (agentKw.tertiary?.length || 0);
    const moreCount = totalCount - flat.length;

    let keywordStr = flat.join(', ');
    if (moreCount > 0) {
      keywordStr += ` (+${moreCount} more)`;
    }
    section += `| \`${agent}\` | ${keywordStr} |\n`;
  });

  section += `
*Full trigger list in CLAUDE_CORE.md. Use Task tool with \`subagent_type="<agent-code>"\`*
`;

  return section;
}

/**
 * Generate handoff templates section
 * @param {Array} templates - List of handoff templates
 * @returns {string} Formatted markdown
 */
function generateHandoffTemplates(templates) {
  if (!templates || templates.length === 0) return 'No templates in database';

  const safeJson = (val, fallback = 'N/A') => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const extractSections = (templateStructure) => {
    if (!templateStructure) return 'Not defined';
    const sections = templateStructure.sections;
    if (!sections) return 'Not defined';
    if (Array.isArray(sections)) {
      return sections.map(s => {
        if (typeof s === 'string') return s;
        if (s?.title) return s.title;
        if (s?.name) return s.name;
        return safeJson(s);
      }).join(', ');
    }
    return safeJson(sections);
  };

  const formatRequired = (requiredElements) => {
    if (!requiredElements) return 'None specified';
    if (Array.isArray(requiredElements)) {
      return requiredElements.map(el => typeof el === 'string' ? el : safeJson(el)).join(', ');
    }
    return safeJson(requiredElements);
  };

  return templates.map(t => `
#### ${t.from_agent || 'Unknown'} -> ${t.to_agent || 'Unknown'} (${t.handoff_type || 'N/A'})
- **Elements**: ${extractSections(t.template_structure)}
- **Required**: ${formatRequired(t.required_elements)}
`).join('\n');
}

/**
 * Generate validation rules section
 * @param {Array} rules - List of validation rules
 * @returns {string} Formatted markdown
 */
function generateValidationRules(rules) {
  if (!rules || rules.length === 0) return 'No validation rules in database';

  const formatCriteria = (criteria) => {
    if (!criteria) return 'Not specified';
    if (typeof criteria === 'string') return criteria;
    try {
      if (typeof criteria === 'object') {
        const keys = Object.keys(criteria);
        if (keys.length <= 3) {
          return keys.map(k => `${k}: ${JSON.stringify(criteria[k])}`).join('; ');
        }
        return `${keys.length} criteria defined (${keys.slice(0, 3).join(', ')}...)`;
      }
      return JSON.stringify(criteria);
    } catch {
      return String(criteria);
    }
  };

  return rules.map(r => `
- **${r.rule_name || 'Unnamed Rule'}** (Gate ${r.gate || 'N/A'})
  - Weight: ${r.weight ?? 'N/A'}
  - Required: ${r.required ? 'Yes' : 'No'}
  - Criteria: ${formatCriteria(r.criteria)}
`).join('\n');
}

/**
 * Generate schema constraints section
 * @param {Array} constraints - List of schema constraints
 * @returns {string} Formatted markdown
 */
function generateSchemaConstraintsSection(constraints) {
  if (!constraints || constraints.length === 0) {
    return '';
  }

  let section = `## Database Schema Constraints Reference

**CRITICAL**: These constraints are enforced by the database. Agents MUST use valid values to avoid insert failures.

`;

  const byTable = {};
  constraints.forEach(c => {
    if (!byTable[c.table_name]) byTable[c.table_name] = [];
    byTable[c.table_name].push(c);
  });

  for (const [table, cols] of Object.entries(byTable)) {
    section += `### ${table}\n\n`;
    section += '| Column | Valid Values | Hint |\n';
    section += '|--------|--------------|------|\n';

    cols.forEach(c => {
      const values = c.valid_values ? JSON.parse(JSON.stringify(c.valid_values)).join(', ') : 'N/A';
      section += `| \`${c.column_name}\` | ${values} | ${c.remediation_hint || ''} |\n`;
    });

    section += '\n';
  }

  return section;
}

/**
 * Generate process scripts section
 * @param {Array} scripts - List of process scripts
 * @returns {string} Formatted markdown
 */
function generateProcessScriptsSection(scripts) {
  if (!scripts || scripts.length === 0) {
    return '';
  }

  let section = `## LEO Process Scripts Reference

**Usage**: All scripts use positional arguments unless noted otherwise.

`;

  const byCategory = {};
  scripts.forEach(s => {
    const cat = s.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  });

  for (const [category, categoryScripts] of Object.entries(byCategory)) {
    section += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Scripts\n\n`;

    categoryScripts.forEach(s => {
      section += `#### ${s.script_name}\n`;
      section += `${s.description}\n\n`;
      section += `**Usage**: \`${s.usage_pattern}\`\n\n`;

      if (s.examples && s.examples.length > 0) {
        section += '**Examples**:\n';
        s.examples.forEach(ex => {
          section += `- \`${ex.command}\`\n`;
        });
        section += '\n';
      }

      if (s.common_errors && s.common_errors.length > 0) {
        section += '**Common Errors**:\n';
        s.common_errors.forEach(err => {
          section += `- Pattern: \`${err.error_pattern}\` -> Fix: ${err.fix}\n`;
        });
        section += '\n';
      }
    });
  }

  return section;
}

export {
  formatSection,
  getMetadata,
  generateAgentSection,
  generateSubAgentSection,
  generateTriggerQuickReference,
  generateHandoffTemplates,
  generateValidationRules,
  generateSchemaConstraintsSection,
  generateProcessScriptsSection
};
