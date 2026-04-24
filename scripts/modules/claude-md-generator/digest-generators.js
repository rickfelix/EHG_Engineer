/**
 * Digest File Generators for CLAUDE.md Generator
 * Produces compact, enforcement-focused versions of protocol files
 *
 * Per FR-2: Include only essential behavioral requirements, boundaries,
 * anti-patterns, gates, and sub-agent triggers. Exclude deep reference
 * material and verbose examples.
 */

import {
  getMetadata,
  generateTriggerQuickReference
} from './section-formatters.js';

/**
 * Get sections by file mapping for DIGEST files
 * @param {Array} sections - All sections
 * @param {string} fileKey - File key from mapping
 * @param {Object} fileMapping - Section to file mapping
 * @returns {Array} Filtered sections
 */
function getSectionsByMapping(sections, fileKey, fileMapping) {
  const mappedTypes = fileMapping[fileKey]?.sections || [];
  return sections.filter(s => mappedTypes.includes(s.section_type));
}

/**
 * Generate compact section content for digest files
 * Strips examples, verbose content, and large tables while preserving rules
 * SD-LEO-INFRA-OPTIMIZE-PROTOCOL-FILE-001: Enhanced compression
 * @param {Object} section - Section data
 * @param {Object} [options] - Compression options
 * @param {number} [options.maxChars=3000] - Maximum characters per section
 * @returns {string} Compact formatted markdown
 */
function formatSectionCompact(section, options = {}) {
  const maxChars = options.maxChars || 3000;
  let content = section.content;

  // Remove header if it duplicates section title
  const headerPattern = new RegExp(`^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'i');
  content = content.replace(headerPattern, '');

  // Strip ALL code blocks (digest should reference full file for code)
  content = content.replace(/```[\s\S]*?```\n*/g, '');

  // Remove "Example:" sections
  content = content.replace(/\*\*Example[s]?\*\*:[\s\S]*?(?=\n##|\n\*\*|$)/gi, '');

  // Remove "Note:" and "Details:" verbose blocks
  content = content.replace(/\*\*(?:Note|Details|Explanation)\*\*:[\s\S]*?(?=\n##|\n\*\*|\n-|\n\d|$)/gi, '');

  // Compress markdown tables with more than 6 rows to header + first 4 data rows
  content = content.replace(/((?:\|[^\n]+\|\n){2})((?:\|[^\n]+\|\n){5,})/g, (match, header, rows) => {
    const rowLines = rows.trim().split('\n');
    return header + rowLines.slice(0, 4).join('\n') + '\n| ... | *(see full file for complete table)* |\n';
  });

  // Compress multiple newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  let result = `## ${section.title}\n\n${content.trim()}`;

  // Hard cap: truncate if still over budget
  if (result.length > maxChars) {
    result = result.substring(0, maxChars - 80) + '\n\n*...truncated. Read full file for complete section.*';
  }

  return result;
}

/**
 * Generate digest metadata header
 * @param {string} filename - Output filename
 * @param {Object} metadata - Generation metadata
 * @returns {string} Formatted header
 */
function generateDigestHeader(filename, metadata) {
  const { gitCommit, dbSnapshotHash, contentHash, generatedAt } = metadata;

  return `<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: ${generatedAt} -->
<!-- git_commit: ${gitCommit} -->
<!-- db_snapshot_hash: ${dbSnapshotHash} -->
<!-- file_content_hash: ${contentHash || 'pending'} -->

`;
}

/**
 * Generate on-demand full-load instruction block
 * @param {string} fullFilename - Corresponding FULL file name
 * @returns {string} Instruction block
 */
function generateFullLoadInstructions(fullFilename) {
  return `
---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read \`${fullFilename}\` using the Read tool.

**Environment Override**: Set \`CLAUDE_PROTOCOL_MODE=full\` to use FULL files instead of DIGEST for all gates.
`;
}

/**
 * Generate CLAUDE_DIGEST.md router file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated markdown content
 */
function generateRouterDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const digestSections = getSectionsByMapping(sections, 'CLAUDE_DIGEST.md', fileMapping);
  const content = digestSections.map(s => formatSectionCompact(s)).join('\n\n');

  const header = generateDigestHeader('CLAUDE_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE.md');

  return `${header}# CLAUDE_DIGEST.md - LEO Protocol Router (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Minimal router for gate enforcement (<3k chars)

---

## Context Loading Strategy

1. **Default**: Load DIGEST files for gate checks
2. **On-demand**: Load FULL files only when \`needs_full_protocol=true\`
3. **Override**: Set \`CLAUDE_PROTOCOL_MODE=full\` to always use FULL files

### File Loading Priority
| Phase | Primary (DIGEST) | Fallback (FULL) |
|-------|------------------|-----------------|
| ALL | CLAUDE_CORE_DIGEST.md | CLAUDE_CORE.md |
| LEAD | CLAUDE_LEAD_DIGEST.md | CLAUDE_LEAD.md |
| PLAN | CLAUDE_PLAN_DIGEST.md | CLAUDE_PLAN.md |
| EXEC | CLAUDE_EXEC_DIGEST.md | CLAUDE_EXEC.md |

${content}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_CORE_DIGEST.md file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated markdown content
 */
function generateCoreDigest(data, fileMapping, metadata) {
  const { protocol, subAgents } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const coreSections = getSectionsByMapping(sections, 'CLAUDE_CORE_DIGEST.md', fileMapping);
  const coreContent = coreSections.map(s => formatSectionCompact(s, { maxChars: 1500 })).join('\n\n');

  // Compact trigger reference (full table in CLAUDE_CORE.md)
  const triggerReference = `## Sub-Agent Routing

**Use Task tool** with \`subagent_type="<type>"\`. Key agents: TESTING, DESIGN, DATABASE, SECURITY, RCA, REGRESSION, PERFORMANCE, UAT, VALIDATION, DOCMON.

*Full trigger keyword table in CLAUDE_CORE.md.*
`;

  const header = generateDigestHeader('CLAUDE_CORE_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_CORE.md');

  const escalationBlock = `## ESCALATE TO FULL FILE WHEN

- Writing sub-agent prompts (need prompt quality standards from CLAUDE_CORE.md)
- Debugging gate failures (need full gate scoring details)
- Understanding governance hierarchy or strategic priorities
- Auto-proceed or continuation logic is unclear (full tables in CLAUDE_CORE.md)
- Need execution philosophy or design principles
`;

  return `${header}# CLAUDE_CORE_DIGEST.md - Core Protocol (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Essential enforcement rules (<10k chars)
**Effort**: medium (core context; phase-specific files tag their own effort for phase work)

---

${coreContent}

${triggerReference}

${escalationBlock}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_LEAD_DIGEST.md file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated markdown content
 */
function generateLeadDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const leadSections = getSectionsByMapping(sections, 'CLAUDE_LEAD_DIGEST.md', fileMapping);
  const leadContent = leadSections.map(s => formatSectionCompact(s)).join('\n\n');

  const header = generateDigestHeader('CLAUDE_LEAD_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_LEAD.md');

  return `${header}# CLAUDE_LEAD_DIGEST.md - LEAD Phase (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: LEAD approval gates and constraints (<5k chars)
**Effort**: high (strategic framing, scope bounding, and sub-agent routing require full reasoning depth)

---

${leadContent}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_PLAN_DIGEST.md file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated markdown content
 */
function generatePlanDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const planSections = getSectionsByMapping(sections, 'CLAUDE_PLAN_DIGEST.md', fileMapping);
  const planContent = planSections.map(s => formatSectionCompact(s)).join('\n\n');

  const header = generateDigestHeader('CLAUDE_PLAN_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_PLAN.md');

  const escalationBlock = `## ESCALATE TO FULL FILE WHEN

- Debugging specific gate scoring or failure reasons
- Need handoff quality gate details (thresholds, weights, rubrics)
- PRD field requirements are unclear beyond anti-patterns
`;

  return `${header}# CLAUDE_PLAN_DIGEST.md - PLAN Phase (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: PRD requirements and constraints (<5k chars)
**Effort**: high (architecture decisions and PRD rubrics require full reasoning depth)

---

${planContent}

${escalationBlock}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_EXEC_DIGEST.md file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated markdown content
 */
function generateExecDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const execSections = getSectionsByMapping(sections, 'CLAUDE_EXEC_DIGEST.md', fileMapping);
  const execContent = execSections.map(s => formatSectionCompact(s)).join('\n\n');

  const header = generateDigestHeader('CLAUDE_EXEC_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_EXEC.md');

  const escalationBlock = `## ESCALATE TO FULL FILE WHEN

- Writing retrospectives (need anti-pattern checklist from CLAUDE_EXEC.md)
- Debugging migration failures (need migration execution protocol)
- Need detailed implementation examples or patterns
`;

  return `${header}# CLAUDE_EXEC_DIGEST.md - EXEC Phase (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Implementation requirements and constraints (<10k chars)
**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.7 guidance)

---

${execContent}

${escalationBlock}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

export {
  getSectionsByMapping,
  formatSectionCompact,
  generateDigestHeader,
  generateFullLoadInstructions,
  generateRouterDigest,
  generateCoreDigest,
  generateLeadDigest,
  generatePlanDigest,
  generateExecDigest
};
