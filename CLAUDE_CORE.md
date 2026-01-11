# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2026-01-11 10:20:09 PM
**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

## 🏗️ Application Architecture - UNIFIED FRONTEND

### Unified Application Architecture (CONSOLIDATED)

#### System Overview
The EHG ecosystem consists of two primary components sharing a consolidated database:

1. **EHG** (Unified Frontend) - PORT 8080
   - **Path**: `/mnt/c/_EHG/EHG/`
   - **Purpose**: Complete application frontend (user features + admin dashboard)
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED
   - **GitHub**: https://github.com/rickfelix/ehg.git
   - **Built with**: Vite + React + Shadcn + TypeScript
   - **Routes**:
     - `/` - User-facing venture creation and management
     - `/admin` - Admin dashboard (LEO Protocol management)
     - `/admin/directives` - Strategic Directives (SDManager)
     - `/admin/prds` - PRD Management
     - `/admin/ventures` - Ventures Admin View
   - **Role**: ALL UI FEATURES - both user and admin

2. **EHG_Engineer** (Backend API) - PORT 3000
   - **Path**: `/mnt/c/_EHG/EHG_Engineer/`
   - **Purpose**: Backend API server + LEO Protocol scripts
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED
   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
   - **Provides**:
     - REST API endpoints (`/api/sd`, `/api/prd`, etc.)
     - LEO Protocol scripts (`handoff.js`, `add-prd-to-database.js`)
     - WebSocket connections for real-time updates
   - **Role**: BACKEND SERVICES ONLY - no standalone frontend

3. **Agent Platform** (AI Backend) - PORT 8000
   - **Path**: `/mnt/c/_EHG/EHG/agent-platform/`
   - **Purpose**: AI research backend for venture creation
   - **Built with**: FastAPI + Python

> **NOTE (SD-ARCH-EHG-007)**: Admin components (SDManager, PRDManager, VenturesManager, Stage Components) have been migrated from EHG_Engineer to EHG as part of the unified frontend initiative.

### ⚠️ CRITICAL: During EXEC Phase Implementation
1. **Read PRD** from EHG_Engineer database (or via API)
2. **Navigate** to `/mnt/c/_EHG/EHG/` for ALL frontend work
3. **For admin features**: Implement in `/src/components/admin/` or `/src/pages/admin/`
4. **For user features**: Implement in `/src/components/` or `/src/pages/`
5. **Push changes** to EHG's GitHub repo: `rickfelix/ehg.git`
6. **For backend API changes**: Navigate to `/mnt/c/_EHG/EHG_Engineer/`

### 🔄 Workflow Relationship
```
EHG_Engineer (Backend)              EHG (Unified Frontend)
├── REST API /api/*          →     Consumed by both user & admin UI
├── LEO Protocol Scripts     →     Manage SDs, PRDs, handoffs
├── WebSocket Server         →     Real-time updates to UI
└── No UI (API only)               ALL UI here (user + /admin routes)
```

### Stack Startup
```bash
bash scripts/leo-stack.sh restart   # Starts all 3 servers
# Port 3000: EHG_Engineer backend API
# Port 8080: EHG unified frontend
# Port 8000: Agent Platform AI backend
```

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

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### Pre-flight Batch Validation (RECOMMENDED)
```bash
# SD-LEO-STREAMS-001: Find ALL issues at once (reduces handoff iterations 60-70%)
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

#### LEAD → PLAN Transition
```bash
# Step 1: MANDATORY - Run preflight (loads context from database)
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (validates and blocks if not ready)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

#### PLAN → EXEC Transition
```bash
# Step 1: MANDATORY - Run preflight
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (enforces BMAD, branch, and gate validation)
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
```

#### EXEC → PLAN Transition (Verification)
```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001
```

#### PLAN → LEAD Transition (Final Approval)
```bash
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| `phase-preflight.js` | Loads context, patterns, and lessons from database |
| `handoff.js precheck` | **Batch validation** - runs ALL gates, git checks, reports ALL issues at once |
| `handoff.js LEAD-TO-PLAN` | SD completeness (100% required), strategic objectives |
| `handoff.js PLAN-TO-EXEC` | BMAD validation, DESIGN→DB workflow, Git branch enforcement |
| `handoff.js EXEC-TO-PLAN` | Implementation fidelity, test coverage, deliverables |
| `handoff.js PLAN-TO-LEAD` | Traceability, workflow ROI, retrospective quality |

### Compliance Marker
Valid handoffs are recorded with `created_by: 'UNIFIED-HANDOFF-SYSTEM'`. Handoffs with other `created_by` values indicate process bypass.

### Check Compliance
```bash
npm run handoff:compliance        # Check all recent handoffs
npm run handoff:compliance SD-ID  # Check specific SD
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


## Execution Philosophy

## 🧠 EXECUTION PHILOSOPHY (Read First!)

These principles override default behavior and must be internalized before starting work:

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness and completeness are MORE IMPORTANT than speed.
- Take the time needed to understand requirements fully
- Verify BEFORE implementing, test BEFORE claiming completion
- 2-4 hours of careful implementation beats 6-12 hours of rework
- If rushing leads to mistakes, you haven't saved time - you've wasted it
- "Done right" > "Done fast" - ALWAYS

### Testing-First (MANDATORY)
**Build confidence through comprehensive testing.**
- E2E testing is MANDATORY, not optional
- 30-60 minute investment saves 4-6 hours of rework
- 100% user story coverage required
- Both unit tests AND E2E tests must pass
- Tests are not overhead - they ARE the work

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth.
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Handoffs → `sd_phase_handoffs`
- Retrospectives → `retrospectives`
- Sub-agent results → `sub_agent_execution_results`

### Validation-First (GATEKEEPING)
**Thorough validation BEFORE approval, full commitment AFTER.**
- LEAD validates: Real problem? Feasible solution? Resources available?
- After LEAD approval: SCOPE LOCK - deliver what was approved
- Exception: Critical blocker + human approval + new SD for deferred work

### Context-Aware (PROACTIVE)
**Monitor token usage proactively throughout execution.**
- Report context health in EVERY handoff
- HEALTHY (<70%), WARNING (70-90%), CRITICAL (90-95%), EMERGENCY (>95%)
- Use `/context-compact` when approaching WARNING threshold

### Application-Aware (VERIFICATION)
**Verify directory BEFORE writing ANY code.**
- `cd /mnt/c/_EHG/ehg && pwd` for customer features
- `git remote -v` to confirm correct repository
- Wrong directory = STOP immediately

### Evidence-Based (PROOF REQUIRED)
**Screenshot, test, verify. Claims without evidence are rejected.**
- Screenshot BEFORE and AFTER changes
- Test results with pass/fail counts
- CI/CD pipeline status (green checks required)
- Sub-agent verification results in database

**REMEMBER**: The goal is NOT to complete SDs quickly. The goal is to complete SDs CORRECTLY. A properly implemented SD that takes 8 hours is infinitely better than a rushed implementation that takes 4 hours but requires 6 hours of fixes.


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

**Skills complement the LEO Protocol by providing pattern guidance BEFORE implementation.**

### Skill-Agent Relationship
| Phase | Component | Role |
|-------|-----------|------|
| Creative | Skills (~/.claude/skills/) | How to build (patterns, best practices) |
| Validation | Sub-Agents (.claude/agents/) | Did you build it right (verification) |

### 🔗 LEO Protocol Skill Chains (NEW)

**Master Skill**: `leo-skill-chains` - Orchestrates skill invocation order per phase

#### Phase Chains
| Phase | Chain | Purpose |
|-------|-------|---------|
| **LEAD** | session-verification → duplicate-detection → scope-validation → sd-classification → risk-assessment | Validate and approve SD |
| **PLAN** | session-verification → user-story-writing → codebase-search → [feature chains] → e2e-patterns → technical-writing | Create PRD |
| **EXEC** | git-workflow → baseline-testing → [implementation chains] → e2e-patterns → integration-verification → git-workflow | Implement and test |
| **VERIFY** | e2e-ui-verification → integration-verification → refactoring-safety → production-readiness | Verify before handoff |
| **DONE** | leo-completion → retrospective-patterns → context-management | Complete SD |

#### Feature-Type Chains (EXEC Phase)
| Feature Type | Chain |
|--------------|-------|
| **UI Feature** | ehg-frontend-design → component-architecture → state-management → error-handling → accessibility-guide |
| **Database** | schema-design → migration-safety → rls-patterns → supabase-patterns → database-maintenance |
| **API** | rest-api-design → api-error-handling → input-validation |
| **Testing** | baseline-testing → e2e-ui-verification → e2e-patterns → test-selectors → playwright-auth |

### Available Skill Categories
| Category | Skills | Invoke When |
|----------|--------|-------------|
| Design | ehg-frontend-design, component-architecture, accessibility-guide, design-system, ux-workflows, ui-testing | Creating UI components |
| Database | schema-design, rls-patterns, migration-safety, supabase-patterns, database-maintenance | Database changes |
| Security | auth-patterns, input-validation, secret-management, access-control | Security features |
| Testing | e2e-patterns, test-selectors, test-fixtures, test-debugging, playwright-auth, baseline-testing, e2e-ui-verification | Writing tests |
| API | rest-api-design, api-documentation, api-error-handling | API design and implementation |
| Performance | query-optimization, react-performance, memory-management, bundle-optimization, production-readiness | Performance optimization |
| CI/CD | cicd-patterns, refactoring-safety, build-paths, git-workflow | GitHub Actions, git, deployments |
| Dependencies | dependency-security, npm-patterns | Package management, CVE handling |
| Documentation | technical-writing | Documentation standards |
| Validation | duplicate-detection, codebase-search, scope-validation, ui-integration-check, integration-verification, session-verification, sub-agent-triggers, sd-classification | Codebase validation |
| LEO Protocol | leo-skill-chains, leo-completion, retrospective-patterns, risk-assessment, user-story-writing, uat-execution | LEO workflow support |
| Frontend State | state-management, error-handling | React state, error handling |
| Context | context-management | Token usage, session management |

### Enhanced Skill Features
Skills now include:
- **related-skills**: Cross-references to related skills for discovery
- **chain-position**: Where in LEO Protocol workflow the skill applies
- **derived-from**: Issue patterns that inspired the skill (with occurrence counts)
- **priority**: critical/high/medium based on usage frequency

### Top 5 Most-Used Sub-Agent Skills (by execution count)
| Rank | Sub-Agent | Executions | Primary Skills |
|------|-----------|------------|----------------|
| 1 | DOCMON | 200 | technical-writing, api-documentation |
| 2 | STORIES | 199 | user-story-writing, scope-validation |
| 3 | DATABASE | 184 | schema-design, migration-safety, rls-patterns, database-maintenance |
| 4 | GITHUB | 176 | git-workflow, refactoring-safety, cicd-patterns, build-paths |
| 5 | TESTING | 149 | e2e-patterns, test-selectors, playwright-auth, baseline-testing |

### Skill-Agent Mapping
| Sub-Agent | Associated Skills | Issue Patterns Addressed |
|-----------|-------------------|-------------------------|
| DESIGN | ehg-frontend-design, component-architecture, accessibility-guide, design-system, ux-workflows, ui-testing | UI/UX patterns |
| DATABASE | schema-design, rls-patterns, migration-safety, supabase-patterns, database-maintenance | PAT-001, PAT-003, PAT-DB-VACUUM-001 |
| SECURITY | auth-patterns, input-validation, secret-management, access-control | Security patterns |
| TESTING | e2e-patterns, test-selectors, test-fixtures, test-debugging, playwright-auth, baseline-testing, e2e-ui-verification, sd-classification | PAT-AUTH-PW-001, PAT-RECURSION-001, PAT-E2E-UI-001 |
| VALIDATION | duplicate-detection, codebase-search, scope-validation, ui-integration-check, integration-verification, session-verification, sub-agent-triggers, leo-completion | PAT-SESS-VER-001, PAT-INTEG-GAP-001, PAT-007 |
| PERFORMANCE | query-optimization, react-performance, memory-management, bundle-optimization, production-readiness | Performance patterns |
| API | rest-api-design, api-documentation, api-error-handling | API patterns |
| GITHUB | refactoring-safety, cicd-patterns, build-paths, git-workflow | PAT-002, PAT-008, PAT-005, PAT-006 |
| DEPENDENCY | dependency-security, npm-patterns | CVE handling |
| DOCMON | technical-writing | Documentation compliance |
| RISK | risk-assessment | Risk evaluation |
| UAT | uat-execution | UAT validation |
| STORIES | user-story-writing | User story structure |
| RETRO | retrospective-patterns | Quality retrospectives |

### Skill Location
- **Personal skills**: ~/.claude/skills/ (portable across projects)
- **Project skills**: .claude/skills/ (project-specific)
- **Skill Index**: ~/.claude/skills/SKILL-INDEX.md (quick reference with phase chains)
- **Master Chain Skill**: ~/.claude/skills/leo-skill-chains/SKILL.md

**Total Skills**: 54 skills covering all 14 sub-agents + 1 master chain skill

**Reference**: Skills were created from issue_patterns and retrospectives to encode proven solutions.

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

## Global Negative Constraints

## 🚫 Global Negative Constraints

<negative_constraints phase="GLOBAL">
These anti-patterns apply across ALL phases. Violating them leads to failed handoffs, rework, and wasted effort.

### NC-001: No Markdown Files as Source of Truth
**Anti-Pattern**: Creating or updating markdown files (*.md) to store requirements, PRDs, or status
**Why Wrong**: Data becomes stale, conflicts with database, no validation
**Correct Approach**: Use database tables (strategic_directives_v2, product_requirements_v2) via scripts

### NC-002: No Bypassing Process Scripts
**Anti-Pattern**: Directly inserting into database tables instead of using handoff.js, add-prd-to-database.js
**Why Wrong**: Skips validation gates, breaks audit trail, causes inconsistent state
**Correct Approach**: Always use the designated scripts for phase transitions

### NC-003: No Guessing File Locations
**Anti-Pattern**: Assuming file paths based on naming conventions without verification
**Why Wrong**: Leads to wrong file edits, missing imports, broken builds
**Correct Approach**: Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
**Anti-Pattern**: Starting to code before reading existing implementation
**Why Wrong**: Duplicates existing functionality, conflicts with patterns, wastes time
**Correct Approach**: Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
**Anti-Pattern**: Implementing quick fixes without understanding why something fails
**Why Wrong**: 2-3x time multiplier, masks real issues, accumulates technical debt
**Correct Approach**: Identify root cause first, then fix. Document if workaround needed.


### NC-006: No Background Execution or TaskOutput
**Anti-Pattern**: Using `run_in_background: true` or TaskOutput tool for validation/handoff commands
**Why Wrong**: Slows down workflow, requires extra round-trips, breaks conversational flow
**Correct Approach**:
- Run all commands inline with appropriate timeouts (up to 180000ms for long validations)
- NEVER use `run_in_background` parameter for handoff.js, validation scripts, or any LEO process scripts
- If command output is long, use direct execution and let it complete
- Avoid piping (`| grep`, `| tail`) on long-running commands as it can trigger background execution
**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`
- Any validation or quality gate scripts
</negative_constraints>

## 🔄 Git Commit Guidelines

**Git Commit Guidelines**: `<type>(<SD-ID>): <subject>` format MANDATORY

**Required**: Type (feat/fix/docs/etc), SD-ID scope, imperative subject, AI attribution in footer
**Timing**: After checklist items, before context switches, at logical breakpoints
**Branch Strategy**: `eng/` prefix for EHG_Engineer, standard prefixes for EHG app features
**Size**: <100 lines ideal, <200 max

**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`

## 📊 Communication & Context

### Communication Style

**Brief by Default**: Responses should be concise and action-oriented unless the user explicitly requests detailed explanations.

**When to be Brief** (default):
- Status updates and progress reports
- Acknowledging commands or requests
- Confirming successful operations
- Error messages (summary + fix)
- Tool invocation descriptions

**When to be Verbose** (only if requested):
- User asks "explain in detail"
- User requests "comprehensive" or "thorough" analysis
- Teaching or knowledge transfer scenarios
- Complex debugging requiring full context
- Documentation generation

**Examples**:

| Context | ❌ Verbose (unnecessary) | ✅ Brief (preferred) |
|---------|------------------------|---------------------|
| File created | "I have successfully created the file at the specified path with all the requested content..." | "File created: path/to/file.md" |
| Test passed | "The test suite has been executed and all tests have passed successfully with 100% coverage..." | "✅ Tests passed (100% coverage)" |
| Next step | "Now I will proceed to the next step which involves updating the database schema..." | "Updating database schema..." |

### Context Economy Rules

**Core Principles**:
- **Response Budget**: ≤500 tokens default (unless complexity requires more)
- **Summarize > Paste**: Reference paths/links instead of full content
- **Fetch-on-Demand**: Name files first, retrieve only needed parts
- **Running Summaries**: Keep condensed handoff/PR descriptions

### Best Practices

**Efficient Context Usage**:
- **Quote selectively**: Show only relevant lines with context
- **Use file:line references**: `src/component.js:42-58` instead of full file
- **Batch related reads**: Minimize round-trips when exploring
- **Archive verbosity**: Move details to handoffs/database, not conversation

### Examples

| ❌ Inefficient | ✅ Efficient |
|----------------|--------------|
| Paste entire 500-line file | Quote lines 42-58 with `...` markers |
| Read file multiple times | Batch read relevant sections once |
| Repeat full error in response | Summarize error + reference line |
| Include all test output | Show failed tests + counts only |

### 🔄 MANDATORY: Server Restart Protocol
After ANY code changes:
1. **Kill the dev server**: `kill [PID]` or Ctrl+C
2. **Restart the server**: `npm run dev` or appropriate command
3. **Wait for ready message**: Confirm server is fully started
4. **Hard refresh browser**: Ctrl+Shift+R / Cmd+Shift+R
5. **Verify changes are live**: Test the new functionality

**WHY**: Dev servers may cache components, especially new files. Hot reload is NOT always reliable.

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

## 🔍 Issue Pattern Search (Knowledge Base)

Before implementing fixes or designing features, search the pattern database for known issues and proven solutions.

### When to Search Patterns

**PLAN Phase:**
- Before schema changes: Search `category: 'database'`
- Before auth/security work: Search `category: 'security'`
- Before designing new features: Search for related architecture patterns

**EXEC Phase:**
- Before implementing: Search for known issues in affected areas
- Before testing: Search `category: 'testing'` for common pitfalls
- When hitting errors: Search error message keywords

**Retrospective:** Automatic extraction - no manual search needed

---

### CLI Commands (Quick Lookups)

```bash
# View active patterns
npm run pattern:alert:dry          # Shows patterns near thresholds

# Check maintenance status
npm run pattern:maintenance:dry    # Preview all maintenance tasks

# Resolve a pattern
npm run pattern:resolve PAT-XXX "Fixed by implementing XYZ"

# Full documentation
cat docs/reference/pattern-lifecycle.md
```

---

### Programmatic API (For Integration)

```javascript
import { IssueKnowledgeBase } from './lib/learning/issue-knowledge-base.js';
const kb = new IssueKnowledgeBase();

// Search by category (most common)
const dbPatterns = await kb.search('', { category: 'database' });

// Search by keyword + category
const rlsPatterns = await kb.search('RLS policy', { category: 'security' });

// Get specific pattern with solutions
const pattern = await kb.getPattern('PAT-003');
const solution = await kb.getSolution('PAT-003');
// Returns: { recommended: {...}, alternatives: [...], prevention_checklist: [...] }
```

---

### Category → Sub-Agent Mapping

| Category | Sub-Agents | Trigger On |
|----------|------------|------------|
| database | DATABASE, SECURITY | Schema, RLS, migrations |
| testing | TESTING, UAT | Test failures, coverage |
| security | SECURITY, DATABASE | Auth, tokens, permissions |
| deployment | GITHUB, DEPENDENCY | CI/CD, pipeline issues |
| build | GITHUB, DEPENDENCY | Vite, compilation |
| protocol | RETRO, DOCMON, VALIDATION | LEO handoffs, phases |
| performance | PERFORMANCE, DATABASE | Latency, slow queries |

---

### Acting on Search Results

**When pattern found:**
1. Check `proven_solutions` - apply highest `success_rate` solution first
2. Review `prevention_checklist` - add items to your implementation checklist
3. Pattern `occurrence_count` auto-updates via retrospective if issue recurs

**When no pattern found:**
1. Proceed with implementation
2. Document learnings in retrospective
3. Pattern will be auto-extracted for future reference

---

### Thresholds for Auto-SD Creation

Patterns exceeding these thresholds auto-create CRITICAL SDs:
- **Critical severity**: 5+ occurrences
- **High severity**: 7+ occurrences
- **Increasing trend**: 4+ occurrences

**Weekly Maintenance:** `npm run pattern:maintenance` (also runs via GitHub Action)

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

The LEO Protocol supports hierarchical SDs for multi-phase work. Parent SDs coordinate children; **every child goes through full LEAD→PLAN→EXEC**.

### Relationship Types

| Type | Description | Workflow | Use Case |
|------|-------------|----------|----------|
| `standalone` | Default | LEAD→PLAN→EXEC | Normal SDs |
| `parent` | Orchestrator | LEAD→PLAN→waits→Complete | Multi-phase coordinator |
| `child` | Has parent | LEAD→PLAN→EXEC→Complete | Sequential execution units |

### Key Rules

1. **Every child gets full LEAD→PLAN→EXEC** - complete workflow, no shortcuts
2. **Parent PLAN creates children** - PLAN agent proposes decomposition during parent PRD
3. **Parent SDs bypass user story gates** - user stories exist in child SDs, not parent (USER_STORY_EXISTENCE_GATE bypassed for orchestrators)
4. **Each child needs LEAD approval** - validates strategic value, scope, risks per child
5. **Children execute sequentially** - Child B waits for Child A to complete
6. **Parent progress = weighted child progress** - auto-calculated
7. **Parent completes last** - after all children finish

### Orchestrator Gate Handling

Parent orchestrator SDs have special validation logic:
- **USER_STORY_EXISTENCE_GATE**: Bypassed (user stories are in child SDs)
- **Gate thresholds**: Use `orchestrator` threshold (70%) instead of feature (85%)
- **Validation focus**: Child SD progress and completion status

### Workflow Diagram

```
PARENT SD:
  LEAD (approve multi-phase initiative)
    ↓
  PLAN (discover 15 user stories → propose 3 children)
    ↓
  Parent enters "orchestrator/waiting" state

CHILDREN (sequential):
  Child A: LEAD → PLAN → EXEC → Complete
           ↓
  Child B: LEAD → PLAN → EXEC → Complete
           ↓
  Child C: LEAD → PLAN → EXEC → Complete

PARENT SD:
  After last child → Auto-complete (progress = 100%)
```

### Why Children Need LEAD

Each child SD needs LEAD approval because:
- **Strategic validation**: Is THIS child the right thing to build?
- **Scope lock**: What exactly does THIS child deliver?
- **Risk assessment**: What are the risks for THIS specific child?
- **Resource check**: Do we have what we need for THIS child?

LEAD is not redundant - it's essential validation per child.

### Progress Calculation

Parent progress = weighted average of child progress:

| Child Priority | Weight |
|----------------|--------|
| critical | 40% |
| high | 30% |
| medium | 20% |
| low | 10% |

**Formula**: `Σ(child.progress × weight) / Σ(weight)`

### Database Functions

```sql
-- View family hierarchy
SELECT * FROM sd_family_tree WHERE parent_id = 'SD-PARENT-001';

-- Calculate parent progress
SELECT calculate_parent_sd_progress('SD-PARENT-001');

-- Get next child to execute
SELECT get_next_child_sd('SD-PARENT-001');

-- Detect orchestrator (for gate bypass)
SELECT COUNT(*) > 0 as is_orchestrator 
FROM strategic_directives_v2 
WHERE parent_sd_id = 'SD-XXX';
```

## SD Type-Aware Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs AND different gate pass thresholds.

### Workflow Command
```bash
# Check recommended workflow for any SD
node scripts/handoff.js workflow SD-XXX-001
```

### Gate Pass Thresholds by SD Type

| SD Type | Gate Threshold | Rationale |
|---------|----------------|-----------|
| **feature** | 85% | Full validation (UI, E2E, integration) |
| **database** | 75% | Schema-focused, may skip UI-dependent E2E |
| **infrastructure** | 80% | Tooling/protocols, reduced code validation |
| **security** | 90% | Higher bar for security-critical work |
| **documentation** | 60% | No code changes, minimal validation |
| **orchestrator** | 70% | Coordination layer, user stories in children |
| **refactor** | 80% | Behavior preservation focus |
| **bugfix** | 80% | Targeted fix validation |
| **performance** | 85% | Measurable impact verification |

### Workflow by SD Type

| SD Type | Required Handoffs | Optional | Skipped Validation |
|---------|-------------------|----------|-------------------|
| **feature** | LEAD→PLAN→EXEC→PLAN (verify)→LEAD (final) | None | None |
| **infrastructure** | LEAD→PLAN→EXEC→LEAD (final) | EXEC-TO-PLAN | TESTING, GITHUB, E2E, Gates 3&4 |
| **documentation** | LEAD→PLAN→EXEC→LEAD (final) | EXEC-TO-PLAN | All code validation |
| **database** | Full workflow | None | Some E2E (UI-dependent) |
| **security** | Full workflow | None | None |
| **orchestrator** | LEAD→PLAN→(children)→LEAD (final) | N/A | USER_STORY_EXISTENCE_GATE |

### Key Rules

1. **Feature SDs**: Full 5-handoff workflow with all validation gates at 85%
2. **Infrastructure SDs**: Can skip EXEC-TO-PLAN (no code to validate), threshold 80%
3. **Documentation SDs**: Can skip EXEC-TO-PLAN, threshold only 60%
4. **Database/Security SDs**: Full workflow but may skip UI-dependent E2E tests
5. **Orchestrator SDs**: User stories expected in children, not parent (70% threshold)

### Pre-Handoff Check
Before executing any handoff:
1. Run `node scripts/handoff.js workflow SD-ID` to see the recommended path
2. The execute command will warn you if a handoff is optional
3. Infrastructure/docs SDs can proceed directly from EXEC to PLAN-TO-LEAD
4. Gate thresholds are automatically applied based on SD type

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

## 🔧 CRITICAL DEVELOPMENT WORKFLOW

**Development Workflow**: SD-ARCH-EHG-007 Architecture

**EHG_Engineer (Port 3000)**: Backend API only - no client build needed
**EHG (Port 8080)**: Unified frontend (user + admin at /admin/*)

**API Changes**: Restart server → Test endpoints
**Commands**: `pkill -f "node server.js" && PORT=3000 node server.js`

**Frontend Changes**: Make changes in EHG repository (/mnt/c/_EHG/EHG/)
**Complete Guide**: See `docs/01_architecture/UNIFIED-FRONTEND-ARCHITECTURE.md`

## Background Task Output Retrieval

## Background Task Output - DO NOT Block

**NEVER** use TaskOutput with blocking waits (`block: true`). This causes timeout cascades when network is slow.

### Correct Pattern
When running background commands (`run_in_background: true`):

1. Note the task_id returned (e.g., `bf98126`)
2. Output is written to: `/tmp/claude/tasks/<task_id>.output`
3. Read results directly: `Read { file_path: "/tmp/claude/tasks/bf98126.output" }`
4. If file doesn't exist yet, wait briefly and Read again

### Why This Matters
- TaskOutput with `block: true` waits until timeout (30-180 seconds)
- If network is slow, you'll hit timeout after timeout
- Reading the file directly is instant - you either get content or "file not found"
- This pattern is especially critical during Supabase connectivity issues

### Anti-Pattern (DO NOT DO THIS)
```
// BAD: Blocks and causes timeout cascades
TaskOutput { task_id: "abc123", block: true, timeout: 60000 }
```

### Correct Pattern
```
// GOOD: Instant read, clear feedback
Read { file_path: "/tmp/claude/tasks/abc123.output" }
```

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

**Status**: ACTIVE - Replaced pattern-matching validation in LEO Protocol v4.3.3
**Model**: gpt-5-mini (NOT gpt-4o-mini)
**Temperature**: 0.3 (balance consistency + nuance)
**Threshold**: 70% weighted score to pass
**Storage**: ai_quality_assessments table

### Overview

LEO Protocol uses AI-powered multi-criterion weighted scoring ("Russian Judge" pattern) to evaluate deliverable quality across all phases. Each rubric evaluates content on a 0-10 scale per criterion, applies weights, and generates graduated feedback (required vs recommended improvements).

**Why Russian Judge?**: Like Olympic judging, multiple criteria are evaluated independently, weighted by importance, and combined for a final score. This prevents one strong criterion from masking weaknesses in others.

### Four Core Rubrics

#### 1. Strategic Directive (SD) Quality Rubric
**Phase**: LEAD (Strategic Approval)
**Content Type**: sd
**Criteria**:
- **Description Quality (35%)**: WHAT + WHY + business value + technical approach
  - 0-3: Missing, generic ("implement feature"), or pure boilerplate
  - 7-8: Clear WHAT + WHY with business value articulated
  - 9-10: Comprehensive with measurable impact
- **Strategic Objectives Measurability (30%)**: SMART criteria compliance
  - 0-3: No objectives or vague ("improve quality", "enhance UX")
  - 7-8: Most objectives are specific and measurable
  - 9-10: All objectives follow SMART criteria with clear success metrics
- **Success Metrics Quantifiability (25%)**: Baseline + target + method + timeline
  - 0-3: No metrics or vague ("better performance")
  - 7-8: Metrics with baseline and target ("reduce from 2s to 1s")
  - 9-10: Complete metrics with measurement method and timeline
- **Risk Assessment Depth (10%)**: Mitigation + contingency + probability
  - 0-3: No risks or listed without mitigation
  - 7-8: Risks with specific mitigation strategies
  - 9-10: Risks with mitigation + contingency plans + probability estimates

#### 2. Product Requirements Document (PRD) Quality Rubric
**Phase**: PLAN (Requirements & Architecture)
**Content Type**: prd
**Criteria**:
- **Requirements Depth & Specificity (40%)**: Avoid "To be defined" placeholders
  - 0-3: Mostly placeholders ("To be defined", "TBD", generic statements)
  - 7-8: Most requirements are specific, actionable, and complete
  - 9-10: All requirements are detailed, specific, testable with clear acceptance criteria
- **Architecture Explanation Quality (30%)**: Components, data flow, integration points
  - 0-3: No architecture details or vague high-level statements
  - 7-8: Clear architecture with components, data flow, and integration points
  - 9-10: Comprehensive architecture + trade-offs + scalability considerations
- **Test Scenario Sophistication (20%)**: Happy path + edge cases + error conditions
  - 0-3: No test scenarios or only trivial happy path
  - 7-8: Happy path + common edge cases + error handling scenarios
  - 9-10: Comprehensive test coverage including performance and security tests
- **Risk Analysis Completeness (10%)**: Technical risks + mitigation + rollback plan
  - 0-3: No technical risks identified or listed without mitigation
  - 7-8: Specific technical risks with concrete mitigation strategies
  - 9-10: Comprehensive risk analysis with rollback plan + monitoring strategy

**Hierarchical Context Enhancement**: PRD rubric receives SD context (strategic objectives, success metrics, business problem) for holistic evaluation that ensures PRD aligns with strategic goals.

#### 3. User Story Quality Rubric
**Phase**: PLAN (Granular Requirements)
**Content Type**: user_story
**Criteria**:
- **Acceptance Criteria Clarity (40%)**: Specific, testable, pass/fail criteria
- **INVEST Principles Compliance (35%)**: Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Technical Feasibility Assessment (15%)**: Implementation approach clarity
- **Context Completeness (10%)**: User context + rationale + dependencies

**Hierarchical Context Enhancement**: User Story rubric receives PRD context for alignment validation.

#### 4. Retrospective Quality Rubric
**Phase**: EXEC (Post-Implementation Review)
**Content Type**: retrospective
**Criteria**:
- **Issue Analysis Depth (40%)**: Root cause identification + pattern recognition
- **Solution Specificity (30%)**: Actionable, concrete, testable solutions
- **Lesson Articulation (20%)**: Clear, transferable learnings
- **Metadata Completeness (10%)**: Effort, cost, timeline accuracy

**Hierarchical Context Enhancement**: Retrospective rubric receives SD context to validate outcomes against strategic objectives.

### Hierarchical Context Pattern

**Purpose**: Provide parent context to enable holistic evaluation

**Context Flow**:
```
Strategic Directive (SD)
  ├─> PRD (receives SD context)
  │    └─> User Story (receives PRD context)
  └─> Retrospective (receives SD context)
```

**Implementation**:
- PRD validation: Fetches SD via `prd.sd_id → strategic_directives_v2.id`
- User Story validation: Fetches PRD via `user_story.prd_id → product_requirements_v2.id`
- Retrospective validation: Fetches SD via `retrospective.sd_id → strategic_directives_v2.sd_id`

**Why**: Prevents locally optimal but strategically misaligned deliverables. For example, a PRD might have perfect technical architecture (score 10/10) but completely miss the strategic business objective (SD context reveals misalignment).

### Anti-Patterns Heavily Penalized

**LEO Protocol values specificity and rejects boilerplate**:
- **Placeholder text**: "To be defined", "TBD", "during planning" → Score 0-3
- **Generic benefits**: "improve UX", "better system", "enhance functionality" → Score 0-3
- **Boilerplate acceptance criteria**: "all tests passing", "code review completed" → Score 4-6
- **Missing architecture details**: No data flow, no integration points → Score 0-3

### Scoring Scale Philosophy

**0-3: Completely inadequate** (missing, boilerplate, or unusable)
- Use for placeholder text, missing sections, pure boilerplate
- Example: "To be defined" in requirements

**4-6: Present but needs significant improvement**
- Use for generic statements that lack specificity
- Example: "improve system performance" (no baseline, no target)

**7-8: Good quality with minor issues**
- Use for specific, actionable content with clear intent
- Example: "Reduce page load from 2s to 1s" (has baseline + target)

**9-10: Excellent, exemplary quality** (reserve for truly exceptional work)
- Use ONLY for comprehensive, deeply thoughtful content
- Example: "Reduce page load from 2s to 1s (measured via Lighthouse, baseline from Google Analytics, target validated with UX research showing 1s = 15% bounce rate reduction, 3-month timeline)"

**Grade Inflation Prevention**: Rubrics are intentionally strict. Scores of 9-10 should be rare. Most good work scores 7-8. Mediocre work scores 4-6.

### Assessment Storage and History

**Table**: ai_quality_assessments

**Schema**:
```sql
CREATE TABLE ai_quality_assessments (
  id UUID PRIMARY KEY,
  content_type TEXT NOT NULL,           -- 'sd', 'prd', 'user_story', 'retrospective'
  content_id TEXT NOT NULL,             -- ID of content being assessed
  model TEXT NOT NULL,                  -- 'gpt-5-mini'
  temperature NUMERIC,                  -- 0.3
  scores JSONB NOT NULL,                -- Criterion-level scores + reasoning
  weighted_score INTEGER NOT NULL,      -- 0-100 final score
  feedback JSONB,                       -- {required: [], recommended: []}
  assessed_at TIMESTAMP,                -- When assessment ran
  assessment_duration_ms INTEGER,       -- Performance tracking
  tokens_used JSONB,                    -- {prompt_tokens, completion_tokens, total_tokens}
  cost_usd NUMERIC,                     -- AI API cost (gpt-5-mini: $0.15/1M input, $0.60/1M output)
  rubric_version TEXT                   -- 'v1.0.0'
);
```

**Why Store Assessments?**:
1. **Audit trail**: Track quality trends over time
2. **Cost transparency**: Monitor AI API spend
3. **Rubric evolution**: Compare quality before/after rubric changes
4. **Performance optimization**: Identify slow evaluations

### Integration with LEO Protocol Handoffs

**PLAN → EXEC Handoff (validate-plan-handoff.js)**:
- PRD quality validation: `PRDQualityRubric.validatePRDQuality(prd, sd)`
- User Story quality validation: `UserStoryQualityRubric.validateUserStoryQuality(userStory, prd)`
- Threshold: 70% weighted score to pass
- On failure: Returns FAIL with `issues` and `warnings` for PLAN agent to address

**EXEC → Retrospective**:
- Retrospective quality validation: `RetrospectiveQualityRubric.validateRetrospectiveQuality(retro, sd)`
- Ensures lessons learned are actionable and measurable

**LEAD → PLAN Handoff**:
- SD quality validation: `SDQualityRubric.validateSDQuality(sd)`
- Validates strategic clarity before PRD creation

### When to Use AI Quality Assessment

**Use AI Assessment When**:
- Evaluating subjective quality ("Is this requirement specific enough?")
- Validating completeness ("Are all required fields present AND meaningful?")
- Checking for anti-patterns (placeholder text, boilerplate)
- Ensuring strategic alignment (PRD → SD, User Story → PRD)

**Use Traditional Validation When**:
- Checking objective constraints (field presence, data types)
- Verifying database schema (foreign key integrity)
- Testing code functionality (unit tests, E2E tests)
- Enforcing hard rules (no merge without passing tests)

**Best Practice**: Combine both. Traditional validation catches structural issues ("description field is missing"). AI assessment catches quality issues ("description is present but generic boilerplate").

### Cost and Performance

**Typical Costs** (gpt-5-mini pricing):
- SD assessment: ~$0.001-0.003 per evaluation
- PRD assessment: ~$0.003-0.008 per evaluation (larger content)
- User Story assessment: ~$0.001-0.002 per evaluation
- Retrospective assessment: ~$0.002-0.005 per evaluation

**Performance**:
- Average assessment duration: 2-5 seconds
- Max tokens: 1000 (prevents runaway costs)
- Timeout: 30 seconds (with 3 retry attempts)
- Retry backoff: Exponential (1s, 2s, 4s)

**User Prioritization**: Quality over cost. The user explicitly prioritizes deliverable quality and is willing to accept AI costs for better validation.

### Migration from Pattern-Matching Validation

**Before (Pattern-Matching)**:
```javascript
// Naive keyword counting
const hasTBD = prd.requirements.some(r => r.includes('TBD'));
if (hasTBD) return { passed: false };
```

**After (AI Russian Judge)**:
```javascript
// Holistic multi-criterion evaluation
const assessment = await prdRubric.validatePRDQuality(prd, sd);
// Returns: { passed: true/false, score: 0-100, issues: [], warnings: [], details: {...} }
```

**Why AI is Better**:
- Evaluates **meaning**, not just keywords ("To be determined" detected same as "TBD")
- Multi-dimensional scoring (can't hide one weakness behind one strength)
- Provides actionable feedback ("Requirements need baseline metrics, not just targets")
- Hierarchical context (PRD evaluated in light of SD strategic objectives)

### Files Reference

**Rubric Implementations**:
- `/scripts/modules/rubrics/sd-quality-rubric.js`
- `/scripts/modules/rubrics/prd-quality-rubric.js`
- `/scripts/modules/rubrics/user-story-quality-rubric.js`
- `/scripts/modules/rubrics/retrospective-quality-rubric.js`

**Base Class**:
- `/scripts/modules/ai-quality-evaluator.js`

**Integration Points**:
- `/scripts/validate-plan-handoff.js` (PRD + User Story validation)
- `/scripts/validate-lead-handoff.js` (SD validation)
- Retrospective validation (TBD - future integration)

**Database Schema**:
- `/database/schema/` (ai_quality_assessments table)

### Example: PRD Validation Flow

1. **PLAN agent creates PRD** in database
2. **User calls**: `npm run handoff` (PLAN → EXEC)
3. **validate-plan-handoff.js runs**:
   - Fetches PRD from database
   - Fetches parent SD via `prd.sd_id`
   - Calls `PRDQualityRubric.validatePRDQuality(prd, sd)`
4. **AI evaluator**:
   - Formats PRD content + SD context
   - Builds multi-criterion prompt
   - Calls OpenAI API (gpt-5-mini)
   - Parses scores, calculates weighted score
   - Generates graduated feedback
   - Stores assessment in `ai_quality_assessments` table
5. **Handoff script**:
   - If score ≥ 70: PASS → Proceed to EXEC
   - If score < 70: FAIL → Return `issues` to PLAN agent for revision
6. **User receives**: Structured feedback with criterion-level scores + reasoning

### Quality Philosophy Alignment

**LEO Protocol Core Values**:
1. **Database-first**: All requirements in database (not markdown)
2. **Anti-boilerplate**: Reject generic, placeholder text
3. **Specific & testable**: Every requirement has clear pass/fail criteria
4. **Measured progress**: Track quality trends over time

**How Russian Judge Supports This**:
1. **Database-first**: Assessments stored in `ai_quality_assessments` table (audit trail)
2. **Anti-boilerplate**: Rubrics explicitly penalize "To be defined", "TBD", generic statements
3. **Specific & testable**: Criteria prompt for baseline, target, measurement method, timeline
4. **Measured progress**: `cost_usd`, `assessment_duration_ms`, `weighted_score` tracked per assessment

**Result**: Objective quality gates that enforce LEO Protocol's philosophy without relying on human judgment.



## 🔥 Hot Issue Patterns (Auto-Updated)

**CRITICAL**: These are active patterns detected from retrospectives. Review before starting work.

| Pattern ID | Category | Severity | Count | Trend | Top Solution |
|------------|----------|----------|-------|-------|--------------|
| PAT-003 | security | 🟠 high | 3 | 📉 | Add auth.uid() check to RLS policy USING |
| PAT-008 | deployment | 🟠 high | 2 | ➡️ | Check GitHub Actions secrets and package |
| PAT-EXEC-IMPL-001 | workflow | 🟠 high | 1 | ➡️ | Query database for existing tables/funct |
| PAT-PARENT-DET | workflow | 🟠 high | 1 | ➡️ | Add parent/child detection check in phas |
| PAT-PW-NETIDLE-001 | testing | 🟠 high | 1 | ➡️ | Change waitUntil from 'networkidle' to ' |

### Prevention Checklists

**security**:
- [ ] Verify RLS policies include auth.uid() checks
- [ ] Test with authenticated user context
- [ ] Check policy applies to correct operations

**deployment**:
- [ ] Verify all required secrets are set in GitHub
- [ ] Test locally with same Node version as CI
- [ ] Check package-lock.json is committed

**workflow**:
- [ ] Query DB for existing tables FIRST
- [ ] Check migration files in repo
- [ ] Check git log for SD commits

**testing**:
- [ ] Never use waitUntil: 'networkidle' with Vite dev server
- [ ] Use 'commit' or 'domcontentloaded' for navigation waits
- [ ] Explicitly wait for specific elements instead of network idle


*Patterns auto-updated from `issue_patterns` table. Use `npm run pattern:resolve PAT-XXX` to mark resolved.*




## 📝 Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

### 1. UI Canon Alignment - Retrospective ⭐
**Category**: TESTING_STRATEGY | **Date**: 12/19/2025 | **Score**: 100

**Key Improvements**:
- E2E test timeout configuration for mock mode
- Deprecation enforcement for legacy stage constants

**Action Items**:
- [ ] Add eslint rule to deprecate IDEATION_STAGES import and suggest VENTURE_STAGES
- [ ] Configure separate Playwright timeouts for mock-mode tests (30s) vs real-mode te...

### 2. Settings Tab Clarity + Feature Catalog Copy (NAV-48 + NAV-49) - Retrospective ⭐
**Category**: APPLICATION_ISSUE | **Date**: 12/26/2025 | **Score**: 100

**Key Improvements**:
- PLAN-TO-EXEC handoff timed out on OpenAI API calls
- Had to manually advance phase due to API timeouts

**Action Items**:
- [ ] Add timeout fallback for AI quality assessment in handoffs
- [ ] Complete missing handoff documentation

### 3. Vision V2: EVA Orchestration Layer - Retrospective ⭐
**Category**: DATABASE_SCHEMA | **Date**: 12/14/2025 | **Score**: 100

**Key Improvements**:
- No unified test evidence found - consider running comprehensive E2E tests
- No unified test evidence found - consider running comprehensive E2E tests

**Action Items**:
- [ ] Add reset_sd_phase RPC function for administrative phase corrections
- [ ] Maintain E2E test path auto-generation for all SD types

### 4. Legacy Protocol Cleanup (The Exorcism) - Retrospective ⭐
**Category**: DEPLOYMENT_ISSUE | **Date**: 12/16/2025 | **Score**: 100

**Key Improvements**:
- Should have documented rollback procedure before starting
- E2E tests could verify UI still renders Stage1-25 correctly

**Action Items**:
- [ ] Create rollback procedure for stage component deletions
- [ ] Add E2E test verifying Stage1-25 UI renders correctly

### 5. Sovereign Industrial Expansion - Stages 7-25 Materialization (Orchestrator) ⭐
**Category**: PROCESS_IMPROVEMENT | **Date**: 12/27/2025 | **Score**: 100

**Key Improvements**:
- LEO Protocol artifacts should be created BEFORE implementation, not retroactively
- Handoff chain documentation should accompany development from the start

**Action Items**:
- [ ] Create orchestrator SD template with built-in child tracking
- [ ] Enforce LEO Protocol compliance for all SDs from LEAD phase


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

#### UAT Test Executor (`UAT`)
Interactive UAT test execution guide for manual testing workflows.

**Mission**: Guide human testers

**Trigger Keywords**: `uat test`, `execute test`, `run uat`, `test execution`, `manual test`, `uat testing`, `start testing`, `TEST-AUTH`, `TEST-DASH`, `TEST-VENT`

#### DevOps Platform Architect (`GITHUB`)
# DevOps Platform Architect Sub-Agent

**Identity**: You are a DevOps Platform Architect with 20 yea

**Trigger Keywords**: `EXEC_IMPLEMENTATION_COMPLETE`, `create pull request`, `gh pr create`, `LEAD_APPROVAL_COMPLETE`, `create release`, `PLAN_VERIFICATION_PASS`, `github deploy`, `github status`, `deployment ci pattern`

#### Launch Orchestration Sub-Agent (`LAUNCH`)
Handles production launch orchestration, go-live checklists, launch readiness, and rollback procedur

**Trigger Keywords**: `launch`, `go-live`, `production launch`, `deployment`, `release`, `rollout`, `cutover`, `launch checklist`, `beta release`, `GA release`

#### Performance Engineering Lead (`PERFORMANCE`)
Performance engineering lead with 20+ years optimizing high-scale systems.

**Mission**: Identify pe

**Trigger Keywords**: `optimization`

#### Continuous Improvement Coach (`RETRO`)
## Continuous Improvement Coach v4.0.0 - Quality-First Edition

**🆕 NEW in v4.0.0**: Proactive lear

**Trigger Keywords**: `LEAD_APPROVAL_COMPLETE`, `LEAD_REJECTION`, `PLAN_VERIFICATION_COMPLETE`, `PLAN_COMPLEXITY_HIGH`, `EXEC_SPRINT_COMPLETE`, `EXEC_QUALITY_ISSUE`, `HANDOFF_REJECTED`, `HANDOFF_DELAY`, `PHASE_COMPLETE`, `SD_STATUS_COMPLETED`, `SD_STATUS_BLOCKED`, `PATTERN_DETECTED`, `SUBAGENT_MULTIPLE_FAILURES`, `WEEKLY_LEO_REVIEW`, `LEAD_PRE_APPROVAL_REVIEW`, `capture this lesson`, `capture this insight`, `remember this`, `learning`, `lesson learned`, `insight`

#### Financial Modeling Sub-Agent (`FINANCIAL`)
Handles financial projections, P&L modeling, cash flow analysis, business model canvas financial sec

**Trigger Keywords**: `financial`, `P&L`, `profit and loss`, `cash flow`, `burn rate`, `runway`, `revenue projection`, `margin`, `gross margin`, `EBITDA`, `break even`, `financial model`

#### Monitoring Sub-Agent (`MONITORING`)
Handles monitoring setup, alerting, SLA definition, health checks, and incident response.

**Trigger Keywords**: `uptime`, `incident`, `observability`, `logging`, `tracing`, `Datadog`, `Prometheus`, `monitoring`, `alerting`, `health check`, `SLA`

#### Pricing Strategy Sub-Agent (`PRICING`)
Handles pricing model development, unit economics, pricing tiers, sensitivity analysis, and competit

**Trigger Keywords**: `pricing`, `price point`, `pricing strategy`, `unit economics`, `subscription`, `freemium`, `tiered pricing`, `CAC`, `LTV`, `revenue model`

#### Analytics Sub-Agent (`ANALYTICS`)
Handles analytics setup, metrics definition, dashboard creation, and data-driven insights.

**Trigger Keywords**: `analytics`, `metrics`, `dashboard`, `AARRR`, `funnel`, `conversion rate`, `user behavior`, `tracking`, `KPI`, `retention rate`, `churn rate`

#### API Architecture Sub-Agent (`API`)
## API Sub-Agent v1.0.0

**Mission**: REST/GraphQL endpoint design, API architecture, versioning, an

**Trigger Keywords**: `API`, `REST`, `RESTful`, `GraphQL`, `endpoint`, `route`, `controller`, `middleware`, `request`, `response`, `payload`, `status code`, `HTTP method`, `OpenAPI`, `Swagger`, `versioning`, `pagination`

#### Dependency Management Sub-Agent (`DEPENDENCY`)
# Dependency Management Specialist Sub-Agent

**Identity**: You are a Dependency Management Speciali

**Trigger Keywords**: `dependency`, `dependencies`, `npm`, `yarn`, `pnpm`, `package`, `package.json`, `vulnerability`, `CVE`, `security advisory`, `outdated`, `install`, `update`, `upgrade`, `version`, `semver`, `node_modules`, `patch`, `CVSS`, `exploit`, `Snyk`, `Dependabot`

#### Exit Valuation Sub-Agent (`VALUATION`)
Handles exit valuation modeling, comparable analysis, acquisition scenario planning, and investor re

**Trigger Keywords**: `valuation`, `exit`, `exit strategy`, `acquisition`, `IPO`, `Series A`, `fundraising`, `multiple`, `DCF`, `comparable`, `investor`

#### Marketing & GTM Sub-Agent (`MARKETING`)
Handles go-to-market strategy, marketing campaigns, channel selection, messaging, and brand position

**Trigger Keywords**: `marketing`, `go-to-market`, `GTM`, `campaign`, `positioning`, `messaging`, `channel strategy`, `content marketing`, `SEO`, `brand awareness`, `lead generation`

#### Sales Process Sub-Agent (`SALES`)
Handles sales playbook development, pipeline management, objection handling, and sales enablement.

**Trigger Keywords**: `sales`, `sales playbook`, `sales process`, `pipeline`, `deal flow`, `quota`, `sales cycle`, `objection handling`, `sales enablement`, `closing`

#### Senior Design Sub-Agent (`DESIGN`)
## Senior Design Sub-Agent v6.0.0 - Lessons Learned Edition

**🆕 NEW in v6.0.0**: Proactive learnin

**Trigger Keywords**: `component`, `visual`, `design system`, `styling`, `CSS`, `Tailwind`, `interface`, `UI`, `button`, `form`, `modal`, `theme`, `dark mode`, `light mode`, `responsive`, `mobile`, `user flow`, `navigation`, `journey`, `interaction`, `wireframe`, `prototype`, `UX`, `user experience`, `accessibility`, `WCAG`, `ARIA`, `screen reader`, `backend feature`, `API endpoint`, `database model`, `database table`, `new route`, `new endpoint`, `controller`, `service layer`, `business logic`, `new feature`, `feature implementation`, `user-facing`, `frontend`, `page`, `view`, `dashboard`

#### CRM Sub-Agent (`CRM`)
Handles customer relationship management, lead tracking, customer success metrics, and retention str

**Trigger Keywords**: `CRM`, `customer relationship`, `contact management`, `lead tracking`, `customer success`, `Salesforce`, `HubSpot`, `customer data`

#### User Story Context Engineering Sub-Agent (`STORIES`)
## User Story Context Engineering v2.0.0 - Lessons Learned Edition

**🆕 NEW in v2.0.0**: 5 critical

**Trigger Keywords**: `user story`, `user stories`, `acceptance criteria`, `implementation`, `context`, `guidance`, `PLAN_PRD`

#### Risk Assessment Sub-Agent (`RISK`)
## Risk Assessment Sub-Agent v1.0.0

**BMAD Enhancement**: Multi-domain risk assessment for Strategi

**Trigger Keywords**: `high risk`, `complex`, `refactor`, `migration`, `architecture`, `sophisticated`, `advanced`, `overhaul`, `redesign`, `restructure`, `authentication`, `authorization`, `security`, `rls`, `permission`, `access control`, `credential`, `encrypt`, `decrypt`, `sensitive`, `performance`, `optimization`, `slow`, `latency`, `cache`, `real-time`, `websocket`, `large dataset`, `bulk`, `scalability`, `third-party`, `external`, `api`, `integration`, `webhook`, `microservice`, `openai`, `stripe`, `twilio`, `aws`, `database`, `migration`, `schema`, `table`, `alter`, `postgres`, `sql`, `create table`, `foreign key`, `constraint`, `ui`, `ux`, `design`, `component`, `interface`, `dashboard`, `responsive`, `accessibility`, `a11y`, `mobile`, `LEAD_PRE_APPROVAL`, `PLAN_PRD`

#### Principal Database Architect (`DATABASE`)
## Principal Database Architect v2.0.0 - Lessons Learned Edition

**🆕 NEW in v2.0.0**: Proactive le

**Trigger Keywords**: `schema`, `migration`, `EXEC_IMPLEMENTATION_COMPLETE`, `database`, `query`, `select from`, `insert into`, `supabase`, `table`, `rls`, `postgres`, `sql`, `fetch from database`, `database query`

#### QA Engineering Director (`TESTING`)
## Enhanced QA Engineering Director v2.4.0 - Retrospective-Informed Edition

**🆕 NEW in v2.4.0**: 7

**Trigger Keywords**: `coverage`, `protected route`, `build error`, `dev server`, `test infrastructure`, `testing evidence`, `redirect to login`, `playwright build`, `EXEC_IMPLEMENTATION_COMPLETE`, `unit tests`, `vitest`, `npm run test:unit`, `test results`, `testing test pattern`

#### Principal Systems Analyst (`VALIDATION`)
## Principal Systems Analyst v3.0.0 - Retrospective-Informed Edition

**🆕 NEW in v3.0.0**: 6 critic

**Trigger Keywords**: `existing implementation`, `duplicate`, `conflict`, `already implemented`, `codebase check`


**Note**: Sub-agent results MUST be persisted to `sub_agent_execution_results` table.


---

*Generated from database: 2026-01-11*
*Protocol Version: 4.3.3*
*Includes: Proposals (0) + Hot Patterns (5) + Lessons (5)*
*Load this file first in all sessions*
