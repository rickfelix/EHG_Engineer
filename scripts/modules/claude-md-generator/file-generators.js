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
  generateKnownFrictionPointsSection,
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

/**
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-4 — "included, never copied" is CONVENTION.
 * Nothing enforced it until this function.
 *
 * *** WHY THE OBVIOUS CHECKS ALL PASS ON THE CORRUPTION THIS CATCHES. ***
 * role_partnership_contract (row 610) is mapped into BOTH CLAUDE_ADAM.md and
 * CLAUDE_COORDINATOR.md, so ONE governed row supplies that section to two files and an edit to it
 * moves both at once. Copying its prose into an adam_role_contract row instead renders a
 * byte-identical CLAUDE_ADAM.md on the day it lands — and then drifts silently the first time 610
 * is edited, because only the Coordinator copy moves.
 *   - getSectionsByMapping above is a three-line membership filter run independently per output
 *     file: no exclusivity check, no dedup, no cross-section content comparison.
 *   - the drift check compares DB-to-file fidelity, so a faithfully-rendered duplicate is GREEN.
 *   - a textual diff of the two rendered files is GREEN too — at landing they genuinely match.
 * The only thing that can catch it is asserting that ONE row supplies the shared section, which is
 * what this does: it looks for the shared row's own distinctive lines showing up inside some OTHER
 * section's content.
 *
 * Line-level rather than fuzzy on purpose — an exact match of a long line is nearly impossible to
 * hit by coincidence, so this reports duplication without a similarity threshold to tune. Short
 * lines are skipped because headings and boilerplate ("---", "> Why:") legitimately recur.
 *
 * @param {Array} sections - all leo_protocol_sections rows
 * @param {Object} fileMapping - section-file-mapping.json
 * @param {number} [minLineLength=60] - shortest line treated as distinctive
 * @returns {Array<{shared_type: string, shared_id: *, copied_into_type: string, copied_into_id: *, evidence: string}>}
 */
function findCopiedSharedSections(sections, fileMapping, minLineLength = 60) {
  // A section_type is SHARED when more than one generated file maps it.
  const fileCount = {};
  for (const spec of Object.values(fileMapping || {})) {
    for (const type of spec?.sections || []) fileCount[type] = (fileCount[type] || 0) + 1;
  }
  const sharedTypes = Object.keys(fileCount).filter(t => fileCount[t] > 1);
  if (sharedTypes.length === 0) return [];

  const findings = [];
  for (const sharedType of sharedTypes) {
    for (const shared of (sections || []).filter(s => s.section_type === sharedType)) {
      const distinctive = String(shared.content || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= minLineLength);
      if (distinctive.length === 0) continue;

      for (const other of sections || []) {
        if (other === shared || other.section_type === sharedType) continue;
        const otherContent = String(other.content || '');
        const hit = distinctive.find(line => otherContent.includes(line));
        if (hit) {
          findings.push({
            shared_type: sharedType,
            shared_id: shared.id,
            copied_into_type: other.section_type,
            copied_into_id: other.id,
            evidence: hit.slice(0, 120),
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Throwing wrapper for the generation path. Refuses to render rather than emitting a file that
 * looks correct today and drifts later — the failure mode this SD exists to prevent is one that
 * passes every check on landing day and is discovered months afterward.
 * @param {Array} sections
 * @param {Object} fileMapping
 */
function assertSharedSectionsNotCopied(sections, fileMapping) {
  const findings = findCopiedSharedSections(sections, fileMapping);
  if (findings.length === 0) return;
  const detail = findings
    .map(f => `  • ${f.shared_type} (row ${f.shared_id}) duplicated into ${f.copied_into_type} (row ${f.copied_into_id})\n      "${f.evidence}…"`)
    .join('\n');
  throw new Error(
    'SHARED SECTION COPIED INSTEAD OF INCLUDED — refusing to generate.\n' +
    detail + '\n' +
    '  A shared section must be supplied by ONE row to every file that maps it. Copying it renders\n' +
    '  identically today and diverges the first time the shared row is edited. Delete the copy and\n' +
    '  let the mapping include the original.'
  );
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
- Post-completion /document, /heal, /learn, and **completion-flags capture** after an SD reaches LEAD-FINAL-APPROVAL — these are CONTINUATION steps, never pause points; "I didn't run them — say the word if you want them" is confirmation-fishing. Run the tail (or drive completion via /leo complete, which sequences /document → /heal → /learn → capture-completion-flags automatically). Before emitting the Completion Flags block, answer the reflective interrogation "Are there any gaps we failed to close?" and route each finding via scripts/capture-completion-flags.js (incidental findings → durable feedback channel; "0 flags" shown explicitly). Enforced by the post-completion-tail-enforcement Stop hook (SD-LEO-INFRA-AUTO-ENFORCE-POST-001) + the completion-flags witness check in post-completion-validator.js (SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001).

If your reason for pausing is not on the five-point list above, KEEP WORKING. When in doubt: pick the highest-value option, state it in one sentence, and execute.

> Why: Opus 4.8 interprets instructions literally — implicit "the user approved the SD at LEAD" inferences do not auto-extend across downstream phase boundaries unless enumerated. Confirmation-fishing is the most common AUTO-PROCEED failure mode. This section is canonical; any other doc that conflicts defers to the five-point list here.

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

- **\`[MODE: product]\`** — Shipping product work (features, marketing, research, domain code). Harness bugs found mid-session are captured via \`node scripts/log-harness-bug.js "<symptom>"\` (writes to the \`feedback\` table with category=\'harness_backlog\') and deferred. Do NOT file \`SD-LEO-INFRA-*\` / \`SD-LEARN-FIX-*\` / \`SD-MAN-INFRA-*\` / \`QF-*\` during product sessions.
- **\`[MODE: campaign]\`** — Running a harness-hardening sweep. Harness bugs ARE the work; file SDs/QFs and fix inline as they surface. High meta-to-product SD ratios are expected campaign output, not pathology.

**Default mode when the user has not declared:**
- Current SD matches \`SD-LEO-*\` / \`SD-LEARN-FIX-*\` / \`SD-MAN-INFRA-*\` / \`QF-*\` → **campaign mode**
- Current SD is any other type → **product mode**
- No SD claimed and user intent is ambiguous → ask the user once; otherwise default to **product mode**

> Why: Opus 4.8 reads instructions literally and resists rationalizing around countable rules. Without a declared mode, implicit "is this harness work or product work" inference drifts, causing product sessions to get consumed by opportunistic meta-work. The mode declaration turns user intent into a literal switch — product sessions defer, campaign sessions fix inline, no judgment calls in between.

User may override at any point by stating \`[MODE: product]\` or \`[MODE: campaign]\` in the conversation. Most recent declaration wins. If mode is unclear at the start of substantive work, state the mode you've inferred in one sentence before proceeding (e.g., *"Treating this as [MODE: product] — current SD is SD-EHG-MARKETING-..."*).

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |
| Parent EXEC-TO-PLAN | * | * | **PARENT_DELEGATED_COMPLETION only** — SCOPE_COMPLETION skipped (deliverables in children) |
| Parent PLAN-TO-LEAD (children incomplete) | * | * | **WAIT** verdict (not FAIL) — no retry budget burn, no RCA trigger |

> Why (TERMINAL): A non-final handoff means gate-validated state must be written to the DB before the next phase begins. Skipping this orphans the SD — the next session finds no handoff record and cannot determine what was approved or completed.

> Why (Parent WAIT): Parent orchestrators block at PLAN-TO-LEAD until all children reach status='completed'. This is a known lifecycle state, not a validation failure. See \`leo_protocol_sections\` id=439 "Orchestrator Parent Lifecycle" subsection for the full table (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001).

## Work Item Routing

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords always force Tier 3 — **Type**: feature; **Security**: auth, authentication, authorization, rls, payments, credentials; **Schema**: migration, schema, alter/create/drop table. **Architecture-Plan Auto-Escalation (Always Tier 3)**: when an EVA architecture plan exists for the work item, triage auto-escalates — never reduce scope to fit QF tiers.
> Why: These change classes carry disproportionate blast radius — security bugs cause incidents, schema changes can corrupt data, feature work needs full stakeholder visibility, and arch-plan scope inherently exceeds QF limits. Tier 3 ensures the gate pipeline (TESTING, SECURITY, GITHUB sub-agents) always runs for them.

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
  const { protocol, agents, subAgents, hotPatterns, knownFrictionPoints, recentRetrospectives, gateHealth, pendingProposals } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const coreSections = getSectionsByMapping(sections, 'CLAUDE_CORE.md', fileMapping);
  const coreContent = coreSections.map(s => formatSection(s)).join('\n\n');

  // Compact sub-agent table (no keywords — hook handles routing)
  const subAgentSection = generateSubAgentSectionCompact(subAgents);
  const hotPatternsSection = generateHotPatternsSection(hotPatterns);
  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-4b
  const knownFrictionSection = generateKnownFrictionPointsSection(knownFrictionPoints);
  // QF-20260816-925: prefer a caller-supplied override (the existing on-disk block, when
  // the caller wants it preserved) over a fresh live-table snapshot.
  const recentLessonsSection = data.recentLessonsOverride ?? generateRecentLessonsSection(recentRetrospectives);
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
> For Strunkian writing standards, see \`.strunkian-rules.json\` (enforced by \`scripts/docmon.js\` at pre-push; the former \`docs/reference/strunkian-writing-standards.md\` guide is retired).

---

${coreContent}

${proposalsSection}

${hotPatternsSection}

${knownFrictionSection}

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
**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.8 guidance)

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

/**
 * Generate CLAUDE_ADAM.md — Adam role contract (database-first)
 * Mirrors the phase-file generators: composes the sections listed under
 * 'CLAUDE_ADAM.md' in section-file-mapping.json from leo_protocol_sections.
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
/**
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-2 — the companions become GENERATED, and that is the
 * whole point. Before this, CLAUDE_ADAM.md's own header referenced CLAUDE_ADAM_MANUAL.md and
 * CLAUDE_ADAM_PROVENANCE.md by name while nothing generated, drift-checked, or read-tracked them:
 * 77 of the 83 obligations retired in the FR-1 ledger are reachable ONLY inside those two files.
 * Moving governed content behind a pointer nothing follows is a demotion, not a relocation — the
 * chairman chose A-GOVERN over exactly that, so they are generated from governed rows like any
 * other protocol file.
 *
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @param {string} fileKey - which companion to render
 * @param {{heading: string, purpose: string, loadWhen: string, note: string}} spec
 * @returns {string} Generated markdown content
 */
function generateAdamCompanion(data, fileMapping, fileKey, spec) {
  const { protocol } = data;
  const { today, time } = getMetadata(protocol);
  const sections = getSectionsByMapping(protocol.sections, fileKey, fileMapping);
  const body = sections.map(s => formatSection(s)).join('\n\n');
  const types = (fileMapping[fileKey]?.sections || []).join(', ');

  return `# ${fileKey} — ${spec.heading}

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: ${spec.purpose}
**Load when**: ${spec.loadWhen}

> ${spec.note}

---

${body}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Source of truth: leo_protocol_sections (section_type=${types}). Do not hand-edit — edit the DB section and regenerate.*
`;
}

/** CLAUDE_ADAM_MANUAL.md — the how-to companion. */
function generateAdamManual(data, fileMapping) {
  return generateAdamCompanion(data, fileMapping, 'CLAUDE_ADAM_MANUAL.md', {
    heading: 'Adam Manual (how-to companion)',
    purpose: 'How-to procedures lifted out of the role contract — SD creation field shapes, migration ceremony steps, gauge inputs',
    loadWhen: 'At the MOMENT OF DOING the procedure — not at session start',
    note: 'This companion carries PROCEDURE. The RULES that govern these procedures stay in CLAUDE_ADAM.md and are in force whether or not this file is read.',
  });
}

/** CLAUDE_ADAM_PROVENANCE.md — the dated-rationale companion. */
function generateAdamProvenance(data, fileMapping) {
  return generateAdamCompanion(data, fileMapping, 'CLAUDE_ADAM_PROVENANCE.md', {
    heading: 'Adam Provenance (dated rationale)',
    purpose: 'Why each clause exists — dated chairman verbals, live witnesses, superseded cadences',
    loadWhen: 'When you need to know WHY a rule exists, or before proposing to change one',
    note: 'Every rule in CLAUDE_ADAM.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.',
  });
}

/**
 * CLAUDE_LEAD_MANUAL.md — SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001.
 *
 * CLAUDE_LEAD.md measured 27,462 harness tokens against the Read tool's 25,000 cap, so a
 * no-offset Read returned lines 1-1231 of 1592 and SAID SO ONLY IN A NOTICE THE GATE CANNOT SEE.
 * Head truncation keeps the rationale at the top and drops the tail, which is disproportionately
 * the rules — an absent prohibition reads as permission, at the phase that approves scope.
 *
 * This reuses generateAdamCompanion unchanged: despite the name it takes fileKey + spec and is
 * already generic, and SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 proved the shape on a file with
 * the same defect. Renaming it to generateCompanion would be tidier and would also touch a
 * working, shipped path for no behavioural gain, so it keeps its name.
 *
 * WHAT MAY MOVE HERE IS AN ALLOW-LIST, NOT A REGEX VERDICT. The four sections below were each
 * checked individually for rule content; the keyword scan is only a tripwire that prompts that
 * check. That distinction is not pedantry — the original detector (/BLOCKING|MUST NOT|NEVER|
 * MANDATORY|PROHIBITED/, case-sensitive) scored `negative_constraints_plan` at ZERO, a section
 * titled "PLAN Phase Negative Constraints" consisting entirely of NC-PLAN-001..005. Prohibitions
 * here are expressed structurally — headed lists, NC- identifiers, Anti-Pattern/Why Wrong triples
 * — at least as often as lexically, so a lexical detector is aimed at the wrong layer and fails
 * SILENTLY. An allow-list fails LOUDLY instead: a section nobody justified simply does not move.
 */
function generateLeadManual(data, fileMapping) {
  return generateAdamCompanion(data, fileMapping, 'CLAUDE_LEAD_MANUAL.md', {
    heading: 'LEAD Manual (reference companion)',
    purpose: 'Long-form LEAD reference — the Q9 strategic-validation rubric, parent/child SD governance, multi-track parallel execution, directive submission review',
    loadWhen: 'At the MOMENT OF DOING one of these procedures — not at every LEAD phase entry',
    note: 'This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs LEAD stays in CLAUDE_LEAD.md and is in force whether or not this file is read. If you are ever unsure whether something belongs here, it belongs in CLAUDE_LEAD.md — this file exists to make that file readable, not to relieve it of anything that binds.',
  });
}

/**
 * CLAUDE_PLAN_MANUAL.md — the second half of SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001.
 *
 * CLAUDE_PLAN.md measured 38,166 harness tokens against the 25,000 cap — the worst of the four
 * phase/context files — truncating at line 1368 of 2457, so 44% of PLAN guidance was silently
 * absent from any single read.
 *
 * ONE ENTRY HERE IS WEAKER THAN THE REST AND SAYS SO. `workflow` is included because excluding it
 * leaves the budget 274 tokens short, not because it is self-evidently reference. It survives
 * review on the facts — three unrelated rows share that generic type, 72% of it is a manual
 * /runtime-audit protocol with no bearing on PLAN gating, and the type still renders into
 * CLAUDE_EXEC.md so nothing leaves the protocol — but arithmetic-driven inclusions should be
 * visible as such rather than blended into the list.
 */
function generatePlanManual(data, fileMapping) {
  return generateAdamCompanion(data, fileMapping, 'CLAUDE_PLAN_MANUAL.md', {
    heading: 'PLAN Manual (reference companion)',
    purpose: 'Long-form PLAN reference — gate scoring tables, PRD and presentation templates, parent/child decomposition, refactor-brief guide, Explore-before-validation, runtime-audit protocol',
    loadWhen: 'At the MOMENT OF DOING one of these procedures — not at every PLAN phase entry',
    note: 'This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs PLAN stays in CLAUDE_PLAN.md and is in force whether or not this file is read. The negative constraints, the anti-patterns, the smoke-test and stubbed-code requirements all stayed behind deliberately — this file exists to make that one readable, not to relieve it of anything that binds.',
  });
}

function generateAdam(data, fileMapping) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const adamSections = getSectionsByMapping(sections, 'CLAUDE_ADAM.md', fileMapping);
  const adamContent = adamSections.map(s => formatSection(s)).join('\n\n');

  return `# CLAUDE_ADAM.md - Adam Role Contract

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Canonical Adam role contract — Chairman-attached advisory/analysis session
**Load when**: Running /adam, or orienting an operator-attached advisory session

> Adam is a first-class LEO role parallel to the coordinator and the worker. For the LEAD→PLAN→EXEC workflow itself, see CLAUDE_CORE.md and the phase files.

---

${adamContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Source of truth: leo_protocol_sections (section_type=adam_role_contract). Do not hand-edit — edit the DB section and regenerate.*
`;
}

/**
 * Generate CLAUDE_COORDINATOR.md — Coordinator role contract (database-first).
 * Mirrors generateAdam: composes the sections listed under 'CLAUDE_COORDINATOR.md' in
 * section-file-mapping.json from leo_protocol_sections (section_type=coordinator_role_contract).
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping
 * @returns {string} Generated markdown content
 */
function generateCoordinator(data, fileMapping) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const coordinatorSections = getSectionsByMapping(sections, 'CLAUDE_COORDINATOR.md', fileMapping);
  const coordinatorContent = coordinatorSections.map(s => formatSection(s)).join('\n\n');

  return `# CLAUDE_COORDINATOR.md - Coordinator Role Contract

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Canonical coordinator role + SRE charter — fleet supervisor session
**Load when**: Running /coordinator, or orienting a fleet-coordinator session

> The coordinator is a first-class LEO role parallel to Adam and the worker. For the LEAD→PLAN→EXEC workflow itself, see CLAUDE_CORE.md and the phase files; for the operational /coordinator subcommands, see .claude/commands/coordinator.md.

---

${coordinatorContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Source of truth: leo_protocol_sections (section_type=coordinator_role_contract). Do not hand-edit — edit the DB section and regenerate.*
`;
}

function generateSolomon(data, fileMapping) {
  const { protocol } = data;
  const sections = protocol.sections;
  const { today, time } = getMetadata(protocol);

  const solomonSections = getSectionsByMapping(sections, 'CLAUDE_SOLOMON.md', fileMapping);
  // FR-1 guard: missing section → fallback header, never throw (section may not yet be seeded)
  const solomonContent = solomonSections.length > 0
    ? solomonSections.map(s => formatSection(s)).join('\n\n')
    : '*(solomon_role_contract section not yet seeded — run the seed script to populate)*';

  return `# CLAUDE_SOLOMON.md - Solomon Role Contract

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Canonical Solomon oracle role contract — deep-reasoning session
**Load when**: Running /solomon, or orienting a deep-reasoning oracle session

> Solomon is a deep-reasoning oracle role (Opus 4.8). For the LEAD→PLAN→EXEC workflow itself, see CLAUDE_CORE.md and the phase files. Activation is controlled by SOLOMON_CONSULT_V1.

---

${solomonContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Source of truth: leo_protocol_sections (section_type=solomon_role_contract). Do not hand-edit — edit the DB section and regenerate.*
`;
}

/**
 * CLAUDE_SOLOMON_MANUAL.md — SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001.
 *
 * CLAUDE_SOLOMON.md did not fit one Read: the harness itself returned
 * "PARTIAL view — showing lines 1-301 of 371 total (26138 tokens, cap 25000)".
 *
 * THE HARM HERE IS SHARPER THAN "AN ABSENT PROHIBITION READS AS PERMISSION". The surviving head
 * states silence-by-default as an IDLENESS rule; the dropped tail carried the chairman-ratified
 * "P1 — WORK POSTURE (silence-by-default as an IDLENESS rule is REPEALED)". Head truncation
 * PRESERVED THE SUPERSEDED RULE AND DROPPED ITS REPEAL, so a Solomon session reading its contract
 * the obvious way obeyed a rule the chairman had revoked, with nothing anywhere looking wrong.
 * Solomon is a SINGLETON with no peer seat, so no second reader can notice the omission.
 *
 * THE INHERITED SIZE FIGURE WAS WRONG AND WAS NOT USED. The SD inherited 32,144 tokens and
 * lib/protocol/contract-read-coverage.cjs independently reported 32,139 — both ~23% high. That
 * module's CL100K_TO_HARNESS=1.85 is derived in its own comment as 26142/14617, dividing a
 * WHOLE-FILE token count by the cl100k count of a DELIVERED SLICE; against the same ground truth
 * the honest figure is 26142/17372 = 1.505. Encoding the inherited number would have cut ~30% of
 * this contract to fix a 14% problem. Routed as its own defect; acceptance here is the harness
 * Read, never a tokenizer.
 *
 * TWO CLAUSES WERE DELIBERATELY LEFT BEHIND IN THE GATED FILE, both found by the prohibition
 * tripwire rather than by reading: the Web Research HARD security stop, and ACCURACY REVIEW DUTY
 * — a DURABLE DUTY that happened to sit inside an otherwise procedural section. Same doctrine as
 * the LEAD and ADAM precedents: an allow-list decides, the keyword scan only prompts the check.
 */
function generateSolomonManual(data, fileMapping) {
  return generateAdamCompanion(data, fileMapping, 'CLAUDE_SOLOMON_MANUAL.md', {
    heading: 'Solomon Manual (reference companion)',
    purpose: 'Long-form Solomon reference — origin history, the advice-outcome ledger and success metrics, the web-research routing rubric, crew-comms routing',
    loadWhen: 'At the MOMENT OF DOING one of these procedures — not at every Solomon session start',
    note: 'This companion carries REFERENCE AND PROCEDURE. Every RULE, PROHIBITION and DURABLE DUTY that governs Solomon stays in CLAUDE_SOLOMON.md and is in force whether or not this file is read. If you are ever unsure whether something belongs here, it belongs in CLAUDE_SOLOMON.md — this file exists to make that file readable, not to relieve it of anything that binds.',
  });
}

export {
  getSectionsByMapping,
  generateRouter,
  generateCore,
  generateLead,
  generatePlan,
  generateExec,
  generateAdam,
  generateAdamManual,
  generateAdamProvenance,
  generateLeadManual,
  generatePlanManual,
  generateCoordinator,
  generateSolomon,
  generateSolomonManual,
  findCopiedSharedSections,
  assertSharedSectionsNotCopied
};
