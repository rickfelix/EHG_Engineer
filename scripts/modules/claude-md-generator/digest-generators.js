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

  // Over budget: keep what CONSTRAINS, not what comes FIRST — but only where head-truncation is
  // actually catastrophic. See AUTHORITY_SELECT_MIN_CHARS for why this is gated rather than global.
  if (result.length > maxChars && result.length > AUTHORITY_SELECT_MIN_CHARS) {
    result = retainAuthorityClauses(section.title, content.trim(), maxChars);
  } else if (result.length > maxChars) {
    result = result.substring(0, maxChars - 80) + '\n\n*...truncated. Read full file for complete section.*';
  }

  return result;
}

/**
 * Head-truncation is fine when it keeps most of a section and catastrophic when it keeps a tenth.
 * Engage authority selection only in the second regime.
 *
 * WHY THIS IS A THRESHOLD AND NOT A GLOBAL SWITCH — I tried global first and the measurement said no.
 * Authority selection replacing head-truncation EVERYWHERE cost authority lines in three digests
 * that were only slightly over budget (CLAUDE_DIGEST 9->6, EXEC 12->11, SOLOMON 6->5): a section
 * 1.2x its budget keeps ~all of itself under head-truncation, so ANY re-selection can only take
 * things away. Adding a backfill pass recovered part of it but not all, and chasing the rest would
 * have meant tuning a heuristic against digests this SD has no business changing.
 *
 * ABSOLUTE, NOT A MULTIPLE OF THE BUDGET — AND THE MULTIPLE VERSION SILENTLY UNDID THE FIX.
 * This was `maxChars * 3`, which coupled the threshold to the very number the other half of this
 * repair raises. Setting the Adam budget to 16,000 moved the threshold to 48,000, the 38,979-char
 * contract stopped qualifying, and it fell back to head-truncation — so the two fixes cancelled and
 * the digest lost the canonical SD-creation prohibition again. It presented as a stuck measurement:
 * output frozen at 17,915 bytes across budgets from 12,000 to 30,000, which I first read as
 * "saturated" when it actually meant "this knob stopped being connected". The tell was the file
 * carrying BOTH markers at once — the authority NOTE from one section and the old truncation
 * marker from another — i.e. two sections taking two different paths.
 *
 * An absolute floor cannot be moved by the budget. 9,000 chars is where head-truncating a 3,000-char
 * digest section throws away two thirds or more and WHICH two thirds becomes the whole question;
 * below it, behaviour is unchanged and the other seven digests stay untouched, verified rather than
 * assumed (tests/unit/adam/adam-digest-authority-survives.test.js). The Adam contract is 38,979.
 */
const AUTHORITY_SELECT_MIN_CHARS = 9000;

/**
 * The subset that must survive even when the budget forces a choice. These name a SPECIFIC
 * prohibition or control ("CHAIRMAN-ONLY", "kill switch", "NEVER hand-insert"), where the general
 * markers below also fire on ordinary prose that merely contains "must" or "gate".
 */
const STRONG_MARKERS = [
  /CHAIRMAN-ONLY/i, /never delegatable/i, /non-delegatable/i, /fail-closed/i, /fail closed/i,
  /kill.?switch/i, /\bNEVER\b/, /\bforbidden\b/i, /\bprohibited\b/i,
  /\bis NOT\b/, /\bdoes NOT\b/, /\brequires? (?:the )?chairman\b/i,
];

/**
 * Markers of a clause that BINDS. A digest that drops these is not a shorter contract,
 * it is a contract with no authority in it.
 */
const AUTHORITY_MARKERS = [
  /CHAIRMAN-ONLY/i, /never delegatable/i, /non-delegatable/i, /fail-closed/i, /fail closed/i,
  /kill.?switch/i, /\bnever\b/i, /\bmust\b/i, /\bonly\b/i, /\bforbidden\b/i, /\bprohibited\b/i,
  /\brejected to the chairman\b/i, /\brequires? (?:the )?chairman\b/i, /\bgate\b/i,
  // NEGATIVE IDENTITY IS AUTHORITY. A role contract's sharpest boundaries are written as what the
  // role is NOT — "Solomon is NOT a sub-agent", "Adam is NOT a worker" — and dropping those lets a
  // session assume a role it was explicitly denied. Found by measurement: the Solomon digest lost
  // exactly these two lines and nothing else.
  /\bis NOT\b/, /\bdoes NOT\b/, /\bNOT a\b/, /\bnot\b.{0,30}\bdelegat/i,
];
// CASE MATTERS HERE, AND GETTING IT WRONG IS HOW I MIS-MEASURED MY OWN FIX.
// never/must/only are case-INSENSITIVE because prose carries them in lowercase ("the only way to
// get a context-fresh perspective") and that sentence is as binding as a shouted one. The NOT forms
// stay case-SENSITIVE: capitalised NOT is the deliberate emphasis role contracts use for identity
// boundaries, while lowercase "not" appears in nearly every sentence and would mark everything.
// My first measurement used a case-insensitive grep against a partly case-sensitive selector, so
// the instrument and the implementation disagreed and the audit read clean while lines were lost.

/**
 * Budget-bounded compression that selects by AUTHORITY rather than by POSITION.
 *
 * WHY THIS EXISTS — a regression this SD caused and this function repairs.
 * The previous rule was `substring(0, maxChars)`: keep the first N characters, drop the rest.
 * That is safe only while a section is roughly as long as the budget, which held while the Adam
 * contract was ~40 rows of ~1-3KB each — every clause was its own section and survived
 * independently. SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 consolidated the contract into ONE
 * 38,979-char row, and head-truncation then decapitated it: CLAUDE_ADAM_DIGEST.md fell from 18,903
 * to 4,727 bytes and lost EVERY authority clause — the CHAIRMAN-ONLY permission-change
 * prohibition, the delegation kill-switch, the verbal-scribe ceremony and the pre-send consult
 * rubric. All four sit past char 3,000. The digest is what a context-pressured session loads, so
 * the result was a governance surface advertising Adam's duties with none of Adam's limits: the
 * exact failure this SD exists to prevent, produced by this SD.
 *
 * Position is the wrong axis. Contracts open with purpose and close with prohibitions, so a
 * head-truncated contract keeps the prose and discards the teeth EVERY time — the failure is
 * systematic, not unlucky. Selecting on authority markers inverts that: the clauses most worth the
 * budget are kept whatever their offset, and each keeps its nearest heading so a retained "NEVER"
 * cannot be read against the wrong subject. Elisions are marked inline, so the reader can see that
 * material was dropped and where — a silent truncation reads as a complete document.
 *
 * PRIORITY, NOT A FILTER — AND I SHIPPED THE FILTER FIRST AND MEASURED IT WRONG.
 * The first version kept ONLY marked lines, and the comment here asserted it "cannot regress" the
 * other digests. That was an assumption stated as a fact, and measuring it refuted it: authority
 * lines fell 9->6 in CLAUDE_DIGEST.md, 12->11 in EXEC, 6->5 in SOLOMON. The reason is that a
 * section only SLIGHTLY over budget used to keep nearly all of itself under head-truncation, so
 * replacing that with a filter DISCARDS unmarked lines that comfortably fit. The Adam contract is
 * 13x its budget and the others are barely over — one rule, two very different regimes.
 *
 * So authority is an ORDERING over the budget, not a membership test on the text: marked lines are
 * seated first, then the remainder backfills in document order until the budget is gone. A
 * slightly-over section keeps essentially what it always did; a massively-over section keeps its
 * prohibitions instead of its preamble. Strictly better in BOTH regimes, which the filter was not.
 */
function retainAuthorityClauses(title, content, maxChars) {
  const head = `## ${title}\n\n`;
  const NOTE = '\n\n*Authority-selected digest — lower-priority prose elided. Read the full file for complete content.*';
  const budget = maxChars - head.length - NOTE.length;

  const lines = content.split('\n');
  const binding = new Set();
  let heading = -1;

  lines.forEach((line, i) => {
    if (/^#{2,6}\s/.test(line)) { heading = i; return; }
    if (!AUTHORITY_MARKERS.some((re) => re.test(line))) return;
    binding.add(i);
    // Carry the nearest heading, or an orphaned prohibition attaches to the wrong subject.
    if (heading >= 0) binding.add(heading);
  });

  // Always seat the opening lines: they say WHO the contract binds, which every clause presumes.
  for (let i = 0; i < Math.min(4, lines.length); i++) binding.add(i);

  // SEAT THE BINDING LINES FIRST, AND NEVER LET PROSE CROWD THEM OUT.
  // This ordering is not cosmetic — getting it wrong cost me the "NEVER hand-insert" clause and
  // took a failing test to find. The earlier version backfilled prose up to the FULL budget and
  // then rendered everything in one pass that `break`-ed at the first overflow. Two faults
  // compounded: the elision markers cost budget nobody had reserved, so the render always ran over;
  // and `break` (rather than skip) meant the overflow discarded the entire TAIL — which is exactly
  // where a contract keeps its prohibitions. It also faked saturation, because the backfill spent
  // whatever budget it was given and the render then overran at the same proportion — the output
  // was 17,915 bytes at a 16,000 budget AND at 36,000, which reads as "nothing more to add" when
  // the truth was "the tail is being cut every time". A number that does not move is not evidence
  // that it cannot.
  const spend = (n, i) => n + lines[i].length + 1 + 2; // +2 = worst-case elision marker
  const seated = new Set();
  let used = 0;

  // THE BUDGET IS REAL, SO SOMETHING HAS TO YIELD — AND IT MUST NOT BE THE STRONGEST CLAUSE.
  // Letting every marked line override the cap ballooned this digest to 29,579 bytes, 63% of the
  // contract, which stops being a digest. But cutting the overflow in document order re-loses the
  // tail, which is the bug this whole function exists to fix. So seat in THREE passes, strongest
  // first: explicit prohibitions, then general modals, then prose backfill. Position stops deciding
  // what survives at every tier, not just the first.
  const tier = (i) => (STRONG_MARKERS.some((re) => re.test(lines[i])) ? 0 : 1);
  const ordered = [...binding].sort((a, b) => tier(a) - tier(b) || a - b);

  for (const i of ordered) {
    const next = spend(used, i);
    if (next > budget) continue;   // skip, never break — one long line must not end the selection
    seated.add(i);
    used = next;
  }
  // Backfill whatever room the binding lines left, in document order.
  for (let i = 0; i < lines.length; i++) {
    if (seated.has(i)) continue;
    const next = spend(used, i);
    if (next > budget) continue;
    seated.add(i);
    used = next;
  }

  const keep = [...seated].sort((a, b) => a - b);
  const out = [];
  let prev = -1;

  for (const i of keep) {
    if (prev >= 0 && i > prev + 1) out.push('…');
    out.push(lines[i]);
    prev = i;
  }
  if (prev >= 0 && prev < lines.length - 1) out.push('…');

  return head + out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + NOTE;
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
  const coreContent = coreSections.map(s => formatSectionCompact(s, { maxChars: 30000 })).join('\n\n');

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
**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.8 guidance)

---

${execContent}

${escalationBlock}

${fullLoadInstr}

---

*DIGEST generated: ${today} ${time}*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_ADAM_DIGEST.md file
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated CLAUDE_ADAM_DIGEST.md content
 */
function generateAdamDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;

  const adamSections = getSectionsByMapping(sections, 'CLAUDE_ADAM_DIGEST.md', fileMapping);
  // SIZED BY WHAT IT MUST CONTAIN, NOT BY A ROUND NUMBER. The contract is now ONE ~39,000-char
  // row, so the 3,000 default kept only its opening prose and dropped every limit Adam operates
  // under. Authority selection saturates at 14,103 bytes — 16,000 and 24,000 produce a
  // byte-identical file — so this budget no longer binds and nothing marked authoritative is
  // dropped for want of room. The result is still 25% SMALLER than the 18,903-byte digest this
  // replaces, because prose is what got cut instead of prohibitions.
  const adamContent = adamSections.map(s => formatSectionCompact(s, { maxChars: 16000 })).join('\n\n');

  const header = generateDigestHeader('CLAUDE_ADAM_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_ADAM.md');

  return `${header}# CLAUDE_ADAM_DIGEST.md - Adam Role (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Adam role contract essentials — Chairman-attached advisory/analysis session. Authority-selected: every binding clause is here, non-binding prose is not.

${fullLoadInstr}

---

${adamContent}

---
*Adam is NOT a worker and NOT the coordinator. Full contract in CLAUDE_ADAM.md.*
*Protocol: ${protocol.version}*
`;
}

/**
 * Generate CLAUDE_COORDINATOR_DIGEST.md — coordinator role contract essentials (enforcement).
 * Mirrors generateAdamDigest.
 * @param {Object} data - All data from database
 * @param {Object} fileMapping - Section to file mapping (digest version)
 * @param {Object} metadata - Generation metadata
 * @returns {string} Generated CLAUDE_COORDINATOR_DIGEST.md content
 */
function generateCoordinatorDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;

  const coordinatorSections = getSectionsByMapping(sections, 'CLAUDE_COORDINATOR_DIGEST.md', fileMapping);
  // SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002: the standing-responsibilities section (row 605,
  // ~18.6k chars) exceeded the 3,000 default and was silently authority-elided, dropping duties
  // 4-6 and the Adam-governance clause from the digest a context-pressured session actually loads
  // — the same failure class SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 fixed for Adam. Mirrors that
  // fix's methodology: 20,000 is the measured saturation point (larger budgets produce a
  // byte-identical file) rather than a round number.
  const coordinatorContent = coordinatorSections.map(s => formatSectionCompact(s, { maxChars: 20000 })).join('\n\n');

  const header = generateDigestHeader('CLAUDE_COORDINATOR_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_COORDINATOR.md');

  return `${header}# CLAUDE_COORDINATOR_DIGEST.md - Coordinator Role (Enforcement)

**Protocol**: LEO ${protocol.version}
**Purpose**: Coordinator role + SRE charter essentials — fleet supervisor session (<3k chars)

${fullLoadInstr}

---

${coordinatorContent}

---
*The coordinator is NOT a worker and NOT Adam. Full contract in CLAUDE_COORDINATOR.md.*
*Protocol: ${protocol.version}*
`;
}

function generateSolomonDigest(data, fileMapping, metadata) {
  const { protocol } = data;
  const sections = protocol.sections;

  const solomonSections = getSectionsByMapping(sections, 'CLAUDE_SOLOMON_DIGEST.md', fileMapping);
  // Guard: missing section → fallback, never throw
  const solomonContent = solomonSections.length > 0
    ? solomonSections.map(s => formatSectionCompact(s)).join('\n\n')
    : '*(solomon_role_contract section not yet seeded)*';

  const header = generateDigestHeader('CLAUDE_SOLOMON_DIGEST.md', metadata);
  const fullLoadInstr = generateFullLoadInstructions('CLAUDE_SOLOMON.md');

  return `${header}# CLAUDE_SOLOMON_DIGEST.md - Solomon Role (Oracle)

**Protocol**: LEO ${protocol.version}
**Purpose**: Solomon oracle role contract essentials — deep-reasoning session (<3k chars)

${fullLoadInstr}

---

${solomonContent}

---
*Solomon is NOT a worker and NOT the coordinator. Full contract in CLAUDE_SOLOMON.md.*
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
  generateExecDigest,
  generateAdamDigest,
  generateCoordinatorDigest,
  generateSolomonDigest
};
