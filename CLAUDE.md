# CLAUDE.md - LEO Protocol Workflow Guide for AI Agents



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

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2025-10-04 8:34:25 AM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: vv4.2.0_story_gates

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-2-0-story-gates
**Status**: ACTIVE
**Title**: LEO Protocol v4.2.0 - Story Gates & Automated Release Control

### 📅 Protocol Management

**Database-First Architecture**:
- Protocol stored in `leo_protocols` table
- Sub-agents in `leo_sub_agents` table  
- Handoffs in `leo_handoff_templates` table
- Single source of truth - no file conflicts

**To update protocol version**:
```sql
-- Only via database operations
UPDATE leo_protocols SET status = 'active' WHERE version = 'new_version';
UPDATE leo_protocols SET status = 'superseded' WHERE version != 'new_version';
```

## Agent Responsibilities


### Implementation Agent (EXEC)
- **Responsibilities**: Implementation based on PRD. **CRITICAL: Implementations happen in /mnt/c/_EHG/ehg/ (EHG app), NOT in EHG_Engineer!** Always cd to target app before coding. **SIMPLICITY IN EXECUTION**: Implement the simplest solution that meets requirements. Avoid over-engineering. Use proven patterns and existing libraries.
- **Planning**: 0%
- **Implementation**: 30%
- **Verification**: 0%
- **Approval**: 0%
- **Total**: 30%

### Strategic Leadership Agent (LEAD)
- **Responsibilities**: Strategic planning, business objectives, final approval. **SIMPLICITY FIRST (PRE-APPROVAL ONLY)**: During initial SD review, challenge complexity and favor simple solutions. Ask "What's the simplest solution?" and "Why not just configure existing tools?" Apply 80/20 rule BEFORE approval. Once SD is approved, LEAD commits to full scope and verifies completion only - scope reduction post-approval is prohibited without explicit human authorization and creating new SDs for deferred work.
- **🛡️ HUMAN APPROVAL REQUIRED**: LEAD MUST request human approval before changing SD status/priority. Use standardized over-engineering rubric for evaluations. NEVER override user selections without explicit permission.
- **📋 Over-Engineering Evaluation**: Use `scripts/lead-over-engineering-rubric.js` for standardized assessments. Present findings to human for approval before any changes.
- **🔍 MANDATORY BACKLOG REVIEW**: When evaluating any Strategic Directive, LEAD MUST query `sd_backlog_map` table to review all linked backlog items. This is step 3 of the 5-step SD evaluation checklist (see below). Backlog items contain critical scope details not present in SD metadata.
- **🚫 PROHIBITED**: Autonomous SD status changes, user selection overrides, subjective over-engineering calls without rubric, **skipping backlog review before scope decisions**. **🤖 MANDATORY SUB-AGENT AUTOMATION**: Before approving any SD as complete, LEAD MUST run automated sub-agent validation. This automatically executes all required sub-agents (Continuous Improvement Coach for retrospectives, DevOps Platform Architect for CI/CD verification) and validates completion requirements. Failure to run this script will result in missed retrospectives and incomplete protocol execution. **✅ APPROVAL CHECKLIST**: LEAD may only approve an SD after: (1) Running sub-agent validation successfully, (2) Verifying output shows "✅ SD READY FOR COMPLETION", (3) Reviewing any warnings, (4) Obtaining human approval for status change.

**5-STEP SD EVALUATION CHECKLIST** (Mandatory for LEAD):
1. Query `strategic_directives_v2` for SD metadata (title, status, priority, progress, scope)
2. Query `product_requirements_v2` for existing PRD (if any)
3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL: Contains detailed requirements
4. Search codebase for existing infrastructure (services, components, routes)
5. Identify gaps between backlog requirements and existing code

**Backlog Review Requirements**:
- Review `backlog_title`, `item_description`, `extras.Description_1` for each item
- Assess priority alignment: `priority` field (High/Medium/Low) vs `description_raw` (Must Have/Nice to Have)
- Check completion status: `completion_status` (NOT_STARTED/IN_PROGRESS/COMPLETED)
- Evaluate scope match between backlog items and existing codebase
- Flag scope mismatches for LEAD decision (implement backlog vs use existing code)
- **Planning**: 20%
- **Implementation**: 0%
- **Verification**: 0%
- **Approval**: 15%
- **Total**: 35%

### Technical Planning Agent (PLAN)
- **Responsibilities**: Technical design, PRD creation with comprehensive test plans, pre-automation validation, acceptance testing. **PRAGMATIC ENGINEERING**: Use boring technology that works reliably. Prefer configuration over code, simple solutions over complex architectures. Filter sub-agent recommendations through simplicity lens. **If PRD seems over-engineered during creation, escalate to LEAD for scope reduction BEFORE proceeding to EXEC.**
- **🔍 MANDATORY BACKLOG REVIEW**: When creating PRD, PLAN MUST query `sd_backlog_map` table to ensure all backlog items are addressed in the PRD. This is step 3 of the 5-step SD evaluation checklist. Backlog items define the actual requirements to be implemented.
- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents
- **🔍 CI/CD VERIFICATION**: After EXEC completion, wait 2-3 minutes for GitHub CI/CD pipelines to complete, then trigger DevOps Platform Architect to verify no pipeline failures exist before final approval.

**5-STEP SD EVALUATION CHECKLIST** (Mandatory for PLAN):
1. Query `strategic_directives_v2` for SD metadata
2. Query `product_requirements_v2` for existing PRD (if creating new PRD)
3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL: These define what to build
4. Search codebase for existing infrastructure
5. Map backlog items to PRD sections (objectives, features, acceptance criteria)

**Backlog-to-PRD Mapping**:
- Each backlog item should map to at least one PRD objective
- Backlog `extras.Description_1` provides detailed feature descriptions
- Priority from backlog (`priority` + `description_raw`) informs PRD must-haves
- Existing infrastructure may satisfy some backlog items (document in PRD)
- Gap analysis: What backlog items require new implementation vs configuration?
- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents
- **Planning**: 20%
- **Implementation**: 0%
- **Verification**: 15%
- **Approval**: 0%
- **Total**: 35%

## 🚨 EXEC Agent Implementation Requirements

### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **APPLICATION CHECK** ⚠️ CRITICAL FIRST STEP
   - Confirm target app: `/mnt/c/_EHG/ehg/` (NOT EHG_Engineer!)
   - Verify: `cd /mnt/c/_EHG/ehg && pwd` should show `/mnt/c/_EHG/ehg`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git`
   - If you're in EHG_Engineer, you're in the WRONG place for implementation!

1. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

2. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

3. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD
   - Document: "Application: [/path/to/app] on port [XXXX]"

4. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
```markdown
## EXEC Pre-Implementation Checklist
- [ ] URL verified: [exact URL from PRD]
- [ ] Page accessible: [YES/NO]
- [ ] Component identified: [path/to/component]
- [ ] Application path: [/full/path/to/app]
- [ ] Port confirmed: [port number]
- [ ] Screenshot taken: [timestamp]
- [ ] Target location confirmed: [where changes go]
```

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation

## 🚨 DATABASE-ONLY ENFORCEMENT

### ABSOLUTE PROHIBITION: No File Creation
LEO Protocol v4.1.2 is **DATABASE-FIRST ONLY**. **NEVER** create:
- ❌ PRD markdown files (`.md`)
- ❌ Handoff documents 
- ❌ Verification reports
- ❌ Any work-related documentation files

### REQUIRED: Database Operations Only
- ✅ PRDs: Use `scripts/add-prd-to-database.js`
- ✅ Handoffs: Store in handoff tracking tables
- ✅ Progress: Update database fields directly
- ✅ Verification: Store results in database
- ✅ Boundary Rules: See `docs/boundary-examples.md` (generate: `npm run docs:boundary`)
- ✅ Dependency Policy: New dependencies require rationale; policy warns on unknown, blocks denied (see `config/allowed-deps.json`)
- ✅ Session Starter: Copy `templates/session-prologue.md` at session start (generate: `npm run session:prologue`)
- ✅ Coverage Floor: 50% minimum (`coverage-grace` label allows 2 PRs bypass)
- ✅ Bundle Cap: 480KB absolute limit (delta: +50KB max vs main branch)

### If You Create Files By Mistake:
1. **STOP immediately**
2. Extract content to database
3. Delete the files
4. Update progress tracking
5. Verify dashboard shows correct status

## 🔄 Git Commit Guidelines

### Commit Format (MANDATORY)
All commits MUST follow Conventional Commits format with SD-ID:
```
<type>(<SD-ID>): <subject>

<body>

<footer>
```

### Required Elements
- **Type**: feat|fix|docs|style|refactor|test|chore|perf|ci|revert
- **Scope**: MUST include Strategic Directive ID (e.g., SD-2025-001)
- **Subject**: Imperative mood, no period, max 72 chars
- **Body**: Explain "why" not "what", wrap at 72 chars
- **Footer**: Breaking changes, co-authorship, AI attribution

### Commit Timing (During EXEC Phase)
1. **After completing each checklist item**
2. **Before context switches** (end of session, meetings, breaks)
3. **At logical breakpoints** (feature complete, tests passing)
4. **Frequency**: Min 1/session, Max 10/checklist item

### Branch Strategy by Application
- **EHG_Engineer changes** (dashboard/tooling): Use `eng/` prefix
  - Example: `eng/dashboard-update`, `eng/leo-protocol-v4`
- **EHG app features** (customer features): Use standard prefixes
  - Example: `feature/SD-2025-001-voice-api`, `fix/SD-2025-002-auth-bug`
- **CRITICAL**: Verify you're in the correct directory before branching!
  - `pwd` should show `/mnt/c/_EHG/ehg` for feature implementation
  - `pwd` should show `/mnt/c/_EHG/EHG_Engineer` for dashboard changes
- **Main branch**: NO direct commits during EXEC phase
- **Merges**: Only via approved Pull Requests after LEAD approval

### AI Attribution
When AI generates code, include in footer:
```bash
git commit -m "feat(SD-2025-001): Implement retry logic

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Quick Reference
- Format: `<type>(<SD-ID>): <subject>`
- Size: <100 lines ideal, <200 max
- Files: 1-3 ideal, 10 max per commit
- Validation: Commits without proper format fail CI

**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`



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

## Progress Calculation

```
Total = ${agents.map(a => `${a.agent_code}: ${a.total_percentage}%`).join(' + ')} = 100%
```

## 🎯 LEAD Agent Operations

### Finding Active Strategic Directives

As the LEAD agent, you have immediate access to strategic directives:

**Quick Command**:
```bash
node scripts/query-active-sds.js
```

**Direct Database Query**:
```javascript
const { data: activeSDs } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .in('status', ['draft', 'in_progress', 'active', 'pending_approval'])
  .order('priority', { ascending: false })
  .order('created_at', { ascending: false });
```

### LEAD Decision Matrix

| SD Status | LEAD Action | Command/Script |
|-----------|-------------|----------------|
| **Draft** | Review & approve | `node scripts/lead-approve-sdip.js` |
| **Pending Approval** | Final review | `node scripts/conduct-lead-approval-assessment.js` |
| **Active** | Create LEAD→PLAN handoff | `node scripts/create-exec-to-plan-handoff.js` |
| **In Progress** | Monitor execution | `node scripts/debug-dashboard-progress.js` |

### Key LEAD Responsibilities

1. **Strategic Direction**
   - Define business objectives
   - Set priorities (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49)
   - Approve strategic directives

2. **Handoff Creation**
   - LEAD→PLAN: Strategic objectives to technical planning
   - Must include all 7 mandatory elements
   - Use `node scripts/unified-handoff-system.js`

3. **Progress Monitoring**
   - Review SD progress: `node scripts/test-progress-calculation.js`
   - Check phase completion: `node scripts/complete-lead-phase.js`
   - Final approval: `node scripts/start-lead-approval.js`

### Strategic Directive Lifecycle

```mermaid
graph LR
    Draft --> LEAD_Review
    LEAD_Review --> Active
    Active --> LEAD_PLAN_Handoff
    LEAD_PLAN_Handoff --> In_Progress
    In_Progress --> Pending_Approval
    Pending_Approval --> LEAD_Final_Approval
    LEAD_Final_Approval --> Completed
```

### 📋 Directive Submission Review Process

**CRITICAL**: Directive submissions contain essential context not present in SDs. Always review linked submissions before making strategic decisions.

#### Step-by-Step Review Workflow

1. **Query Pending Submissions**:
```javascript
// Find submissions needing LEAD review
const { data: pendingSubmissions } = await supabase
  .from('directive_submissions')
  .select('*')
  .in('status', ['pending_review', 'completed'])
  .is('gate_status->resulting_sd_id', null)
  .order('created_at', { ascending: false });
```

2. **Get Full Submission Context**:
```javascript
// Retrieve submission with linked SD (if exists)
const { data: submission } = await supabase
  .from('directive_submissions')
  .select(\`
    *,
    linked_sd:strategic_directives_v2!gate_status->resulting_sd_id(*)
  \`)
  .eq('id', submission_id)
  .single();
```

3. **Review Checklist**:
- [ ] **Original Input**: Review chairman_input for true intent
- [ ] **Intent Clarity**: Verify intent_summary captures essence
- [ ] **Visual Context**: Check screenshot_url if provided
- [ ] **Strategic Alignment**: Assess fit with organizational goals
- [ ] **Priority Assessment**: Determine business impact (Critical/High/Medium/Low)
- [ ] **Scope Validation**: Ensure scope is achievable and clear
- [ ] **Duplicate Check**: Verify no existing SDs cover this need
- [ ] **Gate Progression**: Confirm all validation gates passed

4. **Decision Matrix**:

| Submission State | Gate Status | LEAD Action | Command |
|-----------------|-------------|-------------|---------|
| Completed + No SD | Gates passed | Create SD | `node scripts/create-sd-from-submission.js` |
| Completed + SD exists | Linked to SD | Verify & handoff | `node scripts/unified-handoff-system.js` |
| Pending | Gates incomplete | Monitor | `node scripts/check-submission-status.js` |
| Failed validation | Gates failed | Archive/remediate | `node scripts/archive-submission.js` |

5. **Quick Review Command**:
```bash
node scripts/lead-review-submissions.js
```

#### Critical Context Elements

When reviewing submissions, pay special attention to:
- **Chairman Input**: The unfiltered original request
- **Screenshot URL**: Visual context for UI/UX requests  
- **SDIP ID**: For tracking through the processing pipeline
- **Processing History**: Number of steps and iterations
- **Metadata**: Additional context from processing

#### Linking Submissions to Strategic Directives

When creating an SD from a submission:
1. Include submission_id in SD metadata
2. Reference key context in SD description
3. Preserve chairman's original intent
4. Map submission scope to SD objectives

## Protocol Sections



## Unified Handoff Process (Database-First)

**ONE Command**: `node scripts/unified-handoff-system.js execute <TYPE> <SD-ID>`

**Handoff Types**:
- `LEAD-to-PLAN`: Strategic objectives → Technical planning
- `PLAN-to-EXEC`: PRD → Implementation
- `EXEC-to-PLAN`: Implementation complete → Verification
- `PLAN-to-LEAD`: Verification complete → Final approval

**Storage**: All handoffs in `sd_phase_handoffs` table (database-first, NO markdown files)

**7 Mandatory Elements** (Missing ANY = AUTOMATIC REJECTION):
1. Executive Summary
2. Deliverables Manifest
3. Key Decisions & Rationale
4. Known Issues & Risks
5. Resource Utilization
6. Action Items for Receiver
7. Completeness Report

## Sub-Agent System (Database-Driven)

### Active Sub-Agents

| Sub-Agent | Code | Activation | Priority |
|-----------|------|------------|----------|
${subAgents.map(sa => `| ${sa.name} | ${sa.code} | ${sa.activation_type} | ${sa.priority} |`).join('\n')}

### Sub-Agent Activation Triggers


#### Principal Database Architect Triggers:
- "schema" (keyword) in any context
- "migration" (keyword) in any context

#### QA Engineering Director Triggers:
- "coverage" (keyword) in any context

#### Principal Systems Analyst Triggers:
- "existing implementation" (keyword) in any context
- "duplicate" (keyword) in any context
- "conflict" (keyword) in any context
- "already implemented" (keyword) in any context
- "codebase check" (keyword) in any context

#### DevOps Platform Architect Triggers:
- "EXEC_IMPLEMENTATION_COMPLETE" (keyword) in any context
- "create pull request" (keyword) in any context
- "gh pr create" (keyword) in any context
- "LEAD_APPROVAL_COMPLETE" (keyword) in any context
- "create release" (keyword) in any context
- "PLAN_VERIFICATION_PASS" (keyword) in any context
- "github deploy" (keyword) in any context
- "github status" (keyword) in any context

#### Information Architecture Lead Triggers:
- "LEAD_SD_CREATION" (keyword) in any context
- "LEAD_HANDOFF_CREATION" (keyword) in any context
- "LEAD_APPROVAL" (keyword) in any context
- "PLAN_PRD_GENERATION" (keyword) in any context
- "PLAN_VERIFICATION" (keyword) in any context
- "EXEC_IMPLEMENTATION" (keyword) in any context
- "EXEC_COMPLETION" (keyword) in any context
- "HANDOFF_CREATED" (keyword) in any context
- "HANDOFF_ACCEPTED" (keyword) in any context
- "PHASE_TRANSITION" (keyword) in any context
- "RETRO_GENERATED" (keyword) in any context
- "FILE_CREATED" (keyword) in any context
- "VIOLATION_DETECTED" (keyword) in any context
- "DAILY_DOCMON_CHECK" (keyword) in any context

#### Continuous Improvement Coach Triggers:
- "LEAD_APPROVAL_COMPLETE" (keyword) in any context
- "LEAD_REJECTION" (keyword) in any context
- "PLAN_VERIFICATION_COMPLETE" (keyword) in any context
- "PLAN_COMPLEXITY_HIGH" (keyword) in any context
- "EXEC_SPRINT_COMPLETE" (keyword) in any context
- "EXEC_QUALITY_ISSUE" (keyword) in any context
- "HANDOFF_REJECTED" (keyword) in any context
- "HANDOFF_DELAY" (keyword) in any context
- "PHASE_COMPLETE" (keyword) in any context
- "SD_STATUS_COMPLETED" (keyword) in any context
- "SD_STATUS_BLOCKED" (keyword) in any context
- "PATTERN_DETECTED" (keyword) in any context
- "SUBAGENT_MULTIPLE_FAILURES" (keyword) in any context
- "WEEKLY_LEO_REVIEW" (keyword) in any context
- "LEAD_PRE_APPROVAL_REVIEW" (keyword) in any context

#### Product Requirements Expert Triggers:
- "PRD created" (keyword) in any context
- "acceptance criteria" (keyword) in any context
- "user stories" (keyword) in any context
- "generate stories" (keyword) in any context

#### Chief Security Architect Triggers:
- "authentication" (keyword) in any context
- "security" (keyword) in any context

#### Performance Engineering Lead Triggers:
- "optimization" (keyword) in any context

#### Senior Financial Analytics Engineer Triggers:
- "burn rate" (keyword) in any context
- "runway calculation" (keyword) in any context
- "cash flow projection" (keyword) in any context
- "valuation model" (keyword) in any context
- "financial validation" (keyword) in any context
- "vc metrics" (keyword) in any context
- "sensitivity analysis" (keyword) in any context
- "financial modeling" (keyword) in any context
- "projection algorithm" (keyword) in any context
- "monte carlo" (keyword) in any context
- "scenario analysis" (keyword) in any context
- "risk calculation" (keyword) in any context
- "portfolio risk" (keyword) in any context

#### UAT Test Executor Triggers:
- "uat test" (keyword) in any context
- "execute test" (keyword) in any context
- "run uat" (keyword) in any context
- "test execution" (keyword) in any context
- "manual test" (keyword) in any context
- "uat testing" (keyword) in any context
- "start testing" (keyword) in any context
- "TEST-AUTH" (keyword) in any context
- "TEST-DASH" (keyword) in any context
- "TEST-VENT" (keyword) in any context

#### Senior Design Sub-Agent Triggers:
- "component" (keyword) in any context
- "visual" (keyword) in any context
- "design system" (keyword) in any context
- "styling" (keyword) in any context
- "CSS" (keyword) in any context
- "Tailwind" (keyword) in any context
- "interface" (keyword) in any context
- "UI" (keyword) in any context
- "button" (keyword) in any context
- "form" (keyword) in any context
- "modal" (keyword) in any context
- "theme" (keyword) in any context
- "dark mode" (keyword) in any context
- "light mode" (keyword) in any context
- "responsive" (keyword) in any context
- "mobile" (keyword) in any context
- "user flow" (keyword) in any context
- "navigation" (keyword) in any context
- "journey" (keyword) in any context
- "interaction" (keyword) in any context
- "wireframe" (keyword) in any context
- "prototype" (keyword) in any context
- "UX" (keyword) in any context
- "user experience" (keyword) in any context
- "accessibility" (keyword) in any context
- "WCAG" (keyword) in any context
- "ARIA" (keyword) in any context
- "screen reader" (keyword) in any context
- "backend feature" (keyword) in any context
- "API endpoint" (keyword) in any context
- "database model" (keyword) in any context
- "database table" (keyword) in any context
- "new route" (keyword) in any context
- "new endpoint" (keyword) in any context
- "controller" (keyword) in any context
- "service layer" (keyword) in any context
- "business logic" (keyword) in any context
- "new feature" (keyword) in PRD context
- "feature implementation" (keyword) in any context
- "user-facing" (keyword) in any context
- "frontend" (keyword) in any context
- "page" (keyword) in any context
- "view" (keyword) in any context
- "dashboard" (keyword) in any context

### Sub-Agent Activation Process

When triggers are detected, EXEC MUST:

1. **Query Database for Active Triggers**
   ```sql
   SELECT * FROM leo_sub_agent_triggers 
   WHERE active = true 
   AND trigger_phrase IN (detected_phrases);
   ```

2. **Create Formal Handoff** (7 elements from database template)

3. **Execute Sub-Agent** 
   - Option A: Run tool from `script_path` field
   - Option B: Use context from `context_file` field
   - Option C: Document analysis if no tool exists

4. **Store Results in Database**
   ```sql
   INSERT INTO sub_agent_executions (sub_agent_id, results, ...);
   ```

### Handoff Templates


#### PLAN → EXEC (technical_to_implementation)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object], [object Object]


#### LEAD → PLAN (strategic_to_technical)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object]


#### EXEC → PLAN (implementation_to_verification)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object]


## Validation Rules (From Database)

No validation rules in database

## Database Schema Overview

### Core Tables
- `leo_protocols` - Protocol versions and content
- `leo_protocol_sections` - Modular protocol sections
- `leo_agents` - Agent definitions and percentages
- `leo_handoff_templates` - Standardized handoffs
- `leo_sub_agents` - Sub-agent definitions
- `leo_sub_agent_triggers` - Activation rules
- `leo_validation_rules` - Protocol validation

### Key Queries

**Get Current Protocol**:
```sql
SELECT * FROM leo_protocols WHERE status = 'active';
```

**Check Sub-Agent Triggers**:
```sql
SELECT sa.*, t.* 
FROM leo_sub_agents sa
JOIN leo_sub_agent_triggers t ON sa.id = t.sub_agent_id
WHERE t.trigger_phrase ILIKE '%keyword%';
```

**Get Handoff Template**:
```sql
SELECT * FROM leo_handoff_templates 
WHERE from_agent = 'EXEC' AND to_agent = 'PLAN';
```

## API Endpoints (Database-Backed)

- `GET /api/leo/current` - Current active protocol
- `GET /api/leo/agents` - All agents with percentages
- `GET /api/leo/sub-agents` - Active sub-agents with triggers
- `GET /api/leo/handoffs/:from/:to` - Handoff template
- `POST /api/leo/validate` - Validate against rules

## Key Scripts (Database-Aware)

- `get-latest-leo-protocol-from-db.js` - Get version from database
- `generate-claude-md-from-db.js` - Generate this file
- `migrate-leo-protocols-to-database.js` - Migration tool
- `activate-sub-agents-from-db.js` - Check database triggers

## Compliance Tools

All tools now query database instead of files:

### 1. Version Check
```bash
node scripts/get-latest-leo-protocol-from-db.js
```

### 2. Update CLAUDE.md
```bash
node scripts/generate-claude-md-from-db.js
```

### 3. Validate Handoff
```bash
node scripts/leo-checklist-db.js [agent-name]
```

## 🔍 PLAN Supervisor Verification

### Overview
PLAN agent now includes supervisor capabilities for final "done done" verification:
- Queries ALL sub-agents for their verification results
- Ensures all requirements are truly met
- Resolves conflicts between sub-agent reports
- Provides confidence scoring and clear pass/fail verdict

### Activation
Trigger PLAN supervisor verification via:
- **Command**: `/leo-verify [what to check]`
- **Script**: `node scripts/plan-supervisor-verification.js --prd PRD-ID`
- **Automatic**: When testing phase completes

### Verification Process
1. **Read-Only Access**: Queries existing sub-agent results (no re-execution)
2. **Summary-First**: Prevents context explosion with tiered reporting
3. **Conflict Resolution**: Priority-based rules (Security > Database > Testing)
4. **Circuit Breakers**: Graceful handling of sub-agent failures
5. **Maximum 3 Iterations**: Prevents infinite verification loops

### Verdicts
- **PASS**: All requirements met, high confidence (≥85%)
- **FAIL**: Critical issues or unmet requirements
- **CONDITIONAL_PASS**: Minor issues, needs LEAD review
- **ESCALATE**: Cannot reach consensus, needs LEAD intervention

## Dashboard Integration

Dashboard automatically connects to database:
- Real-time protocol updates via Supabase subscriptions
- Version detection from `leo_protocols` table
- Sub-agent status from `leo_sub_agents` table
- PLAN supervisor verification status
- No file scanning needed

## Important Notes

1. **Database is Source of Truth** - Files are deprecated
2. **Real-time Updates** - Changes reflect immediately
3. **No Version Conflicts** - Single active version enforced
4. **Audit Trail** - All changes tracked in database
5. **WebSocket Updates** - Dashboard stays synchronized
6. **PLAN Supervisor** - Final verification before LEAD approval

## 🗄️ Supabase Database Operations

### Connection Details
- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Connection**: Via Supabase client using environment variables

### Executing SQL Migrations (Automated - Preferred)

### ⚠️ CRITICAL: Migration Execution Protocol

**MANDATORY CHECKLIST** - Complete ALL steps before considering manual migration:

- [ ] **Step 1: Find Working Examples** (5 min)
  ```bash
  # Search for existing migration scripts in codebase
  find . -name "*migration*.js" -o -name "*migration*.mjs" | head -5
  grep -r "from 'pg'" scripts/ | head -3
  ```
  **Action**: Copy working pattern from existing script (e.g., `apply-demo-migration-direct.js`)
  **If no examples exist**: Proceed to Step 2

- [ ] **Step 2: Verify Environment Variables** (2 min)
  ```bash
  # Check all .env files
  cat .env | grep -i supabase
  cat ../EHG_Engineer/.env | grep -i supabase
  ```
  **Action**: Load correct env vars with dotenv
  **Common issues**: VITE_ prefix, wrong directory, missing SUPABASE_DB_PASSWORD

- [ ] **Step 3: Try Method 1 - PostgreSQL Direct** (10 min)
  - Check AWS region (aws-0 vs aws-1)
  - Parse URL into config object (don't use connection string directly)
  - Use `ssl: { rejectUnauthorized: false }`
  **Expected errors**: SSL cert (region mismatch), connection refused (wrong password)
  **If fails after config fixes**: Proceed to Step 4

- [ ] **Step 4: Try Method 2 - Supabase Client with dotenv** (5 min)
  **If fails**: Proceed to Step 5

- [ ] **Step 5: Try Method 3 - Create exec_sql RPC function** (10 min)
  **If all methods fail**: Debug systematically using error patterns below

**Minimum Attempts Required**: 3 methods OR 30 minutes of debugging
**Forbidden**: Giving up after 1-2 quick attempts - persist and debug

**IMPORTANT**: Claude CAN execute SQL migrations directly using proven patterns below. Automated migration is ALWAYS possible with proper debugging.

#### Method 1: PostgreSQL Direct Connection (RECOMMENDED)
Use this for migrations in the EHG application (`/mnt/c/_EHG/ehg/`):

```javascript
import pg from 'pg';
import fs from 'fs/promises';

const { Client } = pg;
const projectId = 'liapbndqlqxdcgpwntbv'; // EHG app database
const password = process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1';

// Pooler connection (IPv4 compatible)
const connStr = \`postgresql://postgres.\${projectId}:\${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require\`;

const client = new Client({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
await client.query('BEGIN');

// Read and execute migration file
const sql = await fs.readFile('database/migrations/your-migration.sql', 'utf-8');
const statements = sql.split(';').filter(s => s.trim() && !s.startsWith('--'));

for (const statement of statements) {
  await client.query(statement + ';');
}

await client.query('COMMIT');
await client.end();
```

**Pattern Example**: See `/mnt/c/_EHG/ehg/scripts/apply-demo-migration-pg.js`

#### Method 2: For EHG_Engineer Database
Use standard Supabase client with pooler URL:

```bash
# Set environment variables
export SUPABASE_POOLER_URL="postgresql://postgres.dedlbzhpgkmetvhbkyzq:Fl%21M32DaM00n%211@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

# Use Node.js with pg library (same pattern as Method 1)
node scripts/your-migration-script.js
```

#### Method 3: Supabase RPC (If exec_sql function exists)
```javascript
const { error } = await supabase.rpc('exec_sql', {
  sql: 'CREATE TABLE IF NOT EXISTS ...'
});
```

**Note**: This requires the `exec_sql` RPC function to be created in Supabase first.

### 🔧 Common Migration Errors & Solutions

| Error | Root Cause | Solution | Time to Fix |
|-------|-----------|----------|-------------|
| `self-signed certificate in certificate chain` | Wrong AWS region or SSL config | Use `aws-1-us-east-1` for EHG DB, parse URL to config object | 5 min |
| `EHG_SUPABASE_ANON_KEY not set` | Environment vars not loaded | Add `dotenv.config()`, check for `VITE_` prefix | 2 min |
| `relation "users" does not exist` | Foreign key to missing table | Remove FK constraints or make nullable | 10 min |
| `Could not find function exec_sql` | RPC function doesn't exist | Use Method 1 (pg direct) or Method 2 (client) instead | 1 min |
| `Connection refused` | Wrong password or project ID | Check `.env` files, verify project ID matches | 5 min |

**Pattern**: Environment/config errors are NOT blockers. They indicate "check your setup", not "use manual migration".

### 💪 Examples of Proper Persistence

#### ✅ GOOD: Systematic Debugging
```
Attempt 1: SSL error with aws-0 region
→ Check codebase for working examples
→ Find apply-demo-migration-direct.js uses aws-1
→ Fix region, retry

Attempt 2: Still SSL error
→ Check SSL config in working example
→ See it uses parsed URL config object, not connection string
→ Fix config, retry

Attempt 3: "relation users does not exist"
→ Check if users table exists in DB
→ Table missing, remove FK constraint
→ Success!

Time spent: 20 minutes
Result: Working automated migration
```

#### ❌ BAD: Premature Fallback
```
Attempt 1: SSL error
→ "This looks hard"
→ Jump to manual migration

Time spent: 5 minutes
Result: Manual migration required for every future SD
Why bad: Didn't check codebase, didn't verify config, took shortcut
```

### Key Database Operations Scripts
- `scripts/execute-leo-protocol-sql.js` - Execute protocol migrations
- `scripts/create-leo-protocol-tables.js` - Create LEO tables
- `scripts/apply-demo-migration-pg.js` - **Reference implementation for PG direct**
- `scripts/apply-demo-migration-direct.js` - **Working example with correct region/config**
- `scripts/apply-chairman-dashboard-schema.js` - Reference for Supabase client
- `database/schema/` - All schema definitions

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

### ⚠️ Server Restart Protocol (MANDATORY)

**After ANY changes to the application, you MUST**:
1. **Kill the server process**
2. **Build the React client** (if UI changes were made)
3. **Restart the server**

```bash
# Method 1: Using process management
pkill -f "node server.js"

# Method 2: If running in Claude Code background
# Use KillBash tool with shell_id

# Build React client (REQUIRED for UI/component changes)
cd /mnt/c/_EHG/EHG_Engineer
npm run build:client

# Restart server
PORT=3000 node server.js
```

### Why This is Required

**React Build Process**:
- React components are compiled from `src/client/src/` to `src/client/dist/`
- Server serves static files from `dist`, not source files
- CSS changes must be bundled and minified via Vite
- No hot-reloading is configured in this setup

**File Structure**:
```
src/client/
├── src/               # Source files (your edits)
│   ├── components/    # React components
│   └── styles/        # CSS files
└── dist/              # Built files (served by server)
    ├── index.html
    └── assets/
```

### Development Commands

```bash
# Complete development cycle
cd /mnt/c/_EHG/EHG_Engineer
npm run build:client && PORT=3000 node server.js

# Build client only
npm run build:client

# Check if server is running
lsof -i :3000
```

### Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
# Optional: SUPABASE_SERVICE_ROLE_KEY for admin operations
# Optional: DATABASE_URL for direct psql access
```

---

*Generated from Database: 2025-10-04*
*Protocol Version: vv4.2.0_story_gates*
*Database-First Architecture: ACTIVE*
