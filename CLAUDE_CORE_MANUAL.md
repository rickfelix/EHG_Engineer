<!-- file_content_hash: 8f59d343852cfcc2 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_CORE_MANUAL.md — Core Manual (reference companion)

**Generated**: 2026-09-01 5:39:58 PM
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

## Claude Code Plan Mode Integration

**Status**: ACTIVE | **Version**: 1.0.0

### Overview
Claude Code's Plan Mode integrates with LEO Protocol to provide:
- **Automatic Permission Bundling** - Reduces prompts by 70-80%
- **Intelligent Plan Generation** - SD-type aware action plans
- **Phase Transition Automation** - Activates at phase boundaries

### SD Type Profiles
| SD Type | Workflow | Sub-Agents | PR Size Target |
|---------|----------|------------|----------------|
| `feature` | full | RISK, VALIDATION, STORIES | 100 (max 400) |
| `enhancement` | standard | VALIDATION | 75 (max 200) |
| `bug` | fast | RCA | 50 (max 100) |
| `infrastructure` | careful | RISK, GITHUB, REGRESSION | 50 (max 150) |
| `refactor` | careful | REGRESSION, VALIDATION | 100 (max 300) |
| `security` | careful | SECURITY, RISK | 50 (max 150) |
| `documentation` | light | DOCMON | no limit |

### Permission Bundling by Phase
| Phase | Pre-approved Actions |
|-------|---------------------|
| LEAD | SD queue commands, handoff scripts, git status |
| PLAN | PRD generation, sub-agent orchestration, git branches |
| EXEC | Tests, builds, git commit/push, handoff scripts |
| VERIFY | Verification scripts, handoff scripts |
| FINAL | Merge operations, archive commands |

### Automatic Activation
- **Session start**: If SD detected on current branch
- **Phase boundaries**: Before each handoff execution

### Configuration
```json
// .claude/leo-plan-mode-config.json
{ "leo_plan_mode": { "enabled": true, "permission_pre_approval": true } }
```

### Module Location
`scripts/modules/plan-mode/` - LEOPlanModeOrchestrator.js, phase-permissions.js

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

## Protocol Consistency Linter

Static checks for the LEO Protocol CLAUDE.md family. Detects threshold drift, enum drift, version drift, duplicate authoritative lists, and other consistency violations.

### Commands
| Command | Purpose |
|---------|---------|
| `npm run protocol:lint` | On-demand audit. Writes violations to `leo_lint_violations`. Exit non-zero on blocking violations. |
| `npm run protocol:lint:test` | Run rule fixtures (positive/negative). CI uses this to verify rules. |
| `npm run protocol:lint:promote <rule-id>` | Promote a warn-severity rule to block-severity. Requires 2+ clean regen runs. |

### Auto-run
The linter runs inside `generate-claude-md-from-db.js` after DB fetch and before file writes. Block-severity violations abort the regen — CLAUDE*.md files are not overwritten when drift is detected.

### Bypass (rate-limited)
```bash
node scripts/generate-claude-md-from-db.js --skip-lint --skip-reason "<text>"
```
Limit: 3 bypasses per repository per week. All bypasses logged to `leo_lint_run_history`.

### Where things live
| Item | Location |
|------|----------|
| Declarative rules (JSON pattern) | `scripts/protocol-lint/rules/declarative/*.json` |
| Code rules (semantic) | `scripts/protocol-lint/rules/code/*.mjs` |
| Fixtures (positive + negative per rule) | `scripts/protocol-lint/fixtures/*.json` |
| Engine | `scripts/protocol-lint/engine.mjs` |
| Audit tables | `leo_lint_violations`, `leo_lint_run_history`, `leo_lint_rules` |

### Adding a rule
New rules ship at `severity='warn'`. After 2+ consecutive regen runs with zero violations on a rule, run `npm run protocol:lint:promote <rule-id>` to elevate to `severity='block'`. Every rule must include a positive fixture (triggers detection) and a negative fixture (does not trigger).

*Added: SD-PROTOCOL-LINTER-001*

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

## Tiered Auto-Apply Policy (SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001)

Handoff-time migration auto-apply is gated by a **fail-closed, allow-list tier classifier** (`scripts/lib/migration-tier-classifier.mjs`). The classifier is PURE (no DB/IO) and **default-deny**: a migration is auto-apply-eligible **only** when EVERY statement provably matches an additive allow rule.

- **TIER-1 (auto-apply eligible)** — provably additive only: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX` (incl. CONCURRENTLY / IF NOT EXISTS), nullable `ADD COLUMN` with a constant-only default, `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY`, and bare `CREATE FUNCTION`/`VIEW` (NOT `OR REPLACE`, no `SECURITY DEFINER`, body free of destructive SQL). These flow to the DATABASE sub-agent for execution (the mechanics above are unchanged).
- **TIER-2 (chairman-gated)** — EVERYTHING ELSE: any `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`/`RENAME`/`GRANT`/`REVOKE`, `ALTER COLUMN ... TYPE`, multi-action ALTER with a non-additive action, volatile or `NOT NULL` defaults, `CREATE OR REPLACE`, `SECURITY DEFINER`, `DO` blocks, named-`$tag$` function bodies hiding destructive SQL, and unparseable/under-split/ambiguous input. These are **never auto-applied** — they require the full 3-factor `@approved-by` chairman gate:
  ```
  node scripts/apply-migration.js <path> --prod-deploy
  ```
  (`--prod-deploy` + a single-use 1h token + an `-- @approved-by: <email>` header matching `git config user.email` — enforced by `scripts/lib/migration-guards.js`, which the tier classifier NEVER weakens.)

**Default-deny safety contract**: a false TIER-1 verdict on a destructive migration would auto-apply it past the chairman gate, so the classifier is allow-list only, NEVER throws, and NEVER returns TIER-1 on any error/ambiguity path. Both auto-apply vectors are gated — SD-declared migrations AND uncommitted manual-update SQL.

**Rollout**: the gate reads the `LEO_MIGRATION_TIER_GATE_BYPASS` flag in `leo_feature_flags` — ONE representation every execution path sees, worktrees included. Polarity is INVERTED deliberately: the flag stores a BYPASS, so the evaluator’s `enabled=false` default (returned for `evaluation_error`, `flag_not_found`, `kill_switch_active`, `lifecycle_draft`) means *no bypass*, i.e. the gate is **ON**. It therefore FAILS CLOSED — an unreachable DB means the gate holds, never that destructive DDL auto-applies. `LEO_MIGRATION_TIER_GATE` is **deprecated and ignored** (it logs a removal notice): it is present in `.env` on every surface and is loaded regardless of cwd, so honouring it would short-circuit before every DB read and leave the flag permanently inert. The break-glass is `LEO_MIGRATION_TIER_GATE_FORCE_ON=1`, which can only force the gate ON — no env value turns it off. To disable the gate, disable the flag in the DB. NOTE (measured, and the opposite of what an earlier draft of this line claimed): the `risk_tier: high` approval requirement is enforced ONLY on `transitionLifecycleState` — `updateFlag({isEnabled:true})` and a raw service-role UPDATE both succeed with **zero** approvals, and no RLS policy, trigger or CHECK blocks them. This flag is protected by default-OFF, inverted polarity, service-role key custody and the `fn_audit_feature_flag_changes` audit trail — NOT by an enforced approval gate. Every tier decision is still audited fail-soft to `audit_log` as `MIGRATION_TIER_CLASSIFICATION`, and the audit row now reports the verdict actually used rather than re-deriving it from the environment. (SD-LEO-INFRA-TIER-GATE-FLAG-001)

**Note on the Adam-delegated `--prod-deploy` flow (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C, 2026-07-18)**: `lib/migration/adam-delegated-apply.js` (GAP A, SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001) applies a STRICTER, SEPARATE scope check that excludes `create_policy`/`enable_rls` tokens — but this check only fires inside the Adam-persona kill-switch-gated delegated-apply path (`-- @delegated-by: adam` marker present AND `LEO_ADAM_DBAPPLY_DELEGATION=on`, default OFF). It does NOT narrow the general TIER-1 allow-list above for an ordinary EXEC-phase migration executed via the DATABASE sub-agent's `run-sql-migration.js` path — `CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` on a brand-new table remain TIER-1 there. The two vectors were confused once already (RCA-verified) because both reuse tier-classifier language; treat them as distinct gates for distinct flows, not one rule with an exception.

## Sub-Agent Keyword Routing Table

| Agent | Trigger Keywords | Best For |
|-------|-----------------|----------|
| database-agent | migration, schema, sql, postgres, rls | Database operations, migrations, RLS policies |
| design-agent | component design, tailwind, responsive, a11y | UI/UX design, accessibility, frontend components |
| security-agent | auth bypass, csrf, xss, vulnerability | Security audits, vulnerability fixes |
| testing-agent | test coverage, e2e test, unit test, vitest | Test creation, test infrastructure |
| performance-agent | bottleneck, load time, memory leak | Performance optimization, profiling |
| rca-agent | root cause, 5 whys, failure analysis | Root cause analysis, debugging |
| docmon-agent | documentation update, api docs, readme | Documentation maintenance |
| regression-agent | backward compatible, breaking change, refactor | Refactoring safety, API compatibility |
| retro-agent | retrospective, lessons learned, post-mortem | Sprint retrospectives, learning capture |
| risk-agent | risk assessment, security risk, tradeoff | Risk analysis, architecture decisions |
| validation-agent | duplicate check, existing implementation | Codebase validation, overlap detection |
| stories-agent | user stories, acceptance criteria, epic | User story generation |
| github-agent | pull request, ci pipeline, code review | Git operations, CI/CD |
| api-agent | api endpoint, rest api, graphql | API design and implementation |
| dependency-agent | npm audit, outdated packages, vulnerability | Dependency management |
| uat-agent | user acceptance test, user journey, manual test | User acceptance testing |

### Invocation Pattern
```
Task(subagent_type="<agent-name>", prompt="Execute <AGENT> analysis for SD-XXX...")
```

## Genesis Codebase Locations (detail)

## Genesis Codebase Locations

**CRITICAL**: Genesis spans TWO codebases:

| Codebase | Path | Contents |
|----------|------|----------|
| **EHG_Engineer** | `/lib/genesis/` | Infrastructure (quality gates, TTL, patterns) |
| **EHG App** | `/lib/genesis/` | Orchestrators (ScaffoldEngine, repo-creator) |
| **EHG App** | `/scripts/genesis/` | Pipeline (genesis-pipeline.js, soul-extractor.js) |

### Quick Reference
| Task | Location |
|------|----------|
| Create simulation | `node /ehg/scripts/genesis/genesis-pipeline.js create "seed"` |
| Ratify simulation | `POST /api/genesis/ratify` |
| Query patterns | `EHG_Engineer/lib/genesis/pattern-library.js` |
| Run quality gates | `EHG_Engineer/lib/genesis/quality-gates.js` |
| Soul extraction (Stage 16) | `ehg/scripts/genesis/soul-extractor.js` |
| Production gen (Stage 17) | `ehg/scripts/genesis/production-generator.js` |

### Full Documentation
- Implementation guide: `docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md`
- Quick reference: `docs/reference/genesis-codebase-guide.md`

---

*Generated from database: 2026-09-01*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=governance_strategic_hierarchy, builtin_agent_integration, pattern_search_guide, ai_quality_russian_judge, pr_size_guidelines, governance_chairman_ceo_roles, database_column_reference, migration_tier_policy_detail, sub_agent_routing_table_detail, infrastructure, protocol_lint_tooling, genesis_codebase_detail). Do not hand-edit — edit the DB section and regenerate.*
