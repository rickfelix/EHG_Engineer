# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2026-01-25 1:41:46 PM
**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

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

## Mandatory Agent Invocation Rules

**CRITICAL**: Certain task types REQUIRE specialized agent invocation - NO ad-hoc manual inspection allowed.

### Task Type -> Required Agent

| Task Keywords | MUST Invoke | Purpose |
|---------------|-------------|---------|
| UI, UX, design, landing page, styling, CSS, colors, buttons | **design-agent** | Accessibility audit (axe-core), contrast checking |
| accessibility, a11y, WCAG, screen reader, contrast | **design-agent** | WCAG 2.1 AA compliance validation |
| form, input, validation, user flow | **design-agent** + **testing-agent** | UX + E2E verification |
| performance, slow, loading, latency | **performance-agent** | Load testing, optimization |
| security, auth, RLS, permissions | **security-agent** | Vulnerability assessment |
| API, endpoint, REST, GraphQL | **api-agent** | API design patterns |
| database, migration, schema | **database-agent** | Schema validation |
| test, E2E, Playwright, coverage | **testing-agent** | Test execution |

### Why This Exists

**Incident**: Human-like testing perspective interpreted as manual content inspection.
**Result**: 47 accessibility issues missed, including critical contrast failures (1.03:1 ratio).
**Root Cause**: Ad-hoc review instead of specialized agent invocation.
**Prevention**: Explicit rules mandate agent use for specialized tasks.

### How to Apply

1. Detect task type from user request keywords
2. Invoke required agent(s) BEFORE making changes
3. Agent findings inform implementation
4. Re-run agent AFTER changes to verify fixes

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

## 🎯 Skill Integration (Claude Code Skills)

## Skill Integration (Claude Code Skills)

**Skills complement the LEO Protocol by providing pattern guidance BEFORE implementation.**

### Skill-Agent Relationship
| Component | Location | Role |
|-----------|----------|------|
| Skills | ~/.claude/skills/ | How to build (patterns, best practices) |
| Sub-Agents | .claude/agents/ | Did you build it right (verification) |

### Phase Chains (Quick Reference)
| Phase | Key Skills |
|-------|-----------|
| **LEAD** | session-verification, duplicate-detection, scope-validation, risk-assessment |
| **PLAN** | user-story-writing, codebase-search, e2e-patterns, technical-writing |
| **EXEC** | git-workflow, baseline-testing, integration-verification |
| **VERIFY** | e2e-ui-verification, refactoring-safety, production-readiness |
| **DONE** | leo-completion, retrospective-patterns |

### Feature-Type Chains (EXEC)
| Type | Skills |
|------|--------|
| **UI** | ehg-frontend-design, component-architecture, accessibility-guide |
| **Database** | schema-design, migration-safety, rls-patterns |
| **API** | rest-api-design, api-error-handling, input-validation |
| **Testing** | baseline-testing, e2e-patterns, playwright-auth |

### Top Sub-Agent Skills
| Sub-Agent | Primary Skills |
|-----------|----------------|
| DOCMON | technical-writing, api-documentation |
| DATABASE | schema-design, migration-safety, rls-patterns |
| GITHUB | git-workflow, refactoring-safety, cicd-patterns |
| TESTING | e2e-patterns, test-selectors, playwright-auth |

### Skill Location
- **Personal**: ~/.claude/skills/ (portable)
- **Project**: .claude/skills/ (project-specific)
- **Index**: ~/.claude/skills/SKILL-INDEX.md
- **Total**: 54 skills covering all 14 sub-agents

## Sustainable Issue Resolution Philosophy

**CHAIRMAN PREFERENCE**: When encountering issues, bugs, or blockers during implementation:

### Core Principles

1. **Handle Issues Immediately**
   - Do NOT defer problems to "fix later" or create tech debt
   - Address issues as they arise, before moving forward
   - Blocking issues must be resolved before continuing

2. **Resolve Systemically**
   - Fix the root cause, not just the symptom
   - Consider why the issue occurred and prevent recurrence
   - Update patterns, validation rules, or documentation as needed

3. **Prefer Sustainable Solutions**
   - Choose fixes that will last, not quick patches
   - Avoid workarounds that need to be revisited
   - Ensure the solution integrates properly with existing architecture

### Implementation Guidelines

| Scenario | Wrong Approach | Right Approach |
|----------|----------------|----------------|
| Test failing | Skip test, add TODO | Fix underlying issue, ensure test passes |
| Type error | Cast to `any` | Fix types properly, update interfaces |
| Migration issue | Comment out problematic code | Fix schema, add proper handling |
| Build warning | Suppress warning | Address root cause of warning |
| Performance issue | Defer to "optimization SD" | Fix if simple; create SD only if complex |

### Exception Handling

If immediate resolution is truly impossible:
1. Document the issue thoroughly
2. Create a high-priority SD for resolution
3. Add a failing test that captures the issue
4. Note the workaround as TEMPORARY with removal timeline

**Default behavior**: Resolve now, resolve properly, resolve sustainably.

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

## 🔄 Git Commit Guidelines

**Git Commit Guidelines**: `<type>(<SD-ID>): <subject>` format MANDATORY

**Required**: Type (feat/fix/docs/etc), SD-ID scope, imperative subject, AI attribution in footer
**Timing**: After checklist items, before context switches, at logical breakpoints
**Branch Strategy**: `eng/` prefix for EHG_Engineer, standard prefixes for EHG app features
**Size**: <100 lines ideal, <200 max

**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`

## 📊 Communication & Context

## Communication & Context

### Communication Style
**Brief by Default**: Concise, action-oriented responses.

| Context | Brief (preferred) |
|---------|-------------------|
| File created | "File created: path/to/file.md" |
| Test passed | "Tests passed (100% coverage)" |
| Next step | "Updating database schema..." |

### Context Economy Rules
- **Response Budget**: ≤500 tokens default
- **Summarize > Paste**: Reference paths/links instead of full content
- **Quote selectively**: Show only relevant lines with context

### Server Restart Protocol
After ANY code changes:
1. Kill dev server
2. Restart: `npm run dev`
3. Wait for ready message
4. Hard refresh browser (Ctrl+Shift+R)
5. Verify changes are live

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

## Parallel Execution

**When to Use**: Modern AI supports parallel tool execution for independent operations. Use conservatively.

**Safe for Parallel Execution**:
- ✅ Reading multiple independent files for analysis
- ✅ Running multiple independent database queries
- ✅ Executing multiple read-only Git commands (status, log, diff)
- ✅ Multiple WebFetch calls to different URLs
- ✅ Batch file searches (multiple Glob operations)

**NOT Safe for Parallel Execution**:
- ❌ Write operations (Edit, Write tools)
- ❌ Database mutations (INSERT, UPDATE, DELETE)
- ❌ Any operations where order matters
- ❌ Operations that depend on each other's results
- ❌ Git operations that modify state (commit, push, merge)

**Critical Constraint**: Context sharing between parallel operations is limited. Each operation receives the same initial context but cannot see other parallel operations' results until they all complete.

**Example Use Case**:
```
"Read the following 3 files for analysis:"
- Read src/component.tsx
- Read src/types.ts
- Read tests/component.test.tsx
```

**Anti-Pattern**:
```
"Read file A, then based on what you find, read file B"
(Must be sequential - second read depends on first)
```

## Weighted Keyword Scoring System

## Weighted Keyword Scoring for Sub-Agent Routing

### Scoring Formula
`score = sum(matched_keyword_weights)`

### Weight Categories
| Category | Weight | Description |
|----------|--------|-------------|
| **PRIMARY** | 4 pts | Unique to agent (e.g., "root cause" → RCA) |
| **SECONDARY** | 2 pts | Strong signal (e.g., "debug", "migration") |
| **TERTIARY** | 1 pt | Common terms (e.g., "issue", "problem") |

### Confidence Thresholds
| Threshold | Points | Action |
|-----------|--------|--------|
| HIGH | ≥5 | Auto-trigger agent |
| MEDIUM | ≥3 | Trigger if single match |
| LOW | ≥1 | Mention for awareness |

### Keyword Storage
**Source of Truth**: `lib/keyword-intent-scorer.js`

Keywords stored in code, not database:
```javascript
const AGENT_KEYWORDS = {
  RCA: {
    primary: ['root cause', '5 whys', ...],
    secondary: ['debug', 'investigate', ...],
    tertiary: ['not working', 'broken', ...]
  }
};
```

**To Update**: Edit `lib/keyword-intent-scorer.js`, then regenerate CLAUDE.md

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

## 🔧 CRITICAL DEVELOPMENT WORKFLOW

**Development Workflow**: SD-ARCH-EHG-007 Architecture

**EHG_Engineer (Port 3000)**: Backend API only - no client build needed
**EHG (Port 8080)**: Unified frontend (user + admin at /admin/*)

**API Changes**: Restart server → Test endpoints
**Commands**: `pkill -f "node server.js" && PORT=3000 node server.js`

**Frontend Changes**: Make changes in EHG repository (/mnt/c/_EHG/EHG/)
**Complete Guide**: See `docs/01_architecture/UNIFIED-FRONTEND-ARCHITECTURE.md`

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



## Hot Issue Patterns (Auto-Updated)

**CRITICAL**: These are active patterns detected from retrospectives. Review before starting work.

| Pattern ID | Category | Severity | Count | Trend | Top Solution |
|------------|----------|----------|-------|-------|--------------|
| PAT-003 | security | [HIGH] high | 3 | [DOWN] | Add auth.uid() check to RLS policy USING |
| PAT-008 | deployment | [HIGH] high | 2 | [STABLE] | Check GitHub Actions secrets and package |
| PAT-MD-001 | database | [CRIT] critical | 1 | [STABLE] | Key Insight: PostgreSQL direct connectio |
| PAT-EXEC-IMPL-001 | workflow | [HIGH] high | 1 | [STABLE] | Query database for existing tables/funct |
| PAT-PARENT-DET | workflow | [HIGH] high | 1 | [STABLE] | Add parent/child detection check in phas |

### Prevention Checklists

**security**:
- [ ] Verify RLS policies include auth.uid() checks
- [ ] Test with authenticated user context
- [ ] Check policy applies to correct operations

**deployment**:
- [ ] Verify all required secrets are set in GitHub
- [ ] Test locally with same Node version as CI
- [ ] Check package-lock.json is committed

**database**:
- [ ] Check SUPABASE_POOLER_URL availability in .env
- [ ] Verify migration file exists before execution
- [ ] Use SSL with rejectUnauthorized: false

**workflow**:
- [ ] Query DB for existing tables FIRST
- [ ] Check migration files in repo
- [ ] Check git log for SD commits


*Patterns auto-updated from `issue_patterns` table. Use `npm run pattern:resolve PAT-XXX` to mark resolved.*




## Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

### 1. Mock Infrastructure: Config, Registry, and Utilities - Retrospective [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 12/28/2025 | **Score**: 100

**Key Improvements**:
- Root Cause: jsdom test environment does not properly mock localStorage between test cases, causing 2...
- Root Cause: Handoff validation system requires multiple sub-agent validations that may not be applic...

**Action Items**:
- [ ] Document mock system usage in docs/mock-data-system.md (in SD-MOCK-POLISH)
- [ ] Complete missing handoff documentation

### 2. Mock Polish: UI Indicator, Developer Toggle, Documentation - Retrospective [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 12/28/2025 | **Score**: 100

**Key Improvements**:
- Initial PLAN-TO-EXEC handoff blocked due to missing exploration_summary
- Documentation commit was on wrong branch causing false positive in stub detection

**Action Items**:
- [ ] Owner: LEO Protocol Maintainer | Deadline: 2025-01-15 | Action: Auto-populate ex...
- [ ] Owner: CI/CD Team | Deadline: 2025-01-10 | Action: Modify stubbed code detection...

### 3. Settings Tab Clarity + Feature Catalog Copy (NAV-48 + NAV-49) - Retrospective [QUALITY]
**Category**: APPLICATION_ISSUE | **Date**: 12/26/2025 | **Score**: 100

**Key Improvements**:
- PLAN-TO-EXEC handoff timed out on OpenAI API calls
- Had to manually advance phase due to API timeouts

**Action Items**:
- [ ] Add timeout fallback for AI quality assessment in handoffs
- [ ] Complete missing handoff documentation

### 4. Sovereign Industrial Expansion - Stages 7-25 Materialization (Orchestrator) [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 12/27/2025 | **Score**: 100

**Key Improvements**:
- LEO Protocol artifacts should be created BEFORE implementation, not retroactively
- Handoff chain documentation should accompany development from the start

**Action Items**:
- [ ] Create orchestrator SD template with built-in child tracking
- [ ] Enforce LEO Protocol compliance for all SDs from LEAD phase

### 5. Implement Adaptive Design & Architecture Streams for PLAN Phase - Retrospective [QUALITY]
**Category**: PROCESS_IMPROVEMENT | **Date**: 1/10/2026 | **Score**: 100

**Key Improvements**:
- Schema field documentation: validation_details vs metadata.gate2_validation caused 2 failures
- Column naming inconsistency: category vs deliverable_type, title vs deliverable_name

**Action Items**:
- [ ] Create schema field reference document mapping validation field names to actual ...
- [ ] Add pre-handoff checklist to PLAN phase that validates exploration_summary, PRD ...


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

**Usage**: Invoke sub-agents using the Task tool with matching subagent_type.
**IMPORTANT**: When user query contains trigger keywords, PROACTIVELY invoke the corresponding sub-agent.

### Sub-Agents Without Keyword Triggers

- **Quick-Fix Orchestrator ("LEO Lite" Field Medic)** (`QUICKFIX`): Lightweight triage and resolution for small UAT-discovered issues (≤50 LOC). Act

### Keyword-Triggered Sub-Agents

#### Regression Validator Sub-Agent (`REGRESSION`)
Validates that refactoring changes maintain backward compatibility. Captures baseline test results, 

**Trigger Keywords**: `refactor`, `refactoring`, `backward compatibility`, `backwards compatible`, `breaking change`, `regression`, `restructure`, `no behavior change`, `no functional change`, `api signature`, `extract method`, `extract function`, `extract component`, `reorganize`, `regression test`, `public api`, `deprecate`, `consolidate`, `move file`, `rename`, `cleanup`, `split file`, `interface change`, `migration`, `code smell`, `technical debt`, `DRY violation`

#### Information Architecture Lead (`DOCMON`)
## Information Architecture Lead v3.0.0 - Database-First Enforcement Edition

**🆕 NEW in v3.0.0**: 

**Trigger Keywords**: `LEAD_SD_CREATION`, `LEAD_HANDOFF_CREATION`, `LEAD_APPROVAL`, `PLAN_PRD_GENERATION`, `PLAN_VERIFICATION`, `EXEC_IMPLEMENTATION`, `EXEC_COMPLETION`, `HANDOFF_CREATED`, `HANDOFF_ACCEPTED`, `PHASE_TRANSITION`, `RETRO_GENERATED`, `FILE_CREATED`, `VIOLATION_DETECTED`, `DAILY_DOCMON_CHECK`

#### Root Cause Analysis Agent (`RCA`)
Forensic intelligence agent for defect triage, root cause determination, and CAPA generation. Invest

**Trigger Keywords**: `sub_agent_blocked`, `ci_pipeline_failure`, `quality_gate_critical`, `test_regression`, `handoff_rejection`, `sub_agent_fail`, `quality_degradation`, `pattern_recurrence`, `performance_regression`, `diagnose defect`, `rca`, `root cause`

#### Chief Security Architect (`SECURITY`)
Former NSA security architect with 25 years experience securing systems from startup to enterprise s

**Trigger Keywords**: `authentication`, `security`, `security auth pattern`

#### DevOps Platform Architect (`GITHUB`)
# DevOps Platform Architect Sub-Agent

**Identity**: You are a DevOps Platform Architect with 20 yea

**Trigger Keywords**: `EXEC_IMPLEMENTATION_COMPLETE`, `create pull request`, `gh pr create`, `LEAD_APPROVAL_COMPLETE`, `create release`, `PLAN_VERIFICATION_PASS`, `github deploy`, `github status`, `deployment ci pattern`

#### UAT Test Executor (`UAT`)
Interactive UAT test execution guide for manual testing workflows.

**Mission**: Guide human testers

**Trigger Keywords**: `uat test`, `execute test`, `run uat`, `test execution`, `manual test`, `uat testing`, `start testing`, `TEST-AUTH`, `TEST-DASH`, `TEST-VENT`

#### Launch Orchestration Sub-Agent (`LAUNCH`)
Handles production launch orchestration, go-live checklists, launch readiness, and rollback procedur

**Trigger Keywords**: `launch`, `go-live`, `production launch`, `deployment`, `release`, `rollout`, `cutover`, `launch checklist`, `beta release`, `GA release`

#### QA Engineering Director (`TESTING`)
## Enhanced QA Engineering Director v2.4.0 - Retrospective-Informed Edition

**🆕 NEW in v2.4.0**: 7

**Trigger Keywords**: `coverage`, `protected route`, `build error`, `dev server`, `test infrastructure`, `testing evidence`, `redirect to login`, `playwright build`, `EXEC_IMPLEMENTATION_COMPLETE`, `unit tests`, `vitest`, `npm run test:unit`, `test results`, `testing test pattern`

#### Continuous Improvement Coach (`RETRO`)
## Continuous Improvement Coach v4.0.0 - Quality-First Edition

**🆕 NEW in v4.0.0**: Proactive lear

**Trigger Keywords**: `LEAD_APPROVAL_COMPLETE`, `LEAD_REJECTION`, `PLAN_VERIFICATION_COMPLETE`, `PLAN_COMPLEXITY_HIGH`, `EXEC_SPRINT_COMPLETE`, `EXEC_QUALITY_ISSUE`, `HANDOFF_REJECTED`, `HANDOFF_DELAY`, `PHASE_COMPLETE`, `SD_STATUS_COMPLETED`, `SD_STATUS_BLOCKED`, `PATTERN_DETECTED`, `SUBAGENT_MULTIPLE_FAILURES`, `WEEKLY_LEO_REVIEW`, `LEAD_PRE_APPROVAL_REVIEW`, `capture this lesson`, `capture this insight`, `remember this`, `learning`, `lesson learned`, `insight`, `plan mode`, `plan mode integration`, `permission bundling`, `plan file generation`, `intelligent plan`, `sd type profile`, `workflow intensity`, `phase transition`

#### Principal Database Architect (`DATABASE`)
## Principal Database Architect v2.0.0 - Lessons Learned Edition

**🆕 NEW in v2.0.0**: Proactive le

**Trigger Keywords**: `schema`, `migration`, `EXEC_IMPLEMENTATION_COMPLETE`, `database`, `query`, `select from`, `insert into`, `supabase`, `table`, `rls`, `postgres`, `sql`, `fetch from database`, `database query`, `run this sql`, `execute this sql`, `run the query`, `execute the query`, `run this migration`, `execute the migration`, `run that migration`, `execute the following`, `run the following`, `please run`, `please execute`, `can you run`, `can you execute`, `apply this migration`, `apply the migration`, `insert this into`, `update the database`, `update the table`, `delete from the table`, `create the table`, `alter the table`, `drop the table`, `add this column`, `make this change in the database`, `update this in supabase`, `fix this in the database`, `modify the schema`, `add this to the database`, `use the database sub-agent`, `use database sub-agent`, `database agent should run`, `have the database agent`, `run it`, `execute it`, `go ahead and run`, `yes, run it`, `yes, execute`

#### Performance Engineering Lead (`PERFORMANCE`)
Performance engineering lead with 20+ years optimizing high-scale systems.

**Mission**: Identify pe

**Trigger Keywords**: `optimization`

#### Monitoring Sub-Agent (`MONITORING`)
Handles monitoring setup, alerting, SLA definition, health checks, and incident response.

**Trigger Keywords**: `uptime`, `incident`, `observability`, `logging`, `tracing`, `Datadog`, `Prometheus`, `monitoring`, `alerting`, `health check`, `SLA`

#### Financial Modeling Sub-Agent (`FINANCIAL`)
Handles financial projections, P&L modeling, cash flow analysis, business model canvas financial sec

**Trigger Keywords**: `financial`, `P&L`, `profit and loss`, `cash flow`, `burn rate`, `runway`, `revenue projection`, `margin`, `gross margin`, `EBITDA`, `break even`, `financial model`

#### Risk Assessment Sub-Agent (`RISK`)
## Risk Assessment Sub-Agent v1.0.0

**BMAD Enhancement**: Multi-domain risk assessment for Strategi

**Trigger Keywords**: `high risk`, `complex`, `refactor`, `migration`, `architecture`, `sophisticated`, `advanced`, `overhaul`, `redesign`, `restructure`, `authentication`, `authorization`, `security`, `rls`, `permission`, `access control`, `credential`, `encrypt`, `decrypt`, `sensitive`, `performance`, `optimization`, `slow`, `latency`, `cache`, `real-time`, `websocket`, `large dataset`, `bulk`, `scalability`, `third-party`, `external`, `api`, `integration`, `webhook`, `microservice`, `openai`, `stripe`, `twilio`, `aws`, `database`, `migration`, `schema`, `table`, `alter`, `postgres`, `sql`, `create table`, `foreign key`, `constraint`, `ui`, `ux`, `design`, `component`, `interface`, `dashboard`, `responsive`, `accessibility`, `a11y`, `mobile`, `LEAD_PRE_APPROVAL`, `PLAN_PRD`

#### Principal Systems Analyst (`VALIDATION`)
## Principal Systems Analyst v3.0.0 - Retrospective-Informed Edition

**🆕 NEW in v3.0.0**: 6 critic

**Trigger Keywords**: `existing implementation`, `duplicate`, `conflict`, `already implemented`, `codebase check`

#### API Architecture Sub-Agent (`API`)
## API Sub-Agent v1.0.0

**Mission**: REST/GraphQL endpoint design, API architecture, versioning, an

**Trigger Keywords**: `API`, `REST`, `RESTful`, `GraphQL`, `endpoint`, `route`, `controller`, `middleware`, `request`, `response`, `payload`, `status code`, `HTTP method`, `OpenAPI`, `Swagger`, `versioning`, `pagination`

#### Pricing Strategy Sub-Agent (`PRICING`)
Handles pricing model development, unit economics, pricing tiers, sensitivity analysis, and competit

**Trigger Keywords**: `pricing`, `price point`, `pricing strategy`, `unit economics`, `subscription`, `freemium`, `tiered pricing`, `CAC`, `LTV`, `revenue model`

#### Analytics Sub-Agent (`ANALYTICS`)
Handles analytics setup, metrics definition, dashboard creation, and data-driven insights.

**Trigger Keywords**: `analytics`, `metrics`, `dashboard`, `AARRR`, `funnel`, `conversion rate`, `user behavior`, `tracking`, `KPI`, `retention rate`, `churn rate`

#### Sales Process Sub-Agent (`SALES`)
Handles sales playbook development, pipeline management, objection handling, and sales enablement.

**Trigger Keywords**: `sales`, `sales playbook`, `sales process`, `pipeline`, `deal flow`, `quota`, `sales cycle`, `objection handling`, `sales enablement`, `closing`

#### Exit Valuation Sub-Agent (`VALUATION`)
Handles exit valuation modeling, comparable analysis, acquisition scenario planning, and investor re

**Trigger Keywords**: `valuation`, `exit`, `exit strategy`, `acquisition`, `IPO`, `Series A`, `fundraising`, `multiple`, `DCF`, `comparable`, `investor`

#### Dependency Management Sub-Agent (`DEPENDENCY`)
# Dependency Management Specialist Sub-Agent

**Identity**: You are a Dependency Management Speciali

**Trigger Keywords**: `dependency`, `dependencies`, `npm`, `yarn`, `pnpm`, `package`, `package.json`, `vulnerability`, `CVE`, `security advisory`, `outdated`, `install`, `update`, `upgrade`, `version`, `semver`, `node_modules`, `patch`, `CVSS`, `exploit`, `Snyk`, `Dependabot`

#### Senior Design Sub-Agent (`DESIGN`)
## Senior Design Sub-Agent v6.0.0 - Lessons Learned Edition

**🆕 NEW in v6.0.0**: Proactive learnin

**Trigger Keywords**: `component`, `visual`, `design system`, `styling`, `CSS`, `Tailwind`, `interface`, `UI`, `button`, `form`, `modal`, `theme`, `dark mode`, `light mode`, `responsive`, `mobile`, `user flow`, `navigation`, `journey`, `interaction`, `wireframe`, `prototype`, `UX`, `user experience`, `accessibility`, `WCAG`, `ARIA`, `screen reader`, `backend feature`, `API endpoint`, `database model`, `database table`, `new route`, `new endpoint`, `controller`, `service layer`, `business logic`, `new feature`, `feature implementation`, `user-facing`, `frontend`, `page`, `view`, `dashboard`

#### Marketing & GTM Sub-Agent (`MARKETING`)
Handles go-to-market strategy, marketing campaigns, channel selection, messaging, and brand position

**Trigger Keywords**: `marketing`, `go-to-market`, `GTM`, `campaign`, `positioning`, `messaging`, `channel strategy`, `content marketing`, `SEO`, `brand awareness`, `lead generation`

#### CRM Sub-Agent (`CRM`)
Handles customer relationship management, lead tracking, customer success metrics, and retention str

**Trigger Keywords**: `CRM`, `customer relationship`, `contact management`, `lead tracking`, `customer success`, `Salesforce`, `HubSpot`, `customer data`

#### User Story Context Engineering Sub-Agent (`STORIES`)
## User Story Context Engineering v2.0.0 - Lessons Learned Edition

**🆕 NEW in v2.0.0**: 5 critical

**Trigger Keywords**: `user story`, `user stories`, `acceptance criteria`, `implementation`, `context`, `guidance`, `PLAN_PRD`


**Note**: Sub-agent results MUST be persisted to `sub_agent_execution_results` table.


---

*Generated from database: 2026-01-25*
*Protocol Version: 4.3.3*
*Includes: Proposals (0) + Hot Patterns (5) + Lessons (5)*
*Load this file first in all sessions*
