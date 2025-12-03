# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: 2025-12-02 7:29:22 PM
**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

## 🏗️ Application Architecture - CRITICAL CONTEXT

### Two Distinct Applications (CONSOLIDATED DATABASE):
1. **EHG_Engineer** (Management Dashboard) - WHERE YOU ARE NOW
   - **Path**: `/mnt/c/_EHG/EHG_Engineer/`
   - **Purpose**: LEO Protocol dashboard for managing Strategic Directives & PRDs
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED
   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
   - **Port**: 3000-3001
   - **Role**: MANAGEMENT TOOL ONLY - no customer features here!

2. **EHG** (Business Application) - IMPLEMENTATION TARGET
   - **Path**: `/mnt/c/_EHG/ehg/`
   - **Purpose**: The actual customer-facing business application
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED (SD-ARCH-EHG-006)
   - **GitHub**: https://github.com/rickfelix/ehg.git
   - **Built with**: Vite + React + Shadcn + TypeScript
   - **Role**: WHERE ALL FEATURES GET IMPLEMENTED

> **NOTE (SD-ARCH-EHG-006)**: As of 2025-11-30, both applications use the **CONSOLIDATED** database (dedlbzhpgkmetvhbkyzq). The old EHG database (liapbndqlqxdcgpwntbv) has been deprecated.

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
| **UI Feature** | frontend-design → component-architecture → state-management → error-handling → accessibility-guide |
| **Database** | schema-design → migration-safety → rls-patterns → supabase-patterns → database-maintenance |
| **API** | rest-api-design → api-error-handling → input-validation |
| **Testing** | baseline-testing → e2e-ui-verification → e2e-patterns → test-selectors → playwright-auth |

### Available Skill Categories
| Category | Skills | Invoke When |
|----------|--------|-------------|
| Design | frontend-design, component-architecture, accessibility-guide, design-system, ux-workflows, ui-testing | Creating UI components |
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
| DESIGN | frontend-design, component-architecture, accessibility-guide, design-system, ux-workflows, ui-testing | UI/UX patterns |
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

## 🔒 Session Boundaries (MANDATORY)

### Multi-Instance Safety
When multiple Claude Code instances run simultaneously, use the branch lock mechanism:
```bash
# At session start
node scripts/claude-session-lock.mjs acquire SD-XXX-YYY-001

# At session end
node scripts/claude-session-lock.mjs release

# Check status
node scripts/claude-session-lock.mjs status
```

**Rule**: Each Claude instance MUST work on a **different branch**. Never have two instances on the same branch.

### Session Start Checklist
- [ ] `git status` - Check for uncommitted work from previous session
- [ ] If > 10 untracked files → Address BEFORE new work
- [ ] Acquire branch lock: `node scripts/claude-session-lock.mjs acquire SD-ID`
- [ ] Verify on correct branch for intended work

### Session End Checklist
- [ ] All changes committed OR explicitly documented as WIP
- [ ] No temporary scripts remaining (`tmp-*.mjs`)
- [ ] Handoff created if work incomplete
- [ ] Release branch lock: `node scripts/claude-session-lock.mjs release`
- [ ] `git status` shows clean tree OR documented reason

### Commit Frequency Triggers
1. **File Count**: If untracked files > 10 → Commit NOW
2. **Time**: Every 30 minutes of active work → Checkpoint commit
3. **Phase Boundary**: Before any handoff → Commit all work
4. **Script Creation**: After testing any new utility script → Commit

**Pattern Reference**: PAT-BRANCH-HYGIENE-001

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

### Connection Details (CONSOLIDATED DATABASE)

> **NOTE (SD-ARCH-EHG-006)**: As of 2025-11-30, both EHG and EHG_Engineer use the **CONSOLIDATED** database.

- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Connection**: Via Supabase client using environment variables

### Environment Variables Required
```bash
# CONSOLIDATED Database (used by both EHG and EHG_Engineer)
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres

# EHG Application vars (same consolidated database)
EHG_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
EHG_SUPABASE_ANON_KEY=[anon-key]
EHG_SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
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

### 5. SD-ARCH-EHG-003: Stage Data Contracts & LEO Supervision Policies ⭐
**Category**: DATABASE_SCHEMA | **Date**: 11/30/2025 | **Score**: 92

**Key Improvements**:
- SECURITY sub-agent score was 62% (conditional) - could have addressed earlier
- Could have added audit triggers (recommended but not blocking)

**Action Items**:
- [ ] Monitor GIN index usage
- [ ] Consider audit triggers


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

*Generated from database: 2025-12-02*
*Protocol Version: 4.3.3*
*Includes: Hot Patterns (5) + Recent Lessons (5)*
*Load this file first in all sessions*
