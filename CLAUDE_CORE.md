# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2025-11-27 7:28:24 AM
**Protocol**: LEO 4.3.1
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
| Chief Security Architect | authentication, security | 7 | Former NSA security architect with 25 years experience secur... |
| Principal Database Architect | schema, migration, EXEC_IMPLEMENTATION_C | 6 | ## Principal Database Architect v2.0.0 - Lessons Learned Edi... |
| QA Engineering Director | coverage, protected route, build error,  | 5 | ## Enhanced QA Engineering Director v2.4.0 - Retrospective-I... |
| Performance Engineering Lead | optimization | 4 | Performance engineering lead with 20+ years optimizing high-... |
| Principal Systems Analyst | existing implementation, duplicate, conf | N/A | ## Principal Systems Analyst v3.0.0 - Retrospective-Informed... |

**Note**: Sub-agent results MUST be persisted to `sub_agent_execution_results` table.


---

*Generated from database: 2025-11-27*
*Protocol Version: 4.3.1*
*Load this file first in all sessions*
