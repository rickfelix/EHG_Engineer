# CLAUDE_PLAN.md - LEO Protocol PLAN Phase Context

**Generated**: 2025-10-14 9:31:51 PM
**Protocol**: LEO vv4.2.0_story_gates
**Purpose**: PLAN phase operations + core context

---

## 📋 What's Included

This file contains:
1. **Core Context** (9 sections) - Essential for all sessions
2. **PLAN Phase Context** (9 sections) - Phase-specific operations

**Total Size**: ~54k chars

---

# CORE CONTEXT (Essential)

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target ≥85% gate pass rate
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **Small PRs** - Target ≤100 lines, max 400 with justification
5. **7-element handoffs** - Required for all phase transitions
6. **Priority-first** - Use `npm run prio:top3` to justify work

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## 🏗️ Application Architecture - CRITICAL CONTEXT

### Two Distinct Applications:
1. **EHG_Engineer** (Management Dashboard) - WHERE YOU ARE NOW
   - **Path**: `/mnt/c/_EHG/EHG_Engineer/`
   - **Purpose**: LEO Protocol dashboard for managing Strategic Directives & PRDs
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase)
   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
   - **Port**: 3000-3001
   - **Role**: MANAGEMENT TOOL ONLY - no customer features here!

2. **EHG** (Business Application) - IMPLEMENTATION TARGET
   - **Path**: `/mnt/c/_EHG/ehg/`
   - **Purpose**: The actual customer-facing business application
   - **Database**: liapbndqlqxdcgpwntbv (Supabase)
   - **GitHub**: https://github.com/rickfelix/ehg.git
   - **Built with**: Vite + React + Shadcn + TypeScript
   - **Role**: WHERE ALL FEATURES GET IMPLEMENTED

### ⚠️ CRITICAL: During EXEC Phase Implementation
1. **Read PRD** from EHG_Engineer database
2. **Navigate** to `/mnt/c/_EHG/ehg/` for implementation
3. **Make code changes** in EHG application (NOT in EHG_Engineer!)
4. **Push changes** to EHG's GitHub repo: `rickfelix/ehg.git`
5. **Track progress** in EHG_Engineer dashboard

### 🔄 Workflow Relationship
```
EHG_Engineer (Management)          EHG App (Implementation)
├── Strategic Directives     →     Features implemented here
├── PRDs                     →     Code changes made here
├── Progress Tracking        ←     Results verified from here
└── Dashboard Views          ←     No changes here!
```

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


## 🔄 Git Commit Guidelines

**Git Commit Guidelines**: `<type>(<SD-ID>): <subject>` format MANDATORY

**Required**: Type (feat/fix/docs/etc), SD-ID scope, imperative subject, AI attribution in footer
**Timing**: After checklist items, before context switches, at logical breakpoints
**Branch Strategy**: `eng/` prefix for EHG_Engineer, standard prefixes for EHG app features
**Size**: <100 lines ideal, <200 max

**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`

## Database Operations - One Table at a Time

### REQUIRED: Database Operations Only

**⚠️ CRITICAL: One Table at a Time**
- When manipulating Supabase tables, **ALWAYS operate on ONE table at a time**
- Batch operations across multiple tables often fail or cause inconsistencies
- Complete each table operation fully before moving to the next table
- Verify success after each table operation before proceeding

**Strategic Directives**:
- ✅ Create in `strategic_directives_v2` table
- ✅ Use `scripts/create-strategic-directive.js` or dashboard
- ✅ ALL SD data must be in database, not files
- ✅ **One SD insertion at a time** - verify before next

**PRDs (Product Requirements)**:
- ✅ Create in `product_requirements_v2` table
- ✅ Use `scripts/add-prd-to-database.js`
- ✅ Link to SD via `strategic_directive_id` foreign key
- ✅ **One PRD insertion at a time** - verify before next

**Retrospectives**:
- ✅ Create in `retrospectives` table
- ✅ Use `scripts/generate-comprehensive-retrospective.js`
- ✅ Trigger: Continuous Improvement Coach sub-agent
- ✅ Link to SD via `sd_id` foreign key
- ✅ **One retrospective at a time** - verify before next

**Handoffs**:
- ✅ Store in handoff tracking tables
- ✅ 7-element structure required
- ✅ Link to SD and phase
- ✅ **One handoff at a time** - verify before next

**Progress & Verification**:
- ✅ Update database fields directly
- ✅ Store verification results in database
- ✅ Track in real-time via dashboard
- ✅ **One record update at a time** - verify before next

## 📊 Communication & Context

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

## Quick Reference

## 📋 QUICK REFERENCE

### Component Sizing

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| <200 | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot for testing & maintenance |
| >800 | **MUST split** | Too complex, hard to test |

### Git Commits (Conventional Commits)

**Format**: `<type>(<SD-ID>): <subject>`

```bash
git commit -m "feat(SD-XXX): Brief description

Detailed explanation of changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Types**: feat, fix, docs, refactor, test, chore, perf

### Server Restart (After ANY Changes)

```bash
# Kill
pkill -f "node server.js"

# Build (if UI changes)
npm run build:client

# Restart
PORT=3000 node server.js

# Hard refresh browser
# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
```

### Parallel Execution (Save Time)

**When Safe**:
- ✅ Multiple independent file reads
- ✅ Multiple database queries (read-only)
- ✅ Sub-agent execution (different domains)

**NOT Safe**:
- ❌ Write operations
- ❌ Database mutations
- ❌ Sequential dependencies

**Example**:
```bash
# LEAD Pre-Approval: 4 sub-agents in parallel
node scripts/systems-analyst-codebase-audit.js <SD-ID> &
node scripts/database-architect-schema-review.js <SD-ID> &
node scripts/security-architect-assessment.js <SD-ID> &
node scripts/design-subagent-evaluation.js <SD-ID> &
wait

# Reduces time from 2 minutes sequential to 30 seconds parallel
```

### Context Efficiency Patterns

```javascript
// ❌ Inefficient
const { data } = await supabase.from('table').select('*');
console.log(data); // Dumps full JSON

// ✅ Efficient
const { data } = await supabase
  .from('table')
  .select('id, title, status')
  .limit(5);
console.log(`Found ${data.length} items`);
```

### Database Operations (One at a Time)

**CRITICAL**: When manipulating Supabase tables, operate on ONE table at a time.

```javascript
// ❌ Bad: Batch across tables
await Promise.all([
  supabase.from('table1').insert(data1),
  supabase.from('table2').insert(data2)
]);

// ✅ Good: Sequential, one table at a time
await supabase.from('table1').insert(data1);
// Verify success
await supabase.from('table2').insert(data2);
// Verify success
```

### Sub-Agent Orchestration

**Automated** (preferred):
```bash
# Orchestrator runs all required sub-agents for phase
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>

# Phases: LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, LEAD_FINAL
```

**Manual** (if needed):
```bash
# QA Director
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# GitHub Actions
node scripts/github-actions-verifier.js <SD-ID>

# Database Architect
node scripts/database-architect-schema-review.js <SD-ID>
```

### Testing Commands

```bash
# Unit tests (business logic)
npm run test:unit

# E2E tests (user flows)
npm run test:e2e

# Both (MANDATORY before EXEC→PLAN handoff)
npm run test:unit && npm run test:e2e
```

### Handoff Creation

```bash
# Unified handoff system (with auto sub-agent orchestration)
node scripts/unified-handoff-system.js execute <TYPE> <SD-ID>

# Types:
# - LEAD-to-PLAN
# - PLAN-to-EXEC
# - EXEC-to-PLAN (auto-runs PLAN_VERIFY sub-agents)
# - PLAN-to-LEAD (auto-runs LEAD_FINAL sub-agents)
```

### Progress Verification

```bash
# Check progress breakdown
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await supabase.rpc('get_progress_breakdown', { sd_id_param: 'SD-XXX' });
  console.log(JSON.stringify(data, null, 2));
})();
"
```

## 🔧 CRITICAL DEVELOPMENT WORKFLOW

**Development Workflow**: MANDATORY server restart after ANY changes

**Steps**: Kill server → Build client (`npm run build:client`) → Restart server → Hard refresh browser
**Why**: No hot-reloading configured, dist/ serves compiled files
**Commands**: `pkill -f "node server.js" && npm run build:client && PORT=3000 node server.js`

**Complete Guide**: See `docs/reference/development-workflow.md`


---

# PLAN PHASE CONTEXT

## Context Management Throughout Execution

## 🧠 CONTEXT MANAGEMENT (Throughout Execution)

**Token Budget**: 200,000 tokens

### Status Thresholds

| Status | Range | Percentage | Action |
|--------|-------|------------|--------|
| 🟢 HEALTHY | 0-140K | 0-70% | Continue normally |
| 🟡 WARNING | 140K-180K | 70-90% | Consider `/context-compact` |
| 🔴 CRITICAL | 180K-190K | 90-95% | MUST compact before handoff |
| 🚨 EMERGENCY | >190K | >95% | BLOCKED - force handoff |

### Report in EVERY Handoff

**Mandatory section in all handoffs**:
```markdown
## Context Health
**Current Usage**: X tokens (Y% of 200K budget)
**Status**: HEALTHY/WARNING/CRITICAL
**Recommendation**: [action if needed]
**Compaction Needed**: YES/NO
```

### Efficiency Rules

**Always apply these practices**:

1. **Select specific columns** (not `SELECT *`)
   ```javascript
   // ❌ Bad
   .select('*')

   // ✅ Good
   .select('id, title, status, priority')
   ```

2. **Limit results** for large datasets
   ```javascript
   .limit(5)  // For summaries
   .limit(50) // For dashboards
   ```

3. **Summarize, don't dump**
   ```javascript
   // ❌ Bad: Full JSON dump
   console.log(results);

   // ✅ Good: Summary
   console.log(`Found ${results.length} tests: ${passed} passed, ${failed} failed`);
   ```

4. **Use Read tool with offset/limit** for large files
   ```javascript
   Read('file.js', { offset: 100, limit: 50 })
   ```

5. **Compress sub-agent reports** (3-tier system)
   - TIER 1 (CRITICAL): Full detail for blockers
   - TIER 2 (IMPORTANT): Structured summary for warnings
   - TIER 3 (INFORMATIONAL): One-line for passing checks

### Expected Impact

Applying these rules: **90-98% token reduction per query**

### Compaction Command

When WARNING or CRITICAL:
```bash
/context-compact [focus area]
```

Example:
```bash
/context-compact database-schema
```

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

## Multi-Application Testing Architecture

**Multi-App Testing**: Two independent test suites (EHG_Engineer + EHG app).

**CRITICAL**: Determine target app from SD context before running tests
- **EHG_Engineer**: Vitest + Jest (50% coverage)
- **EHG**: Vitest (unit) + Playwright (E2E)

**Full Guide**: See `docs/reference/multi-app-testing.md`

## Enhanced QA Engineering Director v2.0 - Testing-First Edition

**Enhanced QA Engineering Director v2.0**: Mission-critical testing automation with comprehensive E2E validation.

**Core Capabilities:**
1. Professional test case generation from user stories
2. Pre-test build validation (saves 2-3 hours)
3. Database migration verification (prevents 1-2 hours debugging)
4. **Mandatory E2E testing via Playwright** (REQUIRED for approval)
5. Test infrastructure discovery and reuse

**5-Phase Workflow**: Pre-flight checks → Test generation → E2E execution → Evidence collection → Verdict & learnings

**Activation**: Auto-triggers on `EXEC_IMPLEMENTATION_COMPLETE`, coverage keywords, testing evidence requests

**Full Guide**: See `docs/reference/qa-director-guide.md`

## PLAN Pre-EXEC Checklist

## PLAN Agent Pre-EXEC Checklist (MANDATORY)

**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.

Before creating PLAN→EXEC handoff, PLAN agent MUST verify:

### Database Dependencies ✅
- [ ] **Identify all data dependencies** in PRD
- [ ] **Run schema verification script** for data-dependent SDs
- [ ] **Verify tables/columns exist** OR create migration
- [ ] **Document verification results** in PLAN→EXEC handoff
- [ ] If tables missing: **Escalate to LEAD** with options

**Success Pattern** (SD-UAT-003):
> "Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours"

### Architecture Planning ✅
- [ ] **Component sizing estimated** (target 300-600 lines per component)
- [ ] **Existing infrastructure identified** (don't rebuild what exists)
- [ ] **Third-party libraries considered** before custom code

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

### Testing Strategy ✅
- [ ] **Smoke tests defined** (3-5 tests minimum)
- [ ] **Test scenarios documented** in PRD

### Quality Validation ✅
- [ ] **Verified claims with code review** (if UI/UX SD)
- [ ] **Assessed technical feasibility**
- [ ] **Identified potential blockers**

**Success Pattern** (SD-UAT-002):
> "LEAD code review rejected 3/5 false claims → saved hours of unnecessary work"


## Testing Tier Strategy

## Testing Requirements - Clear Thresholds

**Evidence from Retrospectives**: Testing confusion appeared in SD-UAT-002, SD-UAT-020, SD-008.

### Three-Tier Testing Strategy

#### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: 3-5 tests, <60 seconds execution
- **Approval**: **SUFFICIENT for PLAN→LEAD approval**

#### Tier 2: Comprehensive E2E (RECOMMENDED) 📋
- **Requirement**: 30-50 tests covering user flows
- **Approval**: Nice to have, **NOT blocking for LEAD approval**
- **Timing**: Can be refined post-deployment

#### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Single smoke test recommended (+5 min)
- **Logic changes <5 lines**: Optional
- **Logic changes >10 lines**: Required

### Anti-Pattern to Avoid ❌

**DO NOT** create 100+ manual test checklists unless specifically required.

**From SD-UAT-020**:
> "Created 100+ test checklist but didn't execute manually. Time spent on unused documentation."

## Component Sizing Guidelines

## Component Sizing Guidelines

**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.

### Optimal Component Size: 300-600 Lines

**Success Pattern** (SD-UAT-020):
> "Split settings into three focused components. Each ~500 lines. Easy to test and maintain."

### Sizing Rules

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot |
| **>800** | **MUST split** | Too complex |

## 🔬 BMAD Method Enhancements

## 🔬 BMAD Method Enhancements

**BMAD** (Build-Measure-Adapt-Document) Method principles integrated into LEO Protocol to reduce context consumption, improve implementation quality, and enable early error detection.

### Core Principles

1. **Dev Agents Must Be Lean**: Minimize context consumption throughout workflow
2. **Natural Language First**: Reduce code-heavy implementation guidance
3. **Context-Engineered Stories**: Front-load implementation details to reduce EXEC confusion
4. **Risk Assessment**: Multi-domain analysis during LEAD_PRE_APPROVAL
5. **Mid-Development Quality Gates**: Checkpoint pattern for large SDs
6. **Early Validation**: Catch issues at gates, not during final testing

---

### Six BMAD Enhancements

**1. Risk Assessment Sub-Agent (RISK)**
- **Phase**: LEAD_PRE_APPROVAL (mandatory for all SDs)
- **Purpose**: Multi-domain risk scoring before approval
- **Domains**: Technical Complexity (1-10), Security Risk (1-10), Performance Risk (1-10), Integration Risk (1-10), Data Migration Risk (1-10), UI/UX Risk (1-10)
- **Storage**: risk_assessments table
- **Script**: node lib/sub-agent-executor.js RISK SD-ID
- **Benefit**: Early risk identification prevents 4-6 hours rework per SD

**2. User Story Context Engineering (STORIES)**
- **Phase**: PLAN_PRD (after PRD creation, before EXEC)
- **Purpose**: Hyper-detailed implementation context for each user story
- **Fields Added**: implementation_context, architecture_references, example_code_patterns, testing_scenarios
- **Storage**: user_stories table columns
- **Script**: node lib/sub-agent-executor.js STORIES SD-ID
- **Benefit**: Reduces EXEC confusion by 30-40% through front-loaded guidance
- **Validation**: PLAN→EXEC handoff checks for ≥80% coverage

**3. Retrospective Review for LEAD**
- **Phase**: LEAD_PRE_APPROVAL (before approving new SDs)
- **Purpose**: Learn from similar completed SDs
- **Analysis**: Success patterns, failure patterns, effort adjustments, risk mitigations
- **Storage**: Queries retrospectives table
- **Script**: node scripts/retrospective-review-for-lead.js SD-ID
- **Benefit**: Informed decision-making based on historical data

**4. Checkpoint Pattern Generator**
- **Phase**: PLAN_PRD (for SDs with >8 user stories)
- **Purpose**: Break large SDs into 3-4 manageable checkpoints
- **Benefits**: 30-40% context reduction, 50% faster debugging, early error detection
- **Storage**: strategic_directives_v2.checkpoint_plan (JSONB)
- **Script**: node scripts/generate-checkpoint-plan.js SD-ID
- **Validation**: PLAN→EXEC handoff requires checkpoint plan for large SDs

**5. Test Architecture Phase Enhancement**
- **Phase**: PLAN_PRD and PLAN_VERIFY (QA Director integration)
- **Purpose**: Structured test planning with 4 strategies
- **Strategies**: Unit (business logic), E2E (user flows), Integration (APIs/DB), Performance (benchmarks)
- **Storage**: test_plans table
- **Script**: QA Director auto-generates during PLAN phase
- **Benefit**: 100% user story → E2E test mapping enforced
- **Validation**: EXEC→PLAN handoff checks test plan existence and coverage

**6. Lean EXEC_CONTEXT.md**
- **Phase**: EXEC_IMPLEMENTATION (context optimization)
- **Purpose**: Reduced CLAUDE.md for EXEC agents (~500 lines vs 5000+)
- **Content**: EXEC-specific guidance only (no LEAD/PLAN operations)
- **Location**: docs/EXEC_CONTEXT.md
- **Benefit**: 90% context reduction during EXEC phase

---

### Validation Gates Integration

**PLAN→EXEC Handoff**:
- ✅ User story context engineering (≥80% coverage)
- ✅ Checkpoint plan (if SD has >8 stories)
- ✅ Risk assessment exists

**EXEC→PLAN Handoff**:
- ✅ Test plan generated (unit + E2E strategies)
- ✅ User story → E2E mapping (100% requirement)
- ✅ Test plan stored in database

**Validation Script**: scripts/modules/bmad-validation.js
**Integration**: Automatic via unified-handoff-system.js

---

### Quick Reference: BMAD Scripts

```bash
# 1. Risk Assessment (LEAD_PRE_APPROVAL)
node lib/sub-agent-executor.js RISK SD-ID

# 2. User Story Context Engineering (PLAN_PRD)
node lib/sub-agent-executor.js STORIES SD-ID

# 3. Retrospective Review (LEAD_PRE_APPROVAL)
node scripts/retrospective-review-for-lead.js SD-ID

# 4. Checkpoint Plan (PLAN_PRD, if >8 stories)
node scripts/generate-checkpoint-plan.js SD-ID

# 5. Test Architecture (PLAN_VERIFY, automatic)
node scripts/qa-engineering-director-enhanced.js SD-ID

# 6. Lean EXEC Context (reference during EXEC)
cat docs/EXEC_CONTEXT.md
```

---

### Expected Impact

**Context Consumption**:
- User story context engineering: 30-40% reduction in EXEC confusion
- Checkpoint pattern: 30-40% reduction in total context per large SD
- Lean EXEC_CONTEXT.md: 90% reduction during EXEC phase

**Time Savings**:
- Risk assessment: 4-6 hours saved per SD (early issue detection)
- Test architecture: 2-3 hours saved per SD (structured planning)
- Retrospective review: Informed decisions prevent 3-4 hours unnecessary work

**Quality Improvements**:
- Early validation gates catch issues before late-stage rework
- Structured test planning ensures 100% user story coverage
- Context engineering reduces implementation ambiguity

---

### Database Schema Additions

**New Tables**:
- risk_assessments: Risk scoring across 6 domains
- test_plans: Structured test strategies (4 types)

**Enhanced Tables**:
- user_stories: Added implementation_context, architecture_references, example_code_patterns, testing_scenarios
- strategic_directives_v2: Added checkpoint_plan (JSONB)

**Sub-Agents**:
- leo_sub_agents: Added RISK (code: 'RISK', priority: 8)
- leo_sub_agents: Added STORIES (code: 'STORIES', priority: 50)

---

### Further Reading

- **BMAD Principles**: See retrospectives from SD-UAT-002, SD-UAT-020, SD-EXPORT-001
- **Implementation Guide**: docs/bmad-implementation-guide.md
- **Validation Gates**: docs/reference/handoff-validation.md

*Last Updated: 2025-10-12*
*BMAD Method: Build-Measure-Adapt-Document*


## CI/CD Pipeline Verification

## CI/CD Pipeline Verification (MANDATORY)

**Evidence from Retrospectives**: Gap identified in SD-UAT-002 and SD-LEO-002.

### Verification Process

**After EXEC implementation complete, BEFORE PLAN→LEAD handoff**:

1. Wait 2-3 minutes for GitHub Actions to complete
2. Trigger DevOps sub-agent to verify pipeline status
3. Document CI/CD status in PLAN→LEAD handoff
4. PLAN→LEAD handoff is **BLOCKED** if pipelines failing

---

*Generated from database: leo_protocol_sections*
*Context tiers: CORE + PHASE_PLAN*
*Protocol: v4.2.0_story_gates*
