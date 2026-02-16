# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2026-02-16 8:39:05 AM
**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow context for all sessions

> Sub-agent routing enforced by PreToolUse hook. See `scripts/hooks/pre-tool-enforce.cjs`.
> For Five-Point Brief (sub-agent prompt quality), see CLAUDE.md Issue Resolution section.
> For Strunkian writing standards, see `docs/reference/strunkian-writing-standards.md`.

---

## Migration Execution Protocol

## ⚠️ CRITICAL: Migration Execution Protocol

**CRITICAL**: When you need to execute a migration, INVOKE the DATABASE sub-agent rather than writing execution scripts yourself.

The DATABASE sub-agent handles common blockers automatically:
- **Missing SUPABASE_DB_PASSWORD**: Uses `SUPABASE_POOLER_URL` instead (no password required)
- **Connection issues**: Uses proven connection patterns
- **Execution failures**: Tries alternative scripts before giving up

**Never give up on migration execution** - the sub-agent has multiple fallback methods.

**Invocation**:
```
Task tool with subagent_type="database-agent":
"Execute the migration file: database/migrations/YYYYMMDD_name.sql"
```

## 🏗️ Application Architecture - UNIFIED FRONTEND

## Application Architecture - UNIFIED FRONTEND

### System Overview
| Component | Port | Path | Role |
|-----------|------|------|------|
| **EHG** (Frontend) | 8080 | `/mnt/c/_EHG/EHG/` | All UI (user + admin at /admin/*) |
| **EHG_Engineer** (Backend) | 3000 | `/mnt/c/_EHG/EHG_Engineer/` | REST API + LEO scripts |
| **Agent Platform** | 8000 | `/mnt/c/_EHG/EHG/agent-platform/` | AI research backend |

**Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED

### CRITICAL: During EXEC Phase
1. Read PRD from EHG_Engineer database
2. Navigate to `/mnt/c/_EHG/EHG/` for ALL frontend work
3. Admin features: `/src/components/admin/` or `/src/pages/admin/`
4. User features: `/src/components/` or `/src/pages/`
5. Push to EHG repo: `rickfelix/ehg.git`
6. Backend API changes: Navigate to EHG_Engineer

### Stack Startup
```bash
bash scripts/leo-stack.sh restart   # All 3 servers
```

## 🚀 Session Verification & Quick Start (MANDATORY)

## Session Start Checklist

### Required Verification
1. **Check Priority**: `npm run prio:top3`
2. **Git Status**: Clean working directory?
3. **Context Load**: CLAUDE_CORE.md + phase file

### ⚠️ MANDATORY: Read Entire Files (No Partial Reads)

**When reading any file that contains instructions, requirements, or critical context, you MUST read the ENTIRE file from start to finish.**

**General Rule**: If a file is important enough to read, read it completely. Partial reads lead to missed requirements.

**Files that MUST be read in full (no `limit` parameter):**
- CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
- PRD content from database
- Any file containing protocol instructions, requirements, or acceptance criteria
- Configuration files (.json, .yaml, .env.example)
- Test files when debugging failures
- Migration files when working on database changes

**When `limit` parameter IS acceptable:**
- Log files (reading recent entries)
- Large data files where you only need a sample
- Files explicitly marked as "preview only"

### Before Starting Work
- Verify SD is in correct phase
- Check for blockers: `SELECT * FROM v_sd_blockers WHERE sd_id = 'SD-XXX'`
- Review recent handoffs if continuing

### Key Commands
| Command | Purpose |
|---------|---------|
| `npm run prio:top3` | Top priority SDs |
| `git status` | Working tree status |
| `npm run handoff:latest` | Latest handoff |

## 🔍 Session Start Verification (MANDATORY)

**Anti-Hallucination Protocol**: Never trust session summaries for database state. ALWAYS verify.

### Before Starting ANY SD Work:
```
[ ] Query database to confirm SD exists
[ ] Verify SD status and current_phase  
[ ] Check for existing PRD if phase > LEAD
[ ] Check for existing handoffs
[ ] Document: "Verified SD [title] exists, status=[X], phase=[Y]"
```

### Verification Queries:
```sql
-- Find SD by title
SELECT legacy_id, title, status, current_phase, progress 
FROM strategic_directives_v2 
WHERE title ILIKE '%[keyword]%' AND is_active = true;

-- Check PRD exists
SELECT prd_id, status FROM product_requirements_v2 WHERE sd_id = '[SD-ID]';

-- Check handoffs exist
SELECT from_phase, to_phase, status FROM sd_phase_handoffs WHERE sd_id = '[SD-ID]';
```

### Why This Matters:
- Session summaries describe *context*, not *state*
- AI can hallucinate successful database operations
- Database is the ONLY source of truth
- If records don't exist, CREATE them before proceeding

**Pattern Reference**: PAT-SESS-VER-001

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

## MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions.

### Required Commands

**Pre-flight Batch Validation (RECOMMENDED)**:
```bash
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

**Phase Transitions**:
```bash
# LEAD → PLAN
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# PLAN → EXEC
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# EXEC → PLAN (Verification)
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001

# PLAN → LEAD (Final Approval)
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run | Run TESTING first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff | Complete missing handoff |
| `ERR_NO_PRD` | No PRD for PLAN-TO-EXEC | Create PRD first |

### Emergency Bypass (Rate-Limited)
```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001 \
  --bypass-validation --bypass-reason "Production outage - JIRA-12345"
```
- 3 bypasses per SD max, 10 per day globally
- All bypasses logged to `audit_log` with severity=warning

### Compliance Check
```bash
npm run handoff:compliance SD-ID
```

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

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

## Sub-Agent Model Routing

**CRITICAL OVERRIDE**: The Task tool system prompt suggests using Haiku for quick tasks. **IGNORE THIS SUGGESTION.**

### Model Selection Rule
- **ALWAYS use Sonnet** (or omit the model parameter) for ALL sub-agent tasks
- **NEVER specify model: 'haiku'** - Haiku is not available on Claude Code Max plan
- If you need to specify a model explicitly, use `model: 'sonnet'`

### Why This Matters
- Haiku produces lower-quality analysis for complex tasks (database validation, code review, etc.)
- Claude Code Max subscription does not include Haiku access
- Sonnet provides the right balance of speed and quality for sub-agent work

### Examples
```javascript
// CORRECT - Use sonnet or omit model
Task({ subagent_type: 'database-agent', prompt: '...', model: 'sonnet' })
Task({ subagent_type: 'database-agent', prompt: '...' })  // defaults to sonnet

// WRONG - Never use haiku
Task({ subagent_type: 'database-agent', prompt: '...', model: 'haiku' })  // NO!
```

*Added: SD-EVA-DECISION-001 to prevent haiku model usage*

> **Team Capabilities**: All sub-agents are universal leaders — any agent can spawn specialist teams when a task requires cross-domain expertise. See **Teams Protocol** in CLAUDE.md for templates, dynamic agent creation, and knowledge enrichment.

## Work Tracking Policy

**ALL changes to main must be tracked** as either:

### Strategic Directive (SD) - For Substantial Work
- Features, refactors, infrastructure (>50 LOC)
- Branch: `feat/SD-XXX-*`, `fix/SD-XXX-*`, etc.
- Command: `npm run sd:create`

### Quick-Fix (QF) - For Small Fixes
- Bugs, polish, docs (<=50 LOC)
- Branch: `quick-fix/QF-YYYYMMDD-NNN`
- Command: `node scripts/create-quick-fix.js --interactive`

### Why This Matters
- All work tracked in database
- Lessons learned captured
- Quality gates enforced
- Progress metrics accurate

### Emergency Bypass (Logged)
```bash
EMERGENCY_PUSH="critical: reason here" git push
```
This logs to audit_log and should be followed by retroactive SD/QF creation.

### Pre-Push Enforcement
The pre-push hook automatically:
1. Detects SD/QF from branch name
2. Verifies completion status in database
3. Blocks if not ready for merge

## 🖥️ UI Parity Requirement (MANDATORY)

**Every backend data contract field MUST have a corresponding UI representation.**

### Principle
If the backend produces data that humans need to act on, that data MUST be visible in the UI. "Working" is not the same as "visible."

### Requirements

1. **Data Contract Coverage**
   - Every field in `stageX_data` wrappers must map to a UI component
   - Score displays must show actual numeric values, not just pass/fail
   - Confidence levels must be visible with appropriate visual indicators

2. **Human Inspectability**
   - Stage outputs must be viewable in human-readable format
   - Key findings, red flags, and recommendations must be displayed
   - Source citations must be accessible

3. **No Hidden Logic**
   - Decision factors (GO/NO_GO/REVISE) must show contributing scores
   - Threshold comparisons must be visible
   - Stage weights must be displayed in aggregation views

### Verification Checklist
Before marking any stage/feature as complete:
- [ ] All output fields have UI representation
- [ ] Scores are displayed numerically
- [ ] Key findings are visible to users
- [ ] Recommendations are actionable in the UI

**BLOCKING**: Features cannot be marked EXEC_COMPLETE without UI parity verification.

## Execution Philosophy

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness > speed. 2-4 hours careful implementation beats 6-12 hours rework.

### Testing-First (MANDATORY)
- E2E testing is MANDATORY
- 100% user story coverage required
- Both unit tests AND E2E tests must pass

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth:
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Handoffs → `sd_phase_handoffs`
- Retrospectives → `retrospectives`

### Validation-First (GATEKEEPING)
- LEAD validates: Real problem? Feasible? Resources?
- After approval: SCOPE LOCK - deliver what was approved

### Anti-Bias Rules (MANDATORY)
| Bias | Incorrect | Correct |
|------|-----------|---------|
| Efficiency | Skip workflow steps | Full workflow is non-negotiable |
| Completion | "complete" = code works | "complete" = database status + validations |
| Abstraction | Children are sub-tasks | Children are INDEPENDENT SDs |
| Autonomy | No human gates | Each phase requires validation |

**RULE**: When ANY bias-pattern detected, STOP and verify with user.

**NEVER**:
- Ship without completing full LEO Protocol
- Skip LEAD approval for child SDs
- Skip PRD creation for child SDs
- Mark parent complete before all children complete in database

## 🚫 Stage 7 Hard Block: UI Coverage Prerequisite

**Effective**: LEO v4.3.3
**Scope**: IDEATION Pipeline (Stages 1-40)

### Block Condition

Stage 7 (Strategy Formulation) CANNOT begin until:
- Stages 1-6 achieve ≥80% UI coverage
- UI Parity backfill SD is completed or in-progress

### Rationale

Strategy Formulation (Stage 7) relies on human review of all prior stage outputs. If those outputs are not visible in the UI, stakeholders cannot:
1. Verify stage findings before strategic decisions
2. Review confidence levels across stages
3. Understand the full GO/NO_GO/REVISE rationale
4. Export or share findings with external stakeholders

### Verification Before Stage 7

```
STAGE 7 PRE-REQUISITES:
├── [ ] Stage 1-6 backend complete (existing)
├── [ ] Stage 1-6 tests passing (existing)
├── [ ] Stage 1-6 UI coverage ≥80% (NEW)
│   ├── Stage 1: __% coverage
│   ├── Stage 2: __% coverage
│   ├── Stage 3: __% coverage
│   ├── Stage 4: __% coverage
│   ├── Stage 5: __% coverage
│   └── Stage 6: __% coverage
└── [ ] UI Parity backfill SD status: ________
```

### Exception Process

To request an exception to this block:
1. Document business justification
2. Create explicit UI backfill SD with timeline
3. Get LEAD approval with acknowledged technical debt
4. Mark Stage 7 SD with `ui_debt_acknowledged: true`

**No exceptions without explicit LEAD approval.**

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## Child SD Pre-Work Validation (MANDATORY)

**CRITICAL**: Before starting work on any child SD (SD with parent_sd_id), run preflight validation.

### Validation Command
```bash
node scripts/child-sd-preflight.js SD-XXX-001
```

### What It Checks
1. **Is Child SD**: Verifies the SD has a parent_sd_id
2. **Dependency Chain**: For each dependency SD:
   - Status must be `completed`
   - Progress must be `100%`
   - Required handoffs must be present
3. **Parent Context**: Loads parent orchestrator for reference

### Results
**PASS** - Ready to work if:
- SD is standalone (not a child), OR
- No dependencies, OR
- All dependencies complete with required handoffs

**BLOCKED** - Cannot proceed if:
- One or more dependency SDs incomplete
- Missing required handoffs on dependencies
- Action: Complete blocking dependency first

### Integration
- `npm run sd:next` shows dependency status in queue
- Child SDs with incomplete dependencies show as BLOCKED

## 🔄 Git Commit Guidelines

**Git Commit Guidelines**: `<type>(<SD-ID>): <subject>` format MANDATORY

**Required**: Type (feat/fix/docs/etc), SD-ID scope, imperative subject, AI attribution in footer
**Timing**: After checklist items, before context switches, at logical breakpoints
**Branch Strategy**: `eng/` prefix for EHG_Engineer, standard prefixes for EHG app features
**Size**: <100 lines ideal, <200 max

**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`

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

## Critical Term Definitions

## 🚫 CRITICAL TERM DEFINITIONS (BINDING)

These definitions are BINDING. Misinterpretation is a protocol violation.

### "Complete an SD"
**Definition**: An SD is "complete" ONLY when:
1. Full LEAD→PLAN→EXEC cycle executed (per sd_type requirements)
2. Database status = 'completed'
3. All required handoffs recorded
4. Retrospective created
5. LEO Protocol validation trigger passes

**NOT complete**: Code shipped but database shows 'draft'/'in_progress'

### "Continue autonomously"
**Definition**: Execute the current SD through its full LEO Protocol workflow WITHOUT stopping to ask for user confirmation at each step.
**NOT**: Skip workflow steps for efficiency.
**AUTO-PROCEED**: Phase transitions, post-completion sequence, and next SD selection all happen automatically.
**ONLY STOP IF**:
- Blocking error requires human decision (e.g., merge conflicts)
- Tests fail after 2 retry attempts
- Critical security or data-loss scenario

### "Child SD"
**Definition**: An INDEPENDENT Strategic Directive that requires its own full LEAD→PLAN→EXEC cycle.
**NOT**: A sub-task or implementation detail of the parent.
**Each child**: Has its own PRD, handoffs, retrospective, and completion validation.

### "Ship" vs "Complete"
**Ship**: Code merged to main branch.
**Complete**: Ship + database status 'completed' + all handoffs + retrospective.
**CRITICAL**: Shipping is NECESSARY but NOT SUFFICIENT for completion.

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

## Parent-Child SD Hierarchy

### Overview
Parent SDs coordinate children; **every child goes through full LEAD→PLAN→EXEC**.

### Relationship Types
| Type | Workflow | Use Case |
|------|----------|----------|
| `standalone` | LEAD→PLAN→EXEC | Normal SDs |
| `parent` | LEAD→PLAN→waits→Complete | Multi-phase coordinator |
| `child` | LEAD→PLAN→EXEC→Complete | Sequential execution units |

### Key Rules
1. **Every child gets full LEAD→PLAN→EXEC** - no shortcuts
2. **Parent PLAN creates children** - PLAN agent proposes decomposition
3. **Parent SDs bypass user story gates** - stories exist in child SDs
4. **Children execute sequentially** - Child B waits for Child A
5. **Parent completes last** - after all children finish

### Orchestrator STOP Conditions
STOP and verify ONLY if:
- **Blocking dependency**: Child depends on incomplete child
- **Critical error**: Tests fail after 2 retries, merge conflicts
- **Database status mismatch**: Code shipped but DB shows incomplete

### Child SD Completion Checklist
- [ ] Child has PRD in `product_requirements_v2`
- [ ] LEAD-TO-PLAN and PLAN-TO-EXEC handoffs recorded
- [ ] Implementation merged to main
- [ ] EXEC-TO-PLAN and PLAN-TO-LEAD handoffs recorded
- [ ] Database status = 'completed'
- [ ] Parent progress recalculated

### Database Functions
```sql
SELECT * FROM sd_family_tree WHERE parent_id = 'SD-PARENT-001';
SELECT calculate_parent_sd_progress('SD-PARENT-001');
SELECT get_next_child_sd('SD-PARENT-001');
```

## SD Type-Aware Workflow Paths

## SD Type Validation & Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs AND different gate pass thresholds.

### Gate Pass Thresholds
| SD Type | Threshold | Required Handoffs | Notes |
|---------|-----------|-------------------|-------|
| `feature` | 85% | All 5 | Full validation |
| `bugfix` | 85% | All 5 | Regression testing critical |
| `database` | 85% | All 5 | May skip UI-dependent E2E |
| `security` | 90% | All 5 | Strictest validation |
| `refactor` | 75-90% | All 5 | Varies by intensity |
| `infrastructure` | 80% | 4 (skip EXEC-TO-PLAN) | No production code |
| `documentation` | 60% | 4 (skip EXEC-TO-PLAN) | No code changes |
| `orchestrator` | 70% | Coordinates children | USER_STORY gate bypassed |

### Workflow Paths

**Full Workflow (5 handoffs)** - feature, bugfix, database, security, refactor:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
```

**Reduced Workflow (4 handoffs)** - infrastructure, documentation:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
                                    ↑ (skip EXEC-TO-PLAN)
```

### Required Sub-Agents by Type
| SD Type | Required Sub-Agents |
|---------|---------------------|
| `feature` | TESTING, DESIGN, DATABASE, STORIES |
| `bugfix` | TESTING, REGRESSION |
| `database` | DATABASE |
| `security` | SECURITY, TESTING |
| `infrastructure` | DOCMON |

### UAT Requirements
| SD Type | UAT Required | Notes |
|---------|-------------|-------|
| `feature` | **YES** | Human-verifiable outcome |
| `bugfix` | **YES** | Verify fix works |
| `infrastructure` | **EXEMPT** | Internal tooling |
| `documentation` | No | No runtime behavior |

### Pre-Handoff Check
```bash
node scripts/handoff.js workflow SD-XXX-001  # See recommended path
```

Reference: `lib/utils/sd-type-validation.js`

## Database Sub-Agent Auto-Invocation

## Database Sub-Agent Semantic Triggering

When SQL execution intent is detected, the database sub-agent should be auto-invoked instead of outputting manual execution instructions.

### Intent Detection Triggers

The following phrases trigger automatic database sub-agent invocation:

| Category | Example Phrases | Priority |
|----------|-----------------|----------|
| **Direct Command** | "run this sql", "execute the query" | 9 |
| **Delegation** | "use database sub-agent", "have the database agent" | 8 |
| **Imperative** | "please run", "can you execute" | 8 |
| **Operational** | "update the table", "create the table" | 7 |
| **Result-Oriented** | "make this change in the database" | 6 |
| **Contextual** | "run it", "execute it" (requires SQL context) | 5 |

### Denylist Phrases (Block Execution Intent)

These phrases force NO_EXECUTION intent:
- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"

### Integration

When Claude generates SQL with execution instructions:
1. Check for SQL execution intent using `shouldAutoInvokeAndExecute()`
2. If intent detected with confidence >= 80%, use Task tool with database-agent
3. Never output "run this manually" when auto-invocation is permitted

```javascript
// Import
import { shouldAutoInvokeAndExecute } from 'lib/utils/db-agent-auto-invoker.js';

// Check before outputting SQL
const result = await shouldAutoInvokeAndExecute(sqlMessage);
if (result.shouldInvoke) {
  // Use Task tool instead of manual instructions
  Task({ subagent_type: 'database-agent', prompt: result.taskParams.prompt });
}
```

### Configuration

Runtime configuration in `db_agent_config` table:
- `MIN_CONFIDENCE_TO_INVOKE`: 0.80 (default)
- `DB_AGENT_ENABLED`: true (default)
- `DENYLIST_PHRASES`: Array of blocking phrases

### Audit Trail

All invocation decisions logged to `db_agent_invocations` table with:
- correlation_id for tracing
- intent and confidence scores
- matched trigger IDs
- decision outcome


## Database-First Enforcement - Expanded

**Database-First Enforcement (MANDATORY)**:

**❌ NEVER create**: Strategic Directive files, PRD files, Retrospective files, Handoff documents, Verification reports

**✅ REQUIRED**: All data in database tables only
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Retrospectives → `retrospectives`
- Handoffs → `sd_phase_handoffs` ⚠️ (CANONICAL - see note below)

#### ⚠️ Handoff Table Clarification (IMPORTANT)
Two handoff-related tables exist - use the correct one:

| Table | Purpose | Use For |
|-------|---------|---------|
| `sd_phase_handoffs` | **Handoff artifacts** (content, summaries) | Compliance checks, handoff content |
| `leo_handoff_executions` | **Execution metadata** (scores, status) | Statistics, execution tracking |

**For compliance verification**: Query `sd_phase_handoffs` (created_by = 'UNIFIED-HANDOFF-SYSTEM')
**For handoff stats**: Query `leo_handoff_executions`

**NEVER** check `leo_handoff_executions` to verify handoffs exist - it only has execution metadata, not the actual handoff records.

**Why**: Single source of truth, real-time updates, automated tracking, no file sync issues

**Verification**: `find . -name "SD-*.md" -o -name "PRD-*.md"` should return ONLY legacy files

## 🗄️ Supabase Database Operations

### Connection Details (CONSOLIDATED DATABASE)
- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Connection**: Via Supabase client using environment variables

### ⚠️ CRITICAL: Database Connection Pattern

**NEVER use raw psql to direct Supabase URL** - it will timeout:
```bash
# ❌ WRONG - Times out after 30+ seconds
psql 'postgresql://postgres.PROJECT:password@PROJECT.supabase.co:5432/postgres'
```

**ALWAYS use connection helpers from `scripts/lib/supabase-connection.js`**:

#### For SQL Queries (raw PostgreSQL):
```javascript
import { createDatabaseClient } from './scripts/lib/supabase-connection.js';
const client = await createDatabaseClient();
const result = await client.query('SELECT * FROM table_name WHERE id = $1', ['value']);
await client.end();
```

#### For Supabase-style Queries (recommended):
```javascript
import { createSupabaseServiceClient } from './scripts/lib/supabase-connection.js';
const client = await createSupabaseServiceClient();
const { data, error } = await client.from('table_name').select('*').eq('id', 'value');
```

**Why?** The helpers use the connection pooler URL (`aws-1-us-east-1.pooler.supabase.com`) which handles connection management properly, while direct URLs timeout due to connection limits.

### Running SQL Migrations
For SQL migrations, use the Supabase CLI or dashboard SQL editor:
- **Dashboard**: Project > SQL Editor > paste and run
- **CLI**: `npx supabase db push` (if set up)
- **Script**: Create a .mjs script using `createDatabaseClient()`

## Compaction Instructions (CRITICAL)

**When context is compacted (manually or automatically), ALWAYS preserve:**

1. **Current SD State** (NEVER LOSE):
   - Current SD key (e.g., `SD-FIX-ANALYTICS-001`)
   - Current phase (LEAD/PLAN/EXEC)
   - Gate pass/fail status
   - Active branch name

2. **Modified Files** (PRESERVE LIST):
   - All files changed in current session
   - Pending uncommitted changes
   - Recent commit hashes (last 3)

3. **Critical Context** (SUMMARIZE, DON'T DROP):
   - Active user stories being implemented
   - Specific error messages being debugged
   - Database query results that drive decisions
   - Test commands and their outcomes

4. **NEVER Compress Away**:
   - The `.claude/session-state.md` reference
   - The `.claude/compaction-snapshot.md` reference
   - Active PRD requirements
   - User's explicit instructions from this session

5. **Safe to Discard**:
   - Verbose sub-agent exploration logs
   - Full file contents (keep file paths only)
   - Repetitive status checks
   - Historical handoff details (older than current phase)

**After compaction, IMMEDIATELY read:**
- `.claude/compaction-snapshot.md` (git state)
- `.claude/session-state.md` (work state)

**Session Restoration Protocol**: If you notice context seems sparse or you're missing critical details, proactively ask: "I may have lost context during compaction. Let me check .claude/session-state.md for current work state."

## Script Creation Anti-Patterns

### PROHIBITED Patterns

**One-Off Creation Scripts**
Never create single-use scripts for SD or PRD creation:
- ❌ `create-prd-sd-*.js` → Use `node scripts/add-prd-to-database.js`
- ❌ `create-*-sd.js` → Use `node scripts/leo-create-sd.js`
- ❌ `insert-prd-*.js` → Use the modular PRD system

**Why This is Critical**
1. **Maintenance Debt**: We archived 200+ one-off scripts in LEO 5.0 cleanup
2. **Validation Bypass**: One-off scripts skip quality gates
3. **Pattern Fragmentation**: Each script implements creation differently

### Archived Script Locations
- `scripts/archived-prd-scripts/` - Legacy PRD creation scripts
- `scripts/archived-sd-scripts/` - Legacy SD creation scripts

### Required CLI Tools
| Purpose | Command |
|---------|---------|
| Create SD | `node scripts/leo-create-sd.js` |
| Create PRD | `node scripts/add-prd-to-database.js` |
| PRD Validation | `node scripts/validate-new-prd.js` |

## Background Task Output Retrieval

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

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







## Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

### 1. PLAN_TO_EXEC Handoff Retrospective: Enum Validation & Field Naming (SD-EVA-FIX-ENUM-NAMING-001) [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 2/14/2026 | **Score**: 100

**Key Improvements**:
- PLAN-TO-EXEC handoff required 7 attempts due to cascading gate failures: PRD status mismatch, target...
- SD description stated "typeof string checks" but actual codebase used type:string in schemas with va...

**Action Items**:
- [ ] Add enum value validation to Build Loop stage template CI: if a new category is ...
- [ ] Update SD description writing guidelines to require code-level specificity: refe...

### 2. SD Completion Retrospective: Enum Validation & Field Naming (SD-EVA-FIX-ENUM-NAMING-001) [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 2/14/2026 | **Score**: 100

**Key Improvements**:
- PLAN-TO-EXEC handoff required 7 attempts due to cascading gate failures: PRD status mismatch, target...
- SD description stated "typeof string checks" but actual codebase used type:string in schemas with va...

**Action Items**:
- [ ] Add enum value validation to Build Loop stage template CI: if a new category is ...
- [ ] Update SD description writing guidelines to require code-level specificity: refe...

### 3. Kill Gate Logic Fixes - EXEC Completion Retrospective [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 2/14/2026 | **Score**: 100

**Key Improvements**:
- {"issue":"PLAN-TO-EXEC handoff rejected 3 times before passing. First rejection: stale session claim...
- {"issue":"User story acceptance_criteria format mismatch: BMAD story generator output JSON strings f...

**Action Items**:
- [ ] Add acceptance_criteria format validation to BMAD story generator output, ensuri...
- [ ] Implement batch rejection reporting in handoff pre-validation: surface ALL block...

### 4. Chairman Governance Gates: Pattern Reuse and Cross-SD Test Compatibility [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 2/14/2026 | **Score**: 100

**Key Improvements**:
- [PAT-AUTO-b37be076] Handoff EXEC-TO-LEAD failed with exit code 1
- [PAT-AUTO-280c5347] Gate PLAN_TO_LEAD_HANDOFF_EXISTS failed: score 0/100

**Action Items**:
- [ ] SD-LEO-FIX-CLAIM-DUAL-TRUTH-001: Unify claim resolution to use sd_claims as sing...
- [ ] Address 13 pre-existing analysis-steps test failures in a separate SD to prevent...

### 5. SD Completion Retrospective: EVA Event Bus Unit Test Coverage (SD-EVA-FIX-POST-LAUNCH-001) [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 2/14/2026 | **Score**: 100

**Key Improvements**:
- Mock fidelity risk: vi.mock() stubs for Supabase return hardcoded success responses that may not ref...
- No integration test layer exists to validate event-router against a real Supabase instance - mocks m...

**Action Items**:
- [ ] Create integration test suite for event-router that runs processEvent against a ...
- [ ] Add vitest coverage threshold configuration for eva/event-bus/ modules to preven...


*Lessons auto-generated from `retrospectives` table. Query for full details.*


## Agent Responsibilities

| Agent | Code | Responsibilities | % Split |
|-------|------|------------------|----------|
| Implementation Agent | EXEC | Implementation based on PRD. **CRITICAL: Implementations happen in /mnt/c/_EHG/e... | I:30 = 30% |
| Strategic Leadership Agent | LEAD | Strategic planning, business objectives, final approval. **SIMPLICITY FIRST (PRE... | P:20 A:15 = 35% |
| Technical Planning Agent | PLAN | Technical design, PRD creation with comprehensive test plans, pre-automation val... | P:20 V:15 = 35% |

**Legend**: P=Planning, I=Implementation, V=Verification, A=Approval
**Total**: EXEC (30%) + LEAD (35%) + PLAN (35%) = 100%

## Progress Calculation

```
Total = EXEC: 30% + LEAD: 35% + PLAN: 35% = 100%
```

## Available Sub-Agents

Invoke via Task tool with `subagent_type="<CODE>"`. Routing hints provided by PreToolUse hook.
Results MUST be persisted to `sub_agent_execution_results` table.

| Code | Name | Purpose |
|------|------|---------|
| `RCA` | Root Cause Analysis Agent | MUST BE USED PROACTIVELY for all root cause analysis tasks.  |
| `REGRESSION` | Regression Validator Sub-Agent | Validates that refactoring changes maintain backward compati |
| `DOCMON` | Information Architecture Lead | ## Information Architecture Lead v3.0.0 - Database-First Enf |
| `QUICKFIX` | Quick-Fix Orchestrator ("LEO Lite" Field Medic) | Lightweight triage and resolution for small UAT-discovered i |
| `UAT` | UAT Test Executor | Interactive UAT test execution guide for manual testing work |
| `SECURITY` | Chief Security Architect | Former NSA security architect with 25 years experience secur |
| `GITHUB` | DevOps Platform Architect | # DevOps Platform Architect Sub-Agent  **Identity**: You are |
| `DATABASE` | Principal Database Architect | ## Principal Database Architect v2.0.0 - Lessons Learned Edi |
| `TESTING` | QA Engineering Director | ## Enhanced QA Engineering Director v2.4.0 - Retrospective-I |
| `PERFORMANCE` | Performance Engineering Lead | Performance engineering lead with 20+ years optimizing high- |
| `RETRO` | Continuous Improvement Coach | ## Continuous Improvement Coach v4.0.0 - Quality-First Editi |
| `LAUNCH` | Launch Orchestration Sub-Agent | Handles production launch orchestration, go-live checklists, |
| `MONITORING` | Monitoring Sub-Agent | Handles monitoring setup, alerting, SLA definition, health c |
| `FINANCIAL` | Financial Modeling Sub-Agent | Handles financial projections, P&L modeling, cash flow analy |
| `API` | API Architecture Sub-Agent | ## API Sub-Agent v1.0.0  **Mission**: REST/GraphQL endpoint  |
| `VALIDATION` | Principal Systems Analyst | ## Principal Systems Analyst v3.0.0 - Retrospective-Informed |
| `PRICING` | Pricing Strategy Sub-Agent | Handles pricing model development, unit economics, pricing t |
| `ANALYTICS` | Analytics Sub-Agent | Handles analytics setup, metrics definition, dashboard creat |
| `RISK` | Risk Assessment Sub-Agent | ## Risk Assessment Sub-Agent v1.0.0  **BMAD Enhancement**: M |
| `MARKETING` | Marketing & GTM Sub-Agent | Handles go-to-market strategy, marketing campaigns, channel  |
| `SALES` | Sales Process Sub-Agent | Handles sales playbook development, pipeline management, obj |
| `DESIGN` | Senior Design Sub-Agent | ## Senior Design Sub-Agent v6.0.0 - Lessons Learned Edition  |
| `VALUATION` | Exit Valuation Sub-Agent | Handles exit valuation modeling, comparable analysis, acquis |
| `DEPENDENCY` | Dependency Management Sub-Agent | # Dependency Management Specialist Sub-Agent  **Identity**:  |
| `CRM` | CRM Sub-Agent | Handles customer relationship management, lead tracking, cus |
| `STORIES` | User Story Context Engineering Sub-Agent | ## User Story Context Engineering v2.0.0 - Lessons Learned E |
| `PRIORITIZATION_PLANNER` | Prioritization Planner | # Prioritization Planner Sub-Agent  **Identity**: You are a  |
| `ORCHESTRATOR_CHILD` | Orchestrator Child Agent | Teammate agent for parallel child SD execution within an orc |
| `AUDIT` | Self-Audit Agent | Read-only audit capability for SD health checks. Evaluates s |
| `JUDGE` | Constitutional Judge | Resolves conflicts between LEO agent recommendations using c |
| `CLAIM` | Claim Management | SD claim status, release, and listing via /claim command |
| `VETTING` | Vetting Engine | Constitutional vetting of proposals using AEGIS framework. R |


---

*Generated from database: 2026-02-16*
*Protocol Version: 4.3.3*
*Includes: Proposals (0) + Hot Patterns (0) + Lessons (5)*
*Load this file first in all sessions*
