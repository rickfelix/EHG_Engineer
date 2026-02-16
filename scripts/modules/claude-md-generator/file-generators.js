/**
 * File Generators for CLAUDE.md Generator
 * Generates content for each CLAUDE file (Router, Core, Lead, Plan, Exec)
 *
 * LEAN ROUTER (2026-02-16): Router trimmed from ~303 to ~100 lines.
 * LEAN CORE (2026-02-16): Core trimmed from ~1791 to ~900 lines.
 *   - Removed: duplicate RCA mandate, keyword dumps, implementation details,
 *     common-sense guidance (parallel exec, communication style, Strunkian).
 *   - Sub-agent keywords removed — routing handled by PreToolUse hook.
 * LEAN PHASE FILES (2026-02-16): LEAD/PLAN/EXEC trimmed.
 *   - Removed: RCA mandate (already in router), migration/phase-transition
 *     duplicates (already in CORE), superseded sections, schema reference data.
 *   - Section exclusions managed in section-file-mapping.json (source of truth).
 * See scripts/hooks/pre-tool-enforce.cjs
 */

import {
  formatSection,
  getMetadata,
  generateAgentSection,
  generateSubAgentSectionCompact,
  generateHandoffTemplates,
  generateValidationRules,
  generateSchemaConstraintsSection,
  generateProcessScriptsSection
} from './section-formatters.js';

// Keyword quick reference removed from router (2026-02-16)
// Keywords are enforced by PreToolUse hook, not text in CLAUDE.md
// import { generateKeywordQuickReference } from './keyword-extractor.js';

import {
  generateHotPatternsSection,
  generateRecentLessonsSection,
  generateGateHealthSection,
  generateProposalsSection,
  generateAutonomousDirectivesSection
} from './operational-sections.js';

/**
 * Get sections by file mapping
 * @param {Array} sections - All sections
 * @param {string} fileKey - File key from mapping
 * @param {Object} fileMapping - Section to file mapping
 * @returns {Array} Filtered sections
 */
function getSectionsByMapping(sections, fileKey, fileMapping) {
  const mappedTypes = fileMapping[fileKey]?.sections || [];
  return sections.filter(s => mappedTypes.includes(s.section_type));
}

// getRCAMandate() removed (2026-02-16): RCA mandate lives in CLAUDE.md router only.
// Phase files now use a reference pointer instead of duplicating ~51 lines each.

/**
 * Generate CLAUDE.md — lean router file
 * Stripped to ~100 lines (down from ~303). Keyword table and static docs removed.
 * Sub-agent routing enforced by PreToolUse hook (scripts/hooks/pre-tool-enforce.cjs).
 *
 * @param {Object} data - All data from database
 * @param {Object} _fileMapping - Section to file mapping (unused for router)
 * @returns {string} Generated markdown content
 */
function generateRouter(data, _fileMapping) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const sessionPrologue = sections.find(s => s.section_type === 'session_prologue');
  const sessionInit = sections.find(s => s.section_type === 'session_init');

  return `# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** (Strategy) → **PLAN** (Architecture) → **EXEC** (Implementation).
Database is the source of truth. State lives in \`strategic_directives_v2\`, \`product_requirements_v2\`, and \`sd_phase_handoffs\`.

## Issue Resolution
When you encounter ANY issue: **STOP. Do not retry blindly. Do not work around it.**
Invoke the RCA Sub-Agent (\`subagent_type="rca-agent"\`). Your prompt MUST contain:
- **Symptom**: What IS happening. **Location**: Files/endpoints/tables. **Frequency**: Pattern/timing.
- **Prior attempts**: What you already tried. **Desired outcome**: Clear success criteria.

${sessionPrologue ? formatSection(sessionPrologue) : ''}

## AUTO-PROCEED Mode

AUTO-PROCEED is **ON by default**. Phase transitions execute automatically, no confirmation prompts.
**Pause points** (even when ON): Orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked.

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |

## Work Item Routing

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords (auth, migration, schema, feature) always force Tier 3.

${sessionInit ? formatSection(sessionInit) : ''}

## Context Loading
Load the authoritative rules for your current phase:
- **Starting Work**: Read \`CLAUDE_CORE_DIGEST.md\`
- **LEAD Phase**: Read \`CLAUDE_LEAD_DIGEST.md\`
- **PLAN Phase**: Read \`CLAUDE_PLAN_DIGEST.md\`
- **EXEC Phase**: Read \`CLAUDE_EXEC_DIGEST.md\`
Escalate to full files (e.g. \`CLAUDE_CORE.md\`) only when digest is insufficient.

## Essential Commands
- **Pick Work**: \`npm run sd:next\`
- **Phase Handoff**: \`node scripts/unified-handoff-system.js execute <PHASE> <SD-ID>\`
- **Create SD**: \`node scripts/leo-create-sd.js\`
- **Create PRD**: \`node scripts/add-prd-to-database.js\`
- **LEO Stack**: \`node scripts/cross-platform-run.js leo-stack restart|status|stop\`

> Sub-agent routing and background execution rules are enforced by PreToolUse hooks. See \`scripts/hooks/pre-tool-enforce.cjs\`.

---
*Generated: ${today} ${time} | Protocol: LEO ${protocol.version} | Source: Database*
`;
}

/**
 * Generate CLAUDE_CORE.md file (lean version)
 * LEAN CORE (2026-02-16): ~42% token reduction.
 * Section exclusions managed in section-file-mapping.json (source of truth).
 * Sub-agent routing handled by PreToolUse hook (scripts/hooks/pre-tool-enforce.cjs).
 *
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
function generateCore(data, fileMapping) {
  const { protocol, agents, subAgents, hotPatterns, recentRetrospectives, gateHealth, pendingProposals } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const coreSections = getSectionsByMapping(sections, 'CLAUDE_CORE.md', fileMapping);
  const coreContent = coreSections.map(s => formatSection(s)).join('\n\n');

  // Compact sub-agent table (no keywords — hook handles routing)
  const subAgentSection = generateSubAgentSectionCompact(subAgents);
  const hotPatternsSection = generateHotPatternsSection(hotPatterns);
  const recentLessonsSection = generateRecentLessonsSection(recentRetrospectives);
  const gateHealthSection = generateGateHealthSection(gateHealth);
  const proposalsSection = generateProposalsSection(pendingProposals);

  // RCA Mandate is in the router — not duplicated here (LEAN CORE)

  return `# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Essential workflow context for all sessions

> Sub-agent routing enforced by PreToolUse hook. See \`scripts/hooks/pre-tool-enforce.cjs\`.
> For Five-Point Brief (sub-agent prompt quality), see CLAUDE.md Issue Resolution section.
> For Strunkian writing standards, see \`docs/reference/strunkian-writing-standards.md\`.

---

${coreContent}

${proposalsSection}

${hotPatternsSection}

${gateHealthSection}

${recentLessonsSection}

## Agent Responsibilities

${generateAgentSection(agents)}

## Progress Calculation

\`\`\`
Total = ${agents.map(a => `${a.agent_code}: ${a.total_percentage}%`).join(' + ')} = 100%
\`\`\`

${subAgentSection}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Includes: Proposals (${pendingProposals?.length || 0}) + Hot Patterns (${hotPatterns?.length || 0}) + Lessons (${recentRetrospectives?.length || 0})*
*Load this file first in all sessions*
`;
}

/**
 * Generate CLAUDE_LEAD.md file (lean version)
 * LEAN LEAD (2026-02-16): Removed RCA mandate (in router), migration/phase-transition
 * duplicates (in CORE). Section exclusions in section-file-mapping.json.
 *
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
function generateLead(data, fileMapping) {
  const { protocol, autonomousDirectives } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const leadSections = getSectionsByMapping(sections, 'CLAUDE_LEAD.md', fileMapping);
  const leadContent = leadSections.map(s => formatSection(s)).join('\n\n');

  const directivesSection = generateAutonomousDirectivesSection(autonomousDirectives, 'LEAD');

  // RCA Mandate is in the router — not duplicated here (LEAN LEAD)

  return `# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: LEAD agent operations and strategic validation

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.

---

${directivesSection}

${leadContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
`;
}

/**
 * Generate CLAUDE_PLAN.md file (lean version)
 * LEAN PLAN (2026-02-16): Removed RCA mandate (in router), migration/phase-transition
 * duplicates (in CORE), superseded testing_tier_strategy, schema reference data.
 * Section exclusions in section-file-mapping.json.
 *
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
function generatePlan(data, fileMapping) {
  const { protocol, handoffTemplates, validationRules, autonomousDirectives } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const planSections = getSectionsByMapping(sections, 'CLAUDE_PLAN.md', fileMapping);
  const planContent = planSections.map(s => formatSection(s)).join('\n\n');

  const directivesSection = generateAutonomousDirectivesSection(autonomousDirectives, 'PLAN');

  // RCA Mandate is in the router — not duplicated here (LEAN PLAN)

  return `# CLAUDE_PLAN.md - PLAN Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: PLAN agent operations, PRD creation, validation gates

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.
> For database schema reference, see \`docs/reference/database-agent-patterns.md\`.

---

${directivesSection}

${planContent}

## Handoff Templates

${generateHandoffTemplates(handoffTemplates)}

## Validation Rules

${generateValidationRules(validationRules)}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions PLAN, PRD, validation, or testing strategy*
`;
}

/**
 * Generate CLAUDE_EXEC.md file (lean version)
 * LEAN EXEC (2026-02-16): Removed RCA mandate (in router), migration/phase-transition
 * duplicates (in CORE), duplicate workflow entry.
 * Section exclusions in section-file-mapping.json.
 *
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
function generateExec(data, fileMapping) {
  const { protocol, schemaConstraints, processScripts, autonomousDirectives } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const execSections = getSectionsByMapping(sections, 'CLAUDE_EXEC.md', fileMapping);
  const execContent = execSections.map(s => formatSection(s)).join('\n\n');

  const constraintsSection = generateSchemaConstraintsSection(schemaConstraints);
  const scriptsSection = generateProcessScriptsSection(processScripts);
  const directivesSection = generateAutonomousDirectivesSection(autonomousDirectives, 'EXEC');

  // RCA Mandate is in the router — not duplicated here (LEAN EXEC)

  return `# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: EXEC agent implementation requirements and testing

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.

---

${directivesSection}

${execContent}

${constraintsSection}

${scriptsSection}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions EXEC, implementation, coding, or testing*
`;
}

export {
  getSectionsByMapping,
  generateRouter,
  generateCore,
  generateLead,
  generatePlan,
  generateExec
};
