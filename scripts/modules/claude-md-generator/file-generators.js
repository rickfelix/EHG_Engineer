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
  const autoProceedRouter = sections.find(s => s.section_type === 'auto_proceed_router');

  return `# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** (Strategy) → **PLAN** (Architecture) → **EXEC** (Implementation).
Database is the source of truth. State lives in \`strategic_directives_v2\`, \`product_requirements_v2\`, and \`sd_phase_handoffs\`.
> Why: The DB enforces schema constraints and tracks every state transition. It's the only source all sessions, agents, and gates share — markdown files drift silently and can't be queried by the gate pipeline.

## Canonical Pause Points — THE ONLY REASONS TO STOP

AUTO-PROCEED is ON by default. You continue through phase transitions, PRD creation, decomposition, refactors, scope-lock boundaries, and anything else NOT on this list:

1. **Orchestrator completion** — after all children complete, pause for /learn review (only when Chaining is OFF; see SD Continuation Truth Table)
2. **Blocking error requiring human decision** — merge conflicts, ambiguous requirements escalated from EXEC
3. **Test failures after 2 retry attempts** — auto-retry exhausted, RCA sub-agent invoked before pause
4. **All children blocked** — no ready work remains, human decision required
5. **Critical security or data-loss scenario** — includes DB/code status mismatch (code shipped but DB shows incomplete)

**NOT pause triggers — reasoning about any of these as a pause justification is a protocol violation:**
- Scope size, "substantial upcoming work", decomposition into children
- PRD creation, large refactors, phase boundaries
- Context or conversation length ("context is getting long")
- Any "warrants confirmation" / "want me to continue?" rationalization
- Numbered menu presentations at decision points
- Intent to provide a "status checkpoint" after a successful handoff

If your reason for pausing is not on the five-point list above, KEEP WORKING. When in doubt: pick the highest-value option, state it in one sentence, and execute.

> Why: Opus 4.7 interprets instructions literally — implicit "the user approved the SD at LEAD" inferences do not auto-extend across downstream phase boundaries unless enumerated. Confirmation-fishing is the most common AUTO-PROCEED failure mode. This section is canonical; any other doc that conflicts defers to the five-point list here.

## Issue Resolution
When you encounter ANY issue: **STOP. Do not retry blindly. Do not work around it.**
> Why: Blind retries mask root causes and waste context. Workarounds leave the underlying defect in place, guaranteeing it recurs. The RCA sub-agent surfaces systemic fixes — not band-aids.
Invoke the RCA Sub-Agent (\`subagent_type="rca-agent"\`). Your prompt MUST contain:
- **Symptom**: What IS happening. **Location**: Files/endpoints/tables. **Frequency**: Pattern/timing.
- **Prior attempts**: What you already tried. **Desired outcome**: Clear success criteria.

${sessionPrologue ? formatSection(sessionPrologue) : ''}

${autoProceedRouter ? autoProceedRouter.content : ''}

## Session Mode Declaration

Sessions operate in one of two modes that govern how you treat harness bugs (LEO-INFRA issues, gate bugs, session lifecycle drift, tooling constraints) encountered mid-work:

- **\`[MODE: product]\`** — Shipping product work (features, marketing, research, domain code). Harness bugs found mid-session are captured one-line to \`docs/harness-backlog.md\` and deferred. Do NOT file \`SD-LEO-INFRA-*\` / \`SD-LEARN-FIX-*\` / \`SD-MAN-INFRA-*\` / \`QF-*\` during product sessions.
- **\`[MODE: campaign]\`** — Running a harness-hardening sweep. Harness bugs ARE the work; file SDs/QFs and fix inline as they surface. High meta-to-product SD ratios are expected campaign output, not pathology.

**Default mode when the user has not declared:**
- Current SD matches \`SD-LEO-*\` / \`SD-LEARN-FIX-*\` / \`SD-MAN-INFRA-*\` / \`QF-*\` → **campaign mode**
- Current SD is any other type → **product mode**
- No SD claimed and user intent is ambiguous → ask the user once; otherwise default to **product mode**

> Why: Opus 4.7 reads instructions literally and resists rationalizing around countable rules. Without a declared mode, implicit "is this harness work or product work" inference drifts, causing product sessions to get consumed by opportunistic meta-work. The mode declaration turns user intent into a literal switch — product sessions defer, campaign sessions fix inline, no judgment calls in between.

User may override at any point by stating \`[MODE: product]\` or \`[MODE: campaign]\` in the conversation. Most recent declaration wins. If mode is unclear at the start of substantive work, state the mode you've inferred in one sentence before proceeding (e.g., *"Treating this as [MODE: product] — current SD is SD-EHG-MARKETING-..."*).

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |

> Why (TERMINAL): A non-final handoff means gate-validated state must be written to the DB before the next phase begins. Skipping this orphans the SD — the next session finds no handoff record and cannot determine what was approved or completed.

## Work Item Routing

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords (auth, migration, schema, feature) always force Tier 3.
> Why: These change classes carry disproportionate blast radius — auth bugs cause security incidents, schema changes can corrupt data, and feature work needs full stakeholder visibility. Tier 3 ensures the gate pipeline (TESTING, SECURITY, GITHUB sub-agents) always runs for them.

${sessionInit ? formatSection(sessionInit) : ''}

## Context Loading
Load the authoritative rules for your current phase:
- **Starting Work**: Read \`CLAUDE_CORE.md\`
- **LEAD Phase**: Read \`CLAUDE_LEAD.md\`
- **PLAN Phase**: Read \`CLAUDE_PLAN.md\`
- **EXEC Phase**: Read \`CLAUDE_EXEC.md\`
> Why: Each phase file contains gate requirements, anti-patterns, and sub-agent triggers specific to that phase. Reading the wrong file (or none) means operating without the relevant constraints — the most common cause of handoff failures is a gate requirement that wasn't loaded.
Use \`*_DIGEST.md\` variants only when context is constrained (e.g. smaller models, near token limits).
> Why: Full phase files can exceed token budgets on smaller models. The DIGEST variants preserve the critical rules at ~85% compression — enough to pass gates, not enough to catch every edge case.

## Essential Commands
- **Pick Work**: \`npm run sd:next\`
- **Phase Handoff**: \`node scripts/handoff.js execute <PHASE> <SD-ID>\`
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
**Effort**: medium (core context; phase-specific files tag their own effort for phase work)

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
  const { protocol, autonomousDirectives, visionGapInsights = [] } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const leadSections = getSectionsByMapping(sections, 'CLAUDE_LEAD.md', fileMapping);
  const leadContent = leadSections.map(s => formatSection(s)).join('\n\n');

  const directivesSection = generateAutonomousDirectivesSection(autonomousDirectives, 'LEAD');

  // SD-LEO-INFRA-VISION-PROTOCOL-FEEDBACK-001: live VGAP injection
  const visionGapSection = visionGapInsights.length > 0
    ? '## ⚠️ Current Vision Gaps (Live — from issue_patterns)\n\n' +
      '| Pattern ID | Dimension / Summary | Severity |\n' +
      '|------------|--------------------|-----------|\n' +
      visionGapInsights.map(g =>
        `| ${g.pattern_id} | ${g.issue_summary ?? g.category} | ${g.severity?.toUpperCase() ?? 'unknown'} |`
      ).join('\n') +
      '\n\n**Action**: When approving SDs, consider whether the SD addresses or exacerbates these gaps.\n'
    : '';

  // RCA Mandate is in the router — not duplicated here (LEAN LEAD)

  return `# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: LEAD agent operations and strategic validation
**Effort**: high (strategic framing, scope bounding, and sub-agent routing require full reasoning depth)

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.

---

${directivesSection}
${visionGapSection ? '\n' + visionGapSection : ''}
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
**Effort**: high (architecture decisions and PRD rubrics require full reasoning depth)

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
  const { protocol, schemaConstraints, processScripts, autonomousDirectives, visionGapInsights = [] } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const execSections = getSectionsByMapping(sections, 'CLAUDE_EXEC.md', fileMapping);
  const execContent = execSections.map(s => formatSection(s)).join('\n\n');

  const constraintsSection = generateSchemaConstraintsSection(schemaConstraints);
  const scriptsSection = generateProcessScriptsSection(processScripts);
  const directivesSection = generateAutonomousDirectivesSection(autonomousDirectives, 'EXEC');

  // SD-LEO-INFRA-VISION-PROTOCOL-FEEDBACK-001: live VGAP implementation reminders
  const visionRemindersSection = visionGapInsights.length > 0
    ? '## 🔍 Implementation Reminders — Active Vision Gaps\n\n' +
      visionGapInsights.map(g =>
        `- **${g.pattern_id}** (${g.severity?.toUpperCase() ?? 'UNKNOWN'}): ${g.issue_summary ?? g.category} — ensure implementation does not worsen this gap`
      ).join('\n') +
      '\n'
    : '';

  // RCA Mandate is in the router — not duplicated here (LEAN EXEC)

  return `# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: EXEC agent implementation requirements and testing
**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.7 guidance)

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.

---

${directivesSection}
${visionRemindersSection ? '\n' + visionRemindersSection : ''}
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
