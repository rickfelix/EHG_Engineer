# CLAUDE_EXEC.md - LEO Protocol EXEC Phase Context

**Generated**: 2025-10-24 7:50:52 AM
**Protocol**: LEO vv4.2.0_story_gates
**Purpose**: EXEC phase operations + core context

---

## 📋 What's Included

This file contains:
1. **Core Context** (9 sections) - Essential for all sessions
2. **EXEC Phase Context** (9 sections) - Phase-specific operations

**Total Size**: ~54k chars

---

# CORE CONTEXT (Essential)

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target ≥85% gate pass rate
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, unified-handoff-system.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
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

# EXEC PHASE CONTEXT

## Strategic Directive Execution Protocol

# STRATEGIC DIRECTIVE EXECUTION PROTOCOL

**When executing a Strategic Directive, follow this structured 5-phase workflow.**

## Target Application Selection

**CRITICAL FIRST STEP**: Determine which application this SD targets:

- **EHG** (`/mnt/c/_EHG/ehg/`) - Customer-facing features (MOST IMPLEMENTATIONS)
  - Database: liapbndqlqxdcgpwntbv (Supabase)
  - GitHub: rickfelix/ehg.git
  - Stack: Vite + React + Shadcn + TypeScript

- **EHG_Engineer** (`/mnt/c/_EHG/EHG_Engineer/`) - LEO Protocol dashboard/tooling ONLY
  - Database: dedlbzhpgkmetvhbkyzq (Supabase)
  - GitHub: rickfelix/EHG_Engineer.git
  - Role: Management tool, no customer features

## Priority Tiers

- **CRITICAL** (90+): Business-critical, immediate action required
- **HIGH** (70-89): Important features, near-term priority
- **MEDIUM** (50-69): Standard enhancements, planned work
- **LOW** (30-49): Nice-to-have improvements

## Workflow Overview

Execute in order: **LEAD PRE-APPROVAL → PLAN PRD → EXEC IMPLEMENTATION → PLAN VERIFICATION → LEAD FINAL APPROVAL**

Each phase has:
- Assigned agent (LEAD/PLAN/EXEC)
- Percentage allocation
- Required sub-agents
- Exit criteria
- Mandatory handoff

See detailed phase sections below.

## 5-Phase Strategic Directive Workflow

## 🎯 5-PHASE STRATEGIC DIRECTIVE WORKFLOW

Total: 100% = LEAD (35%) + PLAN (35%) + EXEC (30%)

---

### PHASE 1: LEAD PRE-APPROVAL (20% of LEAD allocation)

**Agent**: Strategic Leadership Agent (LEAD)
**Purpose**: Strategic validation, business alignment, feasibility assessment
**Duration**: 1-2 hours

**Mandatory Sub-Agents**:
- Principal Systems Analyst (duplicate check, existing implementation)
- Principal Database Architect (if database keywords in scope)
- Chief Security Architect (if security keywords in scope)
- Senior Design Sub-Agent (if UI/UX keywords in scope)

**Execution**: Run in parallel to save time
```bash
# Parallel execution
node scripts/systems-analyst-codebase-audit.js <SD-ID> &
node scripts/database-architect-schema-review.js <SD-ID> &
node scripts/security-architect-assessment.js <SD-ID> &
node scripts/design-subagent-evaluation.js <SD-ID> &
wait
```

**Deliverables**:
- SD approved or rejected with feedback
- Strategic Validation gate passed
- Over-engineering rubric applied (if needed)
- LEAD→PLAN handoff created

**Exit Criteria**:
- SD status = 'active'
- Strategic Validation gate passed (6 questions answered)
- No critical blockers identified
- Handoff stored in `sd_phase_handoffs`

---

### PHASE 2: PLAN PRD CREATION (20% of PLAN allocation)

**Agent**: Technical Planning Agent (PLAN)
**Purpose**: Technical design, PRD creation, test planning
**Duration**: 2-4 hours

**Mandatory Sub-Agents**:
- Principal Database Architect (MANDATORY for ALL SDs - database validation)
- Product Requirements Expert (auto-generates user stories)

**Execution**: Sequential (each informs next)
```bash
# Step 1: Database validation
node scripts/database-architect-schema-review.js <SD-ID>

# Step 2: User story generation (automatic)
# Triggered by PRD creation, stores in user_stories table

# Step 3: Component sizing (if UI/UX SD)
node scripts/design-subagent-evaluation.js <SD-ID>
```

**Deliverables**:
- PRD created in `product_requirements_v2` table
- User stories in `user_stories` table (100% mapped to E2E tests)
- Component architecture defined (300-600 LOC per component)
- Database migrations planned (if needed)
- PLAN→EXEC handoff created

**Exit Criteria**:
- PRD exists with comprehensive test plan
- User stories generated and validated
- Database dependencies resolved or escalated
- Handoff stored in `sd_phase_handoffs`

---

### PHASE 3: EXEC IMPLEMENTATION (30% of EXEC allocation)

**Agent**: Implementation Agent (EXEC)
**Purpose**: Code implementation, testing, delivery
**Duration**: 4-8 hours

**Mandatory Sub-Agents**:
- None (EXEC does the work directly)

**Pre-Implementation Checklist**:
```markdown
## EXEC Pre-Implementation Checklist
- [ ] Application: [EHG or EHG_Engineer - VERIFIED via pwd]
- [ ] GitHub remote: [verified via git remote -v]
- [ ] URL: [exact URL from PRD - accessible: YES/NO]
- [ ] Component: [path/to/component]
- [ ] Screenshot: [BEFORE state captured]
```

**Post-Implementation Requirements**:
1. **Server Restart** (MANDATORY for UI changes)
   ```bash
   pkill -f "node server.js"
   npm run build:client  # If UI changes
   PORT=3000 node server.js
   # Hard refresh: Ctrl+Shift+R
   ```

2. **Git Commit** (Conventional Commits with SD-ID)
   ```bash
   git commit -m "feat(<SD-ID>): Brief description

   Detailed explanation.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

3. **Dual Test Execution** (MANDATORY - BOTH types)
   ```bash
   npm run test:unit      # Business logic
   npm run test:e2e       # User flows
   ```

4. **Wait for CI/CD** (2-3 minutes)
   ```bash
   gh run list --limit 5  # All green ✅
   ```

**Deliverables**:
- Implementation complete
- Unit tests pass
- E2E tests pass (100% user story coverage)
- CI/CD pipelines green
- Documentation generated
- EXEC→PLAN handoff created

**Exit Criteria**:
- All PRD requirements implemented
- Both test types passing
- CI/CD green
- Documentation exists in `generated_docs`
- **Branch lifecycle clean** (see below)
- Handoff stored in `sd_phase_handoffs`

**Branch Lifecycle Verification** (AUTOMATED):
The GITHUB sub-agent (DevOps Platform Architect) automatically verifies:

✅ **No uncommitted changes** - All work committed
- ❌ **BLOCKING**: Uncommitted changes prevent handoff creation
- Fix: Commit or stash changes before handoff

✅ **No unpushed commits** - Branch synced with remote
- ⚠️  **WARNING**: Unpushed commits lower confidence to 75%
- Fix: Push commits to remote before handoff

✅ **Minimal unmerged branches** - Clean branch hygiene
- ⚠️  **WARNING**: 5+ unmerged branches lower confidence to 80%
- Fix: Merge or delete stale branches

ℹ️  **Stale branches detected** - Cleanup recommendation
- Info only: Branches 30+ days old without commits
- Recommendation: Delete or update stale branches

**Automated Enforcement**:
- Runs automatically during EXEC→PLAN and PLAN→LEAD handoff creation
- Results stored in `sub_agent_execution_results` table
- Critical issues (uncommitted changes) BLOCK handoff
- Warnings reduce confidence score but don't block

---

### PHASE 4: PLAN SUPERVISOR VERIFICATION (15% of PLAN allocation)

**Agent**: Technical Planning Agent (PLAN) in supervisor mode
**Purpose**: Verification, quality assurance, sub-agent orchestration
**Duration**: 1-2 hours

**Mandatory Sub-Agents**:
- QA Engineering Director (CRITICAL - E2E testing)
- DevOps Platform Architect (CRITICAL - CI/CD verification)
- Principal Database Architect (if database changes)
- Chief Security Architect (if security features)
- Performance Engineering Lead (if performance-critical)
- Senior Design Sub-Agent (if UI components)

**Automated Orchestration**:
```bash
# Orchestrator runs automatically when creating EXEC→PLAN handoff
# All required sub-agents execute in parallel
# Results stored in sub_agent_execution_results table
# Handoff BLOCKED if CRITICAL sub-agents fail
```

**Manual Verification** (if needed):
```bash
# QA Director
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# GitHub Actions
gh run list --limit 5
gh run view [run-id]

# Database verification
node scripts/database-architect-schema-review.js <SD-ID>
```

**Deliverables**:
- All sub-agents executed
- E2E tests passed (100% user stories)
- CI/CD pipelines verified green
- Integration verification complete
- PLAN→LEAD handoff created

**Exit Criteria**:
- Verdict: PASS or CONDITIONAL_PASS (≥85% confidence)
- All CRITICAL sub-agents passed
- E2E test evidence documented
- Handoff stored in `sd_phase_handoffs`

---

### PHASE 5: LEAD FINAL APPROVAL (15% of LEAD allocation)

**Agent**: Strategic Leadership Agent (LEAD)
**Purpose**: Final approval, retrospective, completion
**Duration**: 30-60 minutes

**Mandatory Sub-Agents**:
- Continuous Improvement Coach (RETRO - retrospective generation)

**Automated Orchestration**:
```bash
# Orchestrator runs automatically when creating PLAN→LEAD handoff
# RETRO sub-agent executes if not already run
# Handoff BLOCKED if retrospective missing
```

**Approval Checklist**:
- [ ] PLAN→LEAD handoff reviewed
- [ ] Verification verdict acceptable (PASS or CONDITIONAL_PASS)
- [ ] All PRD requirements met (SCOPE LOCK validation)
- [ ] CI/CD pipelines green
- [ ] E2E test evidence sufficient (100% user stories)
- [ ] Retrospective generated
- [ ] Sub-agent validation script passed
- [ ] Human approval (if required)

**Deliverables**:
- SD marked as 'completed'
- Progress = 100%
- Retrospective in `retrospectives` table
- All handoffs complete
- Dashboard updated

**Exit Criteria**:
- SD status = 'completed'
- progress_percentage = 100
- completed_at timestamp set
- Retrospective exists with quality_score ≥ 70


## 🚨 EXEC Agent Implementation Requirements

### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

**Common Ambiguities to Watch For**:
- Vague feature descriptions ("improve UX", "make it better")
- Missing edge case handling ("what if user inputs invalid data?")
- Unclear success criteria ("should be fast", "should look good")
- Conflicting requirements between PRD sections
- Undefined behavior for error states

**Example Ambiguity Resolution**:
```
❌ BAD: Guess at implementation based on similar feature
✅ GOOD:
  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules
  - Tier 2: Query user_stories table → Found implementation_context with validation spec
  - Resolution: "Email validation will use regex pattern from US-002 context"
```

1. **APPLICATION CHECK** ⚠️ CRITICAL
   - Confirm target app: `/mnt/c/_EHG/ehg/` (NOT EHG_Engineer!)
   - Verify: `cd /mnt/c/_EHG/ehg && pwd` should show `/mnt/c/_EHG/ehg`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git`
   - If you're in EHG_Engineer, you're in the WRONG place for implementation!

2. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

3. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

4. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD
   - Document: "Application: [/path/to/app] on port [XXXX]"

5. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
```markdown
## EXEC Pre-Implementation Checklist
- [ ] **Ambiguity Check**: All requirements clear and unambiguous
- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]
- [ ] **Application verified**: [/mnt/c/_EHG/ehg/ confirmed]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [port number]
- [ ] **Screenshot taken**: [timestamp]
- [ ] **Target location confirmed**: [where changes go]
```

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation
- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous

## Sub-Agent Parallel Execution

**Overview**: Sub-agents are independent specialists. When multiple sub-agents provide non-overlapping assessments, call them in parallel to reduce latency.

**When Parallel Execution is Beneficial**:

1. **LEAD Initial Assessment**
   - Parallel: Security Architect + Database Architect + Business Analyst
   - Why: Each evaluates different aspects of an SD (security posture, data model feasibility, business alignment)
   - Context sharing: Not required - each has independent assessment criteria

2. **PLAN Supervisor Verification**
   - Parallel: QA Director + Security Architect + Performance Lead + Database Architect
   - Why: Final "done done" check across all quality dimensions simultaneously
   - Context sharing: Not required - each validates their domain independently

3. **EXEC Pre-Implementation Checks**
   - Parallel: Systems Analyst (duplicate check) + Security Architect (auth requirements) + Database Architect (schema changes)
   - Why: Gather all constraints before coding begins
   - Context sharing: Not required - each identifies risks independently

**When Sequential Execution is Required**:

- ❌ One sub-agent's output feeds another's input
- ❌ Database schema must be reviewed before security assessment
- ❌ Any workflow where order creates dependencies

**Implementation Pattern**:

```javascript
// ✅ Parallel - Independent assessments
const results = await Promise.all([
  callSubAgent('security-architect', sd_id),
  callSubAgent('database-architect', sd_id),
  callSubAgent('qa-director', sd_id)
]);

// ❌ Sequential - One depends on another
const schema = await callSubAgent('database-architect', sd_id);
const securityReview = await callSubAgent('security-architect', schema); // Needs schema first
```

**Critical Constraints**:
- Each sub-agent receives the same initial context
- Sub-agents cannot see each other's results until all complete
- Aggregate results AFTER all sub-agents finish
- If any sub-agent fails, gracefully handle in aggregation phase

**Benefits**:
- Reduces total verification time (4 sub-agents in 30s vs. 2min sequential)
- No context sharing limitations since assessments are independent
- Each specialist works from fresh context without bias from others

## TODO Comment Standard

## TODO Comment Standard (When Deferring Work)

**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.

### Standard TODO Format

```typescript
// TODO (SD-ID): Action required
// Requires: Dependencies, prerequisites
// Estimated effort: X-Y hours
// Current state: Mock/temporary/placeholder
```

**Success Pattern** (SD-UAT-003):
> "Comprehensive TODO comments provided clear future work path. Saved 4-6 hours."

## EXEC Dual Test Requirement

## EXEC Dual Test Requirement


### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:unit
```
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:e2e
```
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: `npm run test:unit`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: `npm run test:e2e`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff
- [ ] Screenshots captured for E2E test evidence
- [ ] Test results included in handoff "Deliverables Manifest"

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Common Mistakes** (from SD-EXPORT-001):
- ❌ "Tests exist" ≠ "Tests passed"
- ❌ Running only E2E tests and claiming "all tests passed"
- ❌ Marking SD complete before running any tests
- ❌ Creating handoff without test evidence documentation
- ✅ Run BOTH unit AND E2E tests explicitly
- ✅ Document pass/fail counts in handoff
- ✅ Include screenshots for visual evidence

### Why This Matters
- **SD-EXPORT-001**: 30-minute gap between marking "complete" and discovering tests weren't run
- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed
- **Impact**: Testing enforcement prevents claiming "done" without proof

## Testing Tier Strategy (Updated)


## Testing Requirements - Dual Test Execution (UPDATED)

**Philosophy**: Comprehensive testing = Unit tests (logic) + E2E tests (user experience)

### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: BOTH unit tests AND E2E tests must pass
- **Commands**:
  - Unit: `npm run test:unit` (Vitest - business logic)
  - E2E: `npm run test:e2e` (Playwright - user flows)
- **Approval**: **BOTH test types REQUIRED for PLAN→LEAD approval**
- **Execution Time**: Combined <5 minutes for smoke-level tests
- **Coverage**:
  - Unit: Service layer, business logic, utilities
  - E2E: Critical user paths, authentication, navigation

### Tier 2: Comprehensive Testing (RECOMMENDED) 📋
- **Requirement**: Full test suite with deep coverage
- **Commands**:
  - Unit: `npm run test:unit:coverage` (50%+ coverage target)
  - E2E: All Playwright tests (30-50 scenarios)
  - Integration: `npm run test:integration`
  - A11y: `npm run test:a11y`
- **Approval**: Nice to have, **NOT blocking** but highly recommended
- **Timing**: Can be refined post-deployment

### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Visual regression testing
- **Complex flows**: Multi-step wizards, payment flows
- **Edge cases**: Rare scenarios not covered by automation

### ⚠️ What Changed (From Protocol Enhancement)
**Before**: "Tier 1 = 3-5 tests, <60s" (ambiguous - which tests?)
**After**: "Tier 1 = Unit tests + E2E tests (explicit frameworks, explicit commands)"

**Lesson Learned**: SD-AGENT-ADMIN-002 testing oversight (ran E2E only, missed unit test failures)


## Playwright MCP Integration

## 🎭 Playwright MCP Integration

**Status**: ✅ READY (Installed 2025-10-12)

### Overview
Playwright MCP (Model Context Protocol) provides browser automation capabilities for testing, scraping, and UI verification.

### Installed Components
- **Chrome**: Google Chrome browser for MCP operations
- **Chromium**: Chromium 141.0.7390.37 (build 1194) for standard Playwright tests
- **Chromium Headless Shell**: Headless browser for CI/CD pipelines
- **System Dependencies**: All required Linux libraries installed

### Available MCP Tools

#### Navigation
- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_navigate_back` - Go back to previous page

#### Interaction
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_fill` - Fill form fields
- `mcp__playwright__browser_select` - Select dropdown options
- `mcp__playwright__browser_hover` - Hover over elements
- `mcp__playwright__browser_type` - Type text into elements

#### Verification
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshot
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Execute JavaScript

#### Management
- `mcp__playwright__browser_close` - Close browser
- `mcp__playwright__browser_tabs` - Manage tabs

### Testing Integration

**When to Use Playwright MCP**:
1. ✅ Visual regression testing
2. ✅ UI component verification
3. ✅ Screenshot capture for evidence
4. ✅ Accessibility tree validation
5. ✅ Cross-browser testing

**When to Use Standard Playwright**:
1. ✅ E2E test suites (`npm run test:e2e`)
2. ✅ CI/CD pipeline tests
3. ✅ Automated test runs
4. ✅ User story validation

### Usage Example

```javascript
// Using Playwright MCP for visual verification
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/dashboard' });
await mcp__playwright__browser_snapshot(); // Get accessibility tree
await mcp__playwright__browser_take_screenshot({ name: 'dashboard-state' });
await mcp__playwright__browser_click({ element: 'Submit button', ref: 'e5' });
```

### QA Director Integration

The QA Engineering Director sub-agent now has access to:
- Playwright MCP for visual testing
- Standard Playwright for E2E automation
- Both Chrome (MCP) and Chromium (tests) browsers

**Complete Guide**: See `docs/reference/playwright-mcp-guide.md`

## Edge Case Testing Checklist

## Edge Case Testing Checklist

When implementing tests, ensure coverage for:

### Input Validation Edge Cases
- [ ] Empty strings, null values, undefined
- [ ] Maximum length inputs (overflow testing)
- [ ] Special characters (SQL injection, XSS vectors)
- [ ] Unicode and emoji inputs
- [ ] Whitespace-only inputs

### Boundary Conditions
- [ ] Zero, negative, and maximum numeric values
- [ ] Array min/max lengths (empty, single item, very large)
- [ ] Date boundaries (leap years, timezone edge cases)

### Concurrent Operations
- [ ] Race conditions (simultaneous updates)
- [ ] Database transaction rollbacks
- [ ] Cache invalidation timing

### Error Scenarios
- [ ] Network failures (timeout, disconnect)
- [ ] Database connection errors
- [ ] Invalid authentication tokens
- [ ] Permission denied scenarios

### State Transitions
- [ ] Idempotency (repeated operations)
- [ ] State rollback on error
- [ ] Partial success scenarios

---

*Generated from database: leo_protocol_sections*
*Context tiers: CORE + PHASE_EXEC*
*Protocol: v4.2.0_story_gates*
