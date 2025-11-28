# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2025-11-28 3:35:41 PM
**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

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

## 🚀 Session Verification & Quick Start (MANDATORY)

**Anti-Hallucination Protocol**: Never trust session summaries for database state. ALWAYS verify, then act.

---

### STEP 1: Verify SD State

```sql
-- Find SD and determine current state
SELECT id, title, status, current_phase, sd_type, progress
FROM strategic_directives_v2
WHERE id = 'SD-XXX' OR title ILIKE '%keyword%';

-- Check for PRD
SELECT id, status, progress FROM product_requirements_v2 WHERE sd_id = 'SD-XXX';

-- Check for user stories
SELECT COUNT(*) FROM user_stories WHERE sd_id = 'SD-XXX';
```

**Document**: "Verified SD [title] exists, status=[X], phase=[Y], PRD=[exists/missing]"

---

### STEP 2: Quick Start Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEO PROTOCOL QUICK START                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
               What did verification find?
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ No SD    │        │ SD in    │        │ SD in    │
    │ Found    │        │ LEAD     │        │ PLAN/EXEC│
    └──────────┘        └──────────┘        └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   Create SD first      See LEAD Flow      See PLAN/EXEC Flow
```

---

### LEAD Phase Flow (current_phase = 'LEAD')

```
1. Run: npm run prio:top3          # Is this work justified?
   ├── SD in top 3? → Proceed
   └── Not in top 3? → Consider deferring or /quick-fix

2. Read CLAUDE_LEAD.md             # Strategic validation

3. SD Type determines validation:
   ├── feature        → Full (TESTING, SECURITY, DESIGN, DATABASE)
   ├── infrastructure → Reduced (DOCMON, STORIES, GITHUB)
   ├── database       → Full + DATABASE sub-agent required
   ├── security       → Full + SECURITY sub-agent required
   └── documentation  → Minimal (DOCMON, STORIES only)

4. Create PRD:
   node scripts/add-prd-to-database.js SD-XXX "Title"

   This auto-triggers:
   ✓ PRD record creation
   ✓ STORIES sub-agent
   ✓ sd_type detection
   ✓ Component recommendations
```

---

### PLAN Phase Flow (current_phase = 'PLAN')

```
Check PRD & Stories:
├── No PRD? → Create PRD first (see LEAD flow)
├── PRD exists, no stories? → STORIES sub-agent runs auto, or create manually
└── PRD + Stories exist? → READY FOR EXEC!

Ready for EXEC means:
1. Navigate to /mnt/c/_EHG/ehg/    # Implementation target
2. Read PRD requirements
3. Implement features
4. Write tests as you go
5. Commit with SD-ID
```

---

### EXEC Phase Flow (current_phase = 'EXEC')

```
JUST IMPLEMENT!

1. cd /mnt/c/_EHG/ehg/             # Navigate to impl target
2. Read PRD & reference docs        # Understand requirements
3. Write code                       # THE ACTUAL WORK
4. npm run test:unit                # Unit tests
5. npm run test:e2e                 # E2E tests (MANDATORY)
6. git commit -m "SD-XXX: ..."      # Track the change

After implementation complete:
node scripts/unified-handoff-system.js --type EXEC-TO-PLAN --sd SD-XXX
```

---

### Scripts Reference

**Run Directly (CLI):**
- `node scripts/add-prd-to-database.js SD-XXX "Title"` → Creates PRD
- `node scripts/unified-handoff-system.js --type X --sd Y` → Handoffs
- `npm run prio:top3` → Priority ranking
- `npm run leo:generate` → Regenerate CLAUDE files
- `npm run test:unit / test:e2e` → Tests

**DO NOT Run Directly (Libraries):**
- `lib/sub-agent-executor.js` → Library, not CLI
- `scripts/phase-preflight.js` → May fail with UUID mismatch

**Runs Automatically:**
- Sub-agents → Triggered by PRD creation and handoffs
- Validation gates → Triggered by unified-handoff-system.js

---

### Fast-Track Rules

| Situation | Skip | Keep |
|-----------|------|------|
| PRD exists with clear requirements | Sub-agent enrichment | Implement + Test |
| Reference doc exists (e.g., UI Report) | PRD rewrite | Read & implement |
| Small fix (<50 LOC) | Full SD workflow | Use /quick-fix |
| EXEC phase already | LEAD/PLAN re-validation | Just implement |

---

### Minimum Viable Workflow

```
1. npm run prio:top3                    # Confirm priority
2. Query SD: status, phase, PRD         # Know starting point
3. If no PRD: add-prd-to-database.js    # Create PRD
4. cd /mnt/c/_EHG/ehg                   # Navigate to impl target
5. IMPLEMENT THE FEATURE                # THE ACTUAL WORK
6. npm run test:unit && test:e2e        # Verify it works
7. git commit with SD-ID                # Track the change
8. Create handoff (if phase complete)   # Document completion
```

**The goal is IMPLEMENTATION, not PROCESS COMPLIANCE.**

---

### Why This Matters
- Session summaries describe *context*, not *state*
- AI can hallucinate successful database operations
- Database is the ONLY source of truth
- Clear next-step guidance prevents process confusion

**Pattern Reference**: PAT-SESS-VER-001, PAT-QUICK-START-001

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

## Database-First Enforcement - Expanded

**Database-First Enforcement (MANDATORY)**:

**❌ NEVER create**: Strategic Directive files, PRD files, Retrospective files, Handoff documents, Verification reports

**✅ REQUIRED**: All data in database tables only
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Retrospectives → `retrospectives`
- Handoffs → `sd_phase_handoffs`

**Why**: Single source of truth, real-time updates, automated tracking, no file sync issues

**Verification**: `find . -name "SD-*.md" -o -name "PRD-*.md"` should return ONLY legacy files

## 🗄️ Supabase Database Operations

### Connection Details
- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Connection**: Via Supabase client using environment variables

### Environment Variables Required
```bash
# For EHG application (liapbndqlqxdcgpwntbv)
EHG_SUPABASE_URL=https://liapbndqlqxdcgpwntbv.supabase.co
EHG_SUPABASE_ANON_KEY=[anon-key]
EHG_POOLER_URL=postgresql://postgres.liapbndqlqxdcgpwntbv:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require

# For EHG_Engineer (dedlbzhpgkmetvhbkyzq)
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=[anon-key]
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_DB_PASSWORD=Fl!M32DaM00n!1
```

## 🔧 CRITICAL DEVELOPMENT WORKFLOW

**Development Workflow**: MANDATORY server restart after ANY changes

**Steps**: Kill server → Build client (`npm run build:client`) → Restart server → Hard refresh browser
**Why**: No hot-reloading configured, dist/ serves compiled files
**Commands**: `pkill -f "node server.js" && npm run build:client && PORT=3000 node server.js`

**Complete Guide**: See `docs/reference/development-workflow.md`

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


## 🔥 Hot Issue Patterns (Auto-Updated)

**CRITICAL**: These are active patterns detected from retrospectives. Review before starting work.

| Pattern ID | Category | Severity | Count | Trend | Top Solution |
|------------|----------|----------|-------|-------|--------------|
| PAT-003 | security | 🟠 high | 3 | 📉 | Add auth.uid() check to RLS policy USING |
| PAT-AUTH-PW-001 | testing | 🟠 high | 2 | ➡️ | Use Supabase Admin API with service_role |
| PAT-008 | deployment | 🟠 high | 2 | ➡️ | Check GitHub Actions secrets and package |
| PAT-E2E-UI-001 | testing | 🟠 high | 1 | ➡️ | Verify UI exists before writing E2E test |
| PAT-INTEG-GAP-001 | implementation | 🟠 high | 1 | ➡️ | Verify end-to-end flow manually before c |

### Prevention Checklists

**security**:
- [ ] Verify RLS policies include auth.uid() checks
- [ ] Test with authenticated user context
- [ ] Check policy applies to correct operations

**testing**:
- [ ] Store service_role key in .env file for programmatic user management
- [ ] Add verify-test-user.cjs script to test suite for authentication validation
- [ ] Run authentication verification BEFORE running E2E tests

**deployment**:
- [ ] Verify all required secrets are set in GitHub
- [ ] Test locally with same Node version as CI
- [ ] Check package-lock.json is committed

**implementation**:
- [ ] Include UI verification checkpoint in EXEC phase
- [ ] Trace full stack before marking FR complete
- [ ] Manual smoke test before E2E automation


*Patterns auto-updated from `issue_patterns` table. Use `npm run pattern:resolve PAT-XXX` to mark resolved.*


## 📝 Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

### 1. Critical Test Coverage Investment - Comprehensive Retrospective ⭐
**Category**: TESTING_STRATEGY | **Date**: 11/15/2025 | **Score**: 100

**Key Improvements**:
- Initial schema validation - should consult database-agent earlier
- Test data setup required manual fixes despite testing-agent generation

**Action Items**:
- [ ] Create /docs/reference/database-constraints-testing.md with all constraint patte...
- [ ] Update testing-agent prompts to include database constraint patterns

### 2. Playwright Authentication Troubleshooting - Password Reset Solution ⭐
**Category**: APPLICATION_ISSUE | **Date**: 11/19/2025 | **Score**: 100

**Key Improvements**:
- Initial confusion about which service_role key to use (EHG vs EHG_Engineer)
- Multiple attempts with invalid service_role key before getting correct one

**Action Items**:
- [ ] Add reset-password.cjs script to EHG repository for future use
- [ ] Document Supabase Admin API authentication troubleshooting in testing guide

### 3. SD-VENTURE-UNIFICATION-001 Phase 3 (EXEC) - Comprehensive Implementation Retrospective ⭐
**Category**: PROCESS_IMPROVEMENT | **Date**: 11/3/2025 | **Score**: 100

**Key Improvements**:
- Manual test creation wasted 2-3 hours instead of delegating to testing-agent (LEO v4.3.0 gap)
- Zero consultation of retrospectives before implementation (research_confidence_score = 0.00)

**Action Items**:
- [ ] MANDATE testing-agent delegation for all test creation tasks (saves 2-3 hours pe...
- [ ] Add automated-knowledge-retrieval.js to EXEC pre-flight checklist (v4.3.0 compli...

### 4. SD-STAGE4-AI-FIRST-UX-001 Comprehensive Retrospective ⭐
**Category**: APPLICATION_ISSUE | **Date**: 11/15/2025 | **Score**: 100

**Key Improvements**:
- Unit test timeouts: 11/18 tests timing out (vitest async)
- E2E test infrastructure: 28/32 failures (mock API config)

**Action Items**:
- [ ] Create SD-TESTING-INFRASTRUCTURE-FIX-001 for unit test timeout resolution
- [ ] Fix E2E mock API configuration (28/32 test failures)

### 5. SD-RECURSION-AI-001: Recursive Stage Refinement & LLM Intelligence Integration ⭐
**Category**: PROCESS_IMPROVEMENT | **Date**: 11/4/2025 | **Score**: 90

**Key Improvements**:
- Test health visibility before starting
- ESLint baseline establishment

**Action Items**:
- [ ] Add pre-SD test health check to PLAN phase
- [ ] Create ESLint baseline snapshot tool


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

| Sub-Agent | Trigger Keywords | Priority | Description |
|-----------|------------------|----------|-------------|
| Information Architecture Lead | LEAD_SD_CREATION, LEAD_HANDOFF_CREATION, | 95 | ## Information Architecture Lead v3.0.0 - Database-First Enf... |
| Quick-Fix Orchestrator ("LEO Lite" Field Medic) | N/A | 95 | Lightweight triage and resolution for small UAT-discovered i... |
| Root Cause Analysis Agent | sub_agent_blocked, ci_pipeline_failure,  | 95 | Forensic intelligence agent for defect triage, root cause de... |
| UAT Test Executor | uat test, execute test, run uat, test ex | 90 | Interactive UAT test execution guide for manual testing work... |
| DevOps Platform Architect | EXEC_IMPLEMENTATION_COMPLETE, create pul | 90 | # DevOps Platform Architect Sub-Agent

**Identity**: You are... |
| Continuous Improvement Coach | LEAD_APPROVAL_COMPLETE, LEAD_REJECTION,  | 85 | ## Continuous Improvement Coach v4.0.0 - Quality-First Editi... |
| API Architecture Sub-Agent | API, REST, RESTful, GraphQL, endpoint, r | 75 | ## API Sub-Agent v1.0.0

**Mission**: REST/GraphQL endpoint ... |
| Senior Design Sub-Agent | component, visual, design system, stylin | 70 | ## Senior Design Sub-Agent v6.0.0 - Lessons Learned Edition
... |
| Dependency Management Sub-Agent | dependency, dependencies, npm, yarn, pnp | 70 | # Dependency Management Specialist Sub-Agent

**Identity**: ... |
| User Story Context Engineering Sub-Agent | user story, user stories, acceptance cri | 50 | ## User Story Context Engineering v2.0.0 - Lessons Learned E... |
| Risk Assessment Sub-Agent | high risk, complex, refactor, migration, | 8 | ## Risk Assessment Sub-Agent v1.0.0

**BMAD Enhancement**: M... |
| Chief Security Architect | authentication, security, security auth  | 7 | Former NSA security architect with 25 years experience secur... |
| Principal Database Architect | schema, migration, EXEC_IMPLEMENTATION_C | 6 | ## Principal Database Architect v2.0.0 - Lessons Learned Edi... |
| QA Engineering Director | coverage, protected route, build error,  | 5 | ## Enhanced QA Engineering Director v2.4.0 - Retrospective-I... |
| Performance Engineering Lead | optimization | 4 | Performance engineering lead with 20+ years optimizing high-... |
| Principal Systems Analyst | existing implementation, duplicate, conf | N/A | ## Principal Systems Analyst v3.0.0 - Retrospective-Informed... |

**Note**: Sub-agent results MUST be persisted to `sub_agent_execution_results` table.


---

*Generated from database: 2025-11-28*
*Protocol Version: 4.3.3*
*Includes: Hot Patterns (5) + Recent Lessons (5)*
*Load this file first in all sessions*
