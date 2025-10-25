# CLAUDE_LEAD.md - LEO Protocol LEAD Phase Context

**Generated**: 2025-10-25 2:16:13 PM
**Protocol**: LEO vv4.2.0_story_gates
**Purpose**: LEAD phase operations + core context

---

## 📋 What's Included

This file contains:
1. **Core Context** (9 sections) - Essential for all sessions
2. **LEAD Phase Context** (9 sections) - Phase-specific operations

**Total Size**: ~57k chars

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

## Knowledge Retrieval Commands

## 🔍 Knowledge Retrieval (Proactive Learning)

**SD-LEO-LEARN-001: Added 2025-10-25**

```bash
# Before starting any phase (MANDATORY for EXEC/PLAN, RECOMMENDED for LEAD)
node scripts/phase-preflight.js --phase <LEAD|PLAN|EXEC> --sd-id <UUID>

# Search for specific issues
node scripts/search-prior-issues.js "<issue description>"

# Generate fresh knowledge summaries (weekly)
node scripts/generate-knowledge-summary.js --category <category>
node scripts/generate-knowledge-summary.js --category all

# View existing summaries
ls docs/summaries/lessons/*.md
cat docs/summaries/lessons/database-lessons.md
```

**Philosophy**: Consult lessons BEFORE encountering issues, not after.


---

# LEAD PHASE CONTEXT

## 🎯 LEAD Agent Operations

**LEAD Agent Operations**: Strategic planning, business objectives, final approval.

**Finding Active SDs**: `node scripts/query-active-sds.js` or query `strategic_directives_v2` table directly

**Decision Matrix**:
- Draft → Review & approve
- Pending Approval → Final review  
- Active → Create LEAD→PLAN handoff
- In Progress → Monitor execution

**Key Responsibilities**: Strategic direction, priority setting (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49), handoff creation, progress monitoring

**Complete Guide**: See `docs/reference/lead-operations.md`

## 📋 Directive Submission Review Process

**Directive Submission Review**: Review submissions before creating SDs.

**Quick Review**:
```bash
node scripts/lead-review-submissions.js
```

**Review Checklist**:
- Chairman input (original intent)
- Intent clarity & strategic alignment
- Priority assessment & scope validation
- Duplicate check & gate progression

**Decision Matrix**:
- Completed + No SD → Create SD
- Completed + SD exists → Verify & handoff
- Pending → Monitor
- Failed → Archive/remediate

**Complete Process**: See `docs/reference/directive-submission-review.md`

## Stubbed/Mocked Code Detection


**CRITICAL: Stubbed/Mocked Code Detection** (MANDATORY):

Before PLAN→LEAD handoff, MUST verify NO stubbed/mocked code in production files:

**Check For** (BLOCKING if found):
```bash
# 1. TEST_MODE flags in production code
grep -r "TEST_MODE.*true\|NODE_ENV.*test" lib/ src/ --exclude-dir=test

# 2. Mock/stub patterns
grep -r "MOCK:\|STUB:\|TODO:\|PLACEHOLDER:\|DUMMY:" lib/ src/ --exclude-dir=test

# 3. Commented-out implementations
grep -r "// REAL IMPLEMENTATION\|// TODO: Implement" lib/ src/ --exclude-dir=test

# 4. Mock return values without logic
grep -r "return.*mock.*result\|return.*dummy" lib/ src/ --exclude-dir=test
```

**Acceptable Patterns** ✅:
- `TEST_MODE` in test files (`tests/`, `*.test.js`, `*.spec.js`)
- TODO comments with SD references for future work: `// TODO (SD-XXX): Implement caching`
- Feature flags with proper configuration: `if (config.enableFeature)`

**BLOCKING Patterns** ❌:
- `const TEST_MODE = process.env.TEST_MODE === 'true'` in production code
- `return { verdict: 'PASS' }` without actual logic
- `console.log('MOCK: Using dummy data')`
- Empty function bodies: `function execute() { /* TODO */ }`
- Commented-out real implementations

**Verification Script**:
```bash
# Create verification script
node scripts/detect-stubbed-code.js <SD-ID>
```

**Manual Code Review**:
- Read all modified files from git diff
- Verify implementations are complete
- Check for placeholder comments
- Validate TEST_MODE usage is test-only

**Exit Requirement**: Zero stubbed code in production files, OR documented in "Known Issues" with follow-up SD created.


## LEAD Over-Engineering Evaluation Process

### 🛡️ LEAD Over-Engineering Evaluation Process

**MANDATORY**: LEAD agents MUST use the standardized rubric before making any SD status/priority changes.

#### Step-by-Step Evaluation Process

1. **Execute Rubric Evaluation**:
   ```bash
   node scripts/lead-over-engineering-rubric.js --sd-id [SD_ID]
   ```

2. **Review 6-Dimension Scores** (1-5 scale each):
   - **Technical Complexity vs Business Value**: Complexity-to-value ratio
   - **Resource Intensity vs Urgency**: Development effort vs business urgency  
   - **Strategic Priority Alignment**: Alignment with Stage 1/EVA/GTM priorities
   - **Market Timing & Opportunity Window**: Market opportunity timing
   - **Implementation & Business Risk**: Risk vs reward assessment
   - **Return on Investment Projection**: Expected ROI evaluation

3. **Check Over-Engineering Thresholds**:
   - Total Score ≤15/30 = Over-engineered
   - Complexity ≤2 = Problematic
   - Strategic Alignment ≤2 = Concerning  
   - Risk Assessment ≤2 = Dangerous

4. **Present Findings to Human**:
   ```bash
   node scripts/lead-human-approval-system.js --sd-id [SD_ID] --evaluation [RESULTS]
   ```

5. **Request Explicit Approval**: Show scores, reasoning, and consequences

6. **Execute Only After Approval**: NEVER make autonomous changes

#### Available Scripts for LEAD Agents
- `scripts/lead-over-engineering-rubric.js` - Standardized 6-dimension evaluation
- `scripts/lead-human-approval-system.js` - Human approval workflow
- `scripts/enhanced-priority-rubric.js` - Priority rebalancing tools

#### Prohibited Actions
- ❌ Autonomous SD status/priority changes  
- ❌ Overriding user selections without permission
- ❌ Subjective over-engineering calls without rubric
- ❌ Making changes before human approval

## 6-Step SD Evaluation Checklist

**6-Step SD Evaluation Checklist (MANDATORY for LEAD & PLAN)**:

1. Query `strategic_directives_v2` for SD metadata
2. Query `product_requirements_v2` for existing PRD
3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL
4. Search codebase for existing infrastructure
5. Identify gaps between backlog requirements and existing code
6. **Execute QA smoke tests** ← NEW (verify tests run before approval)

**Backlog Review Requirements**: Review backlog_title, item_description, extras.Description_1 for each item

**Complete Checklist**: See `docs/reference/sd-evaluation-checklist.md`

## Quality Validation Examples

## Quality Validation Examples

**Evidence from Retrospectives**: Thorough validation saves 4-6 hours per SD by catching issues early.

### LEAD Pre-Approval Validation Examples

#### Example 1: Verify Claims Against Reality

**Case** (SD-UAT-002): Code review revealed 3/5 claimed issues didn't exist → saved 3-4 hours of unnecessary work

**Lesson**: Always verify claims with actual code inspection, don't trust assumptions

#### Example 2: Leverage Existing Infrastructure

**Case** (SD-UAT-020): Used existing Supabase Auth instead of custom solution → saved 8-10 hours

**Lesson**: Check what already exists before approving new development

#### Example 3: Document Blockers Instead of Building Around Them

**Case** (SD-UAT-003): Database blocker identified early → documented constraint instead of workaround → saved 4-6 hours

**Lesson**: Identify true blockers during approval phase, not during implementation

#### Example 4: Question Necessity vs. Nicety

**Lesson**: Distinguish between "must have" (core requirements) and "nice to have" (future enhancements) during validation

### Quality Gate Benefits

Thorough LEAD pre-approval validation:
- Catches false assumptions early
- Identifies existing solutions
- Documents blockers before implementation starts
- Ensures resource allocation matches real requirements

**Total Time Saved from Examples**: 15-20 hours across validated SDs


## LEAD Code Review for UI/UX SDs

## LEAD Code Review Requirement (For UI/UX SDs)

**Evidence from Retrospectives**: Critical pattern from SD-UAT-002 saved hours.

### When Code Review is MANDATORY

**For SDs claiming** UI/UX issues or improvements.

### Why Code Review First?

**Success Story** (SD-UAT-002):
> "LEAD challenged 5 claimed issues, validated only 2. Saved 3-4 hours of unnecessary work."

### Process:
1. Receive SD with UI/UX claims
2. Read actual source code (don't trust claims)
3. Verify each claim against implementation
4. Reject false claims, document findings
5. Update SD scope and priority

## 📖 Historical Context Review (RECOMMENDED)

**SD-LEO-LEARN-001: Proactive Learning Integration**

**RECOMMENDED**: Run BEFORE approving SD to review historical context.

## Step 0: Historical Context Check

**Run this command before SD approval**:

```bash
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>
```

## What This Does

Queries historical knowledge base for:
- **Over-engineering patterns** in this SD category
- **Similar past SDs** and their outcomes
- **Complexity indicators** (actual vs estimated time)
- **Scope creep history** (SDs split due to bloat)

## Red Flags to Watch For

### Over-Engineering Indicators
- Pattern shows "over-engineering" occurred 2+ times in this category
- Historical resolution time >5x original estimate
- Past SDs in category were split due to scope bloat
- Complexity score disproportionate to business value

### Strategic Concerns
- Similar SDs had high failure/rework rates
- Category has pattern of expanding beyond initial scope
- Technical approach more complex than necessary
- Dependencies create cascading risks

## How to Use Results

### If Red Flags Found
1. Apply simplicity-first lens more rigorously
2. Challenge technical complexity in strategic validation
3. Request PLAN to simplify approach before approval
4. Consider phased delivery (MVP first, enhancements later)

### Document in Approval
Add to approval notes:

```markdown
## Historical Context Reviewed

Consulted 3 prior retrospectives in [category]:
- SD-SIMILAR-001: Over-engineered auth (8 weeks → 3 weeks after simplification)
- SD-SIMILAR-002: Scope expanded 3x during implementation
- PAT-009: Premature abstraction in [category] (40% success rate)

**Decision**: Approved with simplicity constraints:
- MVP scope only (defer advanced features to Phase 2)
- Weekly complexity reviews during PLAN
- Hard cap: 400 LOC per component
```

### If No Red Flags
- Proceed with standard approval process
- Note historical consultation in approval
- Builds confidence in strategic decision

## Why This Matters

- **Prevents strategic mistakes**: Learn from past over-engineering
- **Informed decisions**: Data-driven approval vs intuition
- **Protects team time**: Avoid repeating known pitfalls
- **Builds pattern recognition**: Strategic lens improves over time

## Quick Reference

```bash
# Before SD approval (RECOMMENDED)
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>

# Review over-engineering patterns
node scripts/search-prior-issues.js --category over_engineering --list

# Check category history
node scripts/search-prior-issues.js "<SD category>" --retrospectives
```

**Time Investment**: 1-2 minutes
**Value**: Strategic foresight, prevents month-long mistakes

## 🛡️ LEAD Pre-Approval Strategic Validation Gate

## 🛡️ LEAD Pre-Approval Strategic Validation Gate

### MANDATORY Before Approving ANY Strategic Directive

LEAD MUST answer these questions BEFORE approval:

1. **Need Validation**: Is this solving a real user problem or perceived problem?
2. **Solution Assessment**: Does the proposed solution align with business objectives?
3. **Existing Tools**: Can we leverage existing tools/infrastructure instead of building new?
4. **Value Analysis**: Does the expected value justify the development effort?
5. **Feasibility Review**: Are there any technical or resource constraints that make this infeasible?
6. **Risk Assessment**: What are the key risks and how are they mitigated?

**Approval Criteria**:
- Real user/business problem identified
- Solution is technically feasible
- Resources are available or can be allocated
- Risks are acceptable and documented
- Expected value justifies effort

**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD commits to delivering the approved scope. LEAD may NOT:
- ❌ Re-evaluate "do we really need this?" during final approval
- ❌ Reduce scope after EXEC phase begins without critical justification
- ❌ Defer work unilaterally during verification
- ❌ Mark SD complete if PRD requirements not met

**Exception**: LEAD may adjust scope mid-execution ONLY if:
1. Critical technical blocker discovered (true impossibility, not difficulty)
2. External business priorities changed dramatically (documented)
3. Explicit human approval obtained
4. New SD created for all deferred work (no silent scope reduction)


---

*Generated from database: leo_protocol_sections*
*Context tiers: CORE + PHASE_LEAD*
*Protocol: v4.2.0_story_gates*
