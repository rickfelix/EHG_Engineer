<!-- file_content_hash: 5acd8e25d6457852 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_CORE_MANUAL.md — Core Manual (reference companion)

**Generated**: 2026-08-29 1:41:05 PM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form CORE reference — strategic governance hierarchy, Chairman/CEO roles, PR size tier rationale, Russian Judge quality rubric, built-in agent architecture, pattern search CLI
**Load when**: At the MOMENT OF DOING one of these procedures — not at every session start

> This companion carries REFERENCE ONLY. Every RULE that governs a session (Small PRs, Global Negative Constraints, Gate Failure Protocol, migration/model-routing/supabase-connection prohibitions, etc.) stays in CLAUDE_CORE.md and is in force whether or not this file is read.

---

## 🤖 Built-in Agent Integration

## Built-in Agent Integration

### Three-Layer Agent Architecture

LEO Protocol uses three complementary agent layers:

| Layer | Source | Agents | Purpose |
|-------|--------|--------|---------|
| **Built-in** | Claude Code | `Explore`, `Plan` | Fast discovery & multi-perspective planning |
| **Sub-Agents** | `.claude/agents/` | DATABASE, TESTING, VALIDATION, etc. | Formal validation & gate enforcement |
| **Skills** | `~/.claude/skills/` | 54 skills | Creative guidance & patterns |

### Integration Principle

> **Explore** for discovery → **Sub-agents** for validation → **Skills** for implementation patterns

Built-in agents run FIRST (fast, parallel exploration), then sub-agents run for formal validation (database-driven, deterministic).

### When to Use Each Layer

| Task | Use | Example |
|------|-----|---------|
| "Does this already exist?" | Explore agent | `Task(subagent_type="Explore", prompt="Search for existing auth implementations")` |
| "What patterns do we use?" | Explore agent | `Task(subagent_type="Explore", prompt="Find component patterns in src/")` |
| "Is this schema valid?" | Sub-agent | `node lib/sub-agent-executor.js DATABASE <SD-ID>` |
| "How should I build this?" | Skills | `skill: "schema-design"` or `skill: "e2e-patterns"` |
| "What are the trade-offs?" | Plan agent | Launch 2-3 Plan agents with different perspectives |

### Parallel Execution

Built-in agents support parallel execution. Launch multiple Explore agents in a single message:

```
Task(subagent_type="Explore", prompt="Search for existing implementations")
Task(subagent_type="Explore", prompt="Find related patterns")
Task(subagent_type="Explore", prompt="Identify affected areas")
```

This is faster than sequential exploration and provides comprehensive coverage.

## PR Size Guidelines

**Philosophy**: Balance AI capability with human review capacity. Modern AI can handle larger changes, but humans still need to review them.

**Three Tiers**:

1. **≤100 lines (Sweet Spot)** - No justification needed
   - Simple bug fixes
   - Single feature additions
   - Configuration changes
   - Documentation updates

2. **101-200 lines (Acceptable)** - Brief justification in PR description
   - Multi-component features
   - Refactoring with tests
   - Database migrations with updates
   - Example: "Adds authentication UI (3 components) + tests"

3. **201-400 lines (Requires Strong Justification)** - Detailed rationale required
   - Complex features that cannot be reasonably split
   - Large refactorings with extensive test coverage
   - Third-party integrations with configuration
   - Must explain why splitting would create more risk/complexity
   - Example: "OAuth integration requires provider config, UI flows, session management, and error handling as atomic unit"

**Over 400 lines**: Generally prohibited. Split into multiple PRs unless exceptional circumstances (emergency hotfix, external dependency forcing bundled changes).

**Key Principle**: If you can split it without creating incomplete/broken intermediate states, you should split it.

## 🔍 Issue Pattern Search (Knowledge Base)

## Issue Pattern Search (Knowledge Base)

Search the pattern database for known issues before implementing fixes.

### When to Search
- **PLAN Phase**: Before schema/auth/security work
- **EXEC Phase**: Before implementing, when hitting errors
- **Retrospective**: Auto-extracted

### CLI Commands
```bash
npm run pattern:alert:dry          # Active patterns near thresholds
npm run pattern:resolve PAT-XXX "Fixed by implementing XYZ"
```

### Programmatic API
```javascript
import { IssueKnowledgeBase } from './lib/learning/issue-knowledge-base.js';
const kb = new IssueKnowledgeBase();

const patterns = await kb.search('', { category: 'database' });
const solution = await kb.getSolution('PAT-003');
```

### Category → Sub-Agent Mapping
| Category | Sub-Agents |
|----------|------------|
| database | DATABASE, SECURITY |
| testing | TESTING, UAT |
| security | SECURITY, DATABASE |
| deployment | GITHUB, DEPENDENCY |
| protocol | RETRO, DOCMON, VALIDATION |

### Auto-SD Creation Thresholds
- Critical severity: 5+ occurrences
- High severity: 7+ occurrences
- Increasing trend: 4+ occurrences

## 📊 Database Column Quick Reference

### Priority Column (strategic_directives_v2)
**Type**: STRING (not integer!)
**Valid Values**: 'critical', 'high', 'medium', 'low'

**Correct Usage**:
```javascript
// Filter by priority
.in('priority', ['critical', 'high'])

// Display priority
console.log(sd.priority.toUpperCase()) // 'CRITICAL'
```

**Wrong Usage** (will silently fail):
```javascript
// DON'T DO THIS - compares string to integer
.in('priority', [1, 2])  // Returns empty!
sd.priority === 1 ? 'CRITICAL' : 'LOW'  // Always 'LOW'!
```

**Pattern Reference**: PAT-DATA-TYPE-001


## AI-Powered Russian Judge Quality Assessment

**Status**: ACTIVE | **Model**: gpt-5-mini | **Threshold**: 70% weighted score | **Storage**: ai_quality_assessments

### Overview
Multi-criterion weighted scoring evaluates deliverable quality. Each rubric scores content 0-10 per criterion, applies weights, and generates graduated feedback.

### Rubric Criteria Summary

| Content Type | Phase | Key Criteria (Weight) |
|--------------|-------|----------------------|
| **SD** | LEAD | Description (35%), Objectives (30%), Metrics (25%), Risks (10%) |
| **PRD** | PLAN | Requirements (40%), Architecture (30%), Tests (20%), Risks (10%) |
| **User Story** | PLAN | Acceptance Criteria (40%), INVEST (35%), Feasibility (15%), Context (10%) |
| **Retrospective** | EXEC | Issue Analysis (40%), Solutions (30%), Lessons (20%), Metadata (10%) |

### Scoring Scale
- **0-3**: Inadequate (placeholder text, boilerplate, missing)
- **4-6**: Needs improvement (generic, lacks specificity)
- **7-8**: Good quality (specific, actionable)
- **9-10**: Excellent (rare - comprehensive with measurement methods)

### Anti-Patterns (Score 0-3)
- Placeholder text: "To be defined", "TBD"
- Generic benefits: "improve UX", "better system"
- Missing architecture details or metrics

### Integration
- **LEAD→PLAN**: SDQualityRubric validates SD before PRD creation
- **PLAN→EXEC**: PRDQualityRubric + UserStoryQualityRubric validate before implementation
- **On Failure**: Returns issues/warnings for revision

### Files Reference
- Rubrics: `/scripts/modules/rubrics/*.js`
- Base: `/scripts/modules/ai-quality-evaluator.js`
- Full documentation: `docs/reference/ai-quality-rubrics.md`

## Strategic Governance Hierarchy

The EHG platform operates under a 7-layer strategic governance stack. Each layer has a database table, CLI command, and clear purpose.

| Layer | Purpose | Database Table | CLI Command |
|-------|---------|---------------|-------------|
| **Mission** | Permanent organizational purpose | `missions` | `node scripts/eva/mission-command.mjs view` |
| **Constitution** | Immutable operating rules (CONST-001–009) | `protocol_constitution` | `node scripts/eva/constitution-command.mjs view` |
| **Vision** | 2-5 year strategic direction with scoring dimensions | `eva_vision_documents` | (managed via EVA scoring) |
| **Strategy** | Annual themes derived from vision | `strategic_themes` | `node scripts/eva/strategy-command.mjs view` |
| **OKRs** | Quarterly/monthly objectives with measurable KRs | `objectives` + `key_results` | `node scripts/eva/okr-command.mjs review` |
| **KRs** | Quantitative targets (baseline → target) linked to vision dimensions | `key_results` | `node scripts/eva/okr-command.mjs link` |
| **SDs** | Implementation units following LEAD→PLAN→EXEC | `strategic_directives_v2` | `npm run sd:next` |

**Hierarchy flow**: Mission → Constitution → Vision → Strategy → OKRs → KRs → SDs

Each SD should trace upward through this hierarchy. When evaluating or creating SDs, consider which OKR/KR the work advances.

## Chairman and CEO Governance Roles

### Chairman (Human Owner)
- **Owns**: Mission statement and Constitution rules
- **Approves**: Mission revisions (`mission-command.mjs propose`), constitutional amendments (`constitution-command.mjs amend`)
- **Authority**: Final say on strategic direction; immutable rules cannot be changed without Chairman approval

### CEO Agent (EVA)
- **Owns**: Strategy derivation, OKR generation, brainstorm-to-vision pipeline
- **Generates**: Monthly OKRs via `okr-command.mjs generate` (40% top-down from vision gaps, 60% bottom-up from retrospectives)
- **Derives**: Annual themes from vision dimensions via `strategy-command.mjs derive`
- **Wires**: Brainstorm session outcomes to vision documents via `brainstorm-to-vision.mjs`
- **Reports**: OKR progress snapshots, objective scoring, KR status tracking

### Separation of Concerns
| Action | Owner | Requires Approval? |
|--------|-------|--------------------|
| Change mission | Chairman | Yes (propose → approve) |
| Amend constitution | Chairman | Yes (draft → active) |
| Derive strategy themes | CEO (EVA) | No (automated from vision) |
| Generate monthly OKRs | CEO (EVA) | No (automated, logged in `okr_generation_log`) |
| Link KRs to vision dimensions | CEO (EVA) | No (via `okr-command.mjs link`) |
| Create/approve SDs | LEO Protocol | Yes (LEAD phase gates) |

---

*Generated from database: 2026-08-29*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=governance_strategic_hierarchy, builtin_agent_integration, pattern_search_guide, ai_quality_russian_judge, pr_size_guidelines, governance_chairman_ceo_roles, database_column_reference). Do not hand-edit — edit the DB section and regenerate.*
