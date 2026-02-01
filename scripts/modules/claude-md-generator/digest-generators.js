/**
 * Digest File Generators for CLAUDE.md Generator
 * Produces compact, enforcement-focused versions of protocol files
 *
 * Per FR-2: Include only essential behavioral requirements, boundaries,
 * anti-patterns, gates, and sub-agent triggers. Exclude deep reference
 * material and verbose examples.
 */

import {
  formatSection,
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
 * Strips examples and verbose content while preserving rules
 * @param {Object} section - Section data
 * @returns {string} Compact formatted markdown
 */
function formatSectionCompact(section) {
  let content = section.content;

  // Remove header if it duplicates section title
  const headerPattern = new RegExp(`^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'i');
  content = content.replace(headerPattern, '');

  // Strip code blocks marked as examples (preserve essential ones)
  content = content.replace(/```(?:example|bash|javascript)\n[\s\S]*?\n```\n*/gi, '');

  // Remove "Example:" sections
  content = content.replace(/\*\*Example[s]?\*\*:[\s\S]*?(?=\n##|\n\*\*|$)/gi, '');

  // Compress multiple newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  return `## ${section.title}\n\n${content.trim()}`;
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
  const coreContent = coreSections.map(s => formatSectionCompact(s)).join('\n\n');

  // Generate compact sub-agent trigger reference
  const triggerReference = generateTriggerQuickReference(subAgents);

  const header = generateDigestHeader('CLAUDE_CORE_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_CORE.md');

  return `${header}# CLAUDE_CORE_DIGEST.md - Core Protocol (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Essential workflow rules and constraints (<10k chars)

---

${coreContent}

${triggerReference}

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

  return `${header}# CLAUDE_PLAN_DIGEST.md - PLAN Phase (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: PRD requirements and validation gates (<5k chars)

---

${planContent}

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

  return `${header}# CLAUDE_EXEC_DIGEST.md - EXEC Phase (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Implementation requirements and constraints (<5k chars)

---

${execContent}

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
