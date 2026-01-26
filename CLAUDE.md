# CLAUDE.md - LEO Protocol Context Router

**This file is AUTO-GENERATED from the database.**

## To Make Changes:
1. **For dynamic content** (agents, sub-agents, triggers): Update database tables directly
2. **For static sections** (guides, examples, instructions): Add/update in `leo_protocol_sections` table
3. **Regenerate file**: Run `node scripts/generate-claude-md-from-db.js`

**Any direct edits to this file will be lost on next regeneration!**

See documentation for table structure: `database/schema/007_leo_protocol_schema_fixed.sql`

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## AUTO-PROCEED Mode

**AUTO-PROCEED** enables fully autonomous LEO Protocol execution, allowing Claude to work through SD workflows without manual confirmation at each phase transition.

### Activation

AUTO-PROCEED is **ON by default** for new sessions. To change:
- Run `/leo init` to set session preference
- Preference stored in `claude_sessions.metadata.auto_proceed`

Check status:
```bash
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).from('claude_sessions').select('metadata').eq('status','active').order('heartbeat_at',{ascending:false}).limit(1).single().then(({data})=>console.log('AUTO_PROCEED='+(data?.metadata?.auto_proceed??true)))"
```

### Behavior Summary

| When AUTO-PROCEED is ON | When OFF |
|-------------------------|----------|
| Phase transitions execute automatically | Pause and ask before each transition |
| Post-completion runs /document → /ship → /learn | Ask before each step |
| Shows next SD after completion | Ask before showing queue |
| No confirmation prompts | AskUserQuestion at each decision |

### Pause Points (When ON)

AUTO-PROCEED runs continuously EXCEPT at these boundaries:
1. **Orchestrator completion** - After all children complete, pauses for /learn review
2. **Blocking errors** - Errors that cannot be auto-resolved
3. **Test failures** - After 2 retry attempts
4. **Merge conflicts** - Require human resolution
5. **All children blocked** - Shows blockers and waits for decision

### How to Stop

- **User interrupt**: Type in terminal at any time (auto-resumes after handling)
- **Explicit stop**: Say "stop AUTO-PROCEED" or "disable AUTO-PROCEED"
- **Session preference**: Run `/leo init` and select "Turn OFF"

### Quick Start

```
1. Start session → AUTO-PROCEED ON by default
2. Run /leo next → See SD queue
3. Pick SD → Work begins automatically
4. Phase transitions → No confirmation needed
5. Completion → /document → /ship → /learn → next SD
6. Orchestrator done → /learn runs, queue displayed, PAUSE
```

### Discovery Decisions Summary (D01-D29)

| # | Area | Decision |
|---|------|----------|
| D01 | Pause points | Never within session, only at orchestrator completion |
| D02 | Error handling | Auto-retry with exponential backoff |
| D03 | Visibility | Full streaming (show all activity) |
| D04 | Limits | None - run until complete or interrupted |
| D05 | UAT | Auto-pass with flag for later human review |
| D06 | Notifications | Terminal + Claude Code sound notification |
| D07 | Learning trigger | Auto-invoke /learn at orchestrator end |
| D08 | Post-learn | Show queue, pause for user selection |
| D09 | Context | Existing compaction process handles it |
| D10 | Restart | Auto-restart with logging for visibility |
| D11 | Handoff | Propagate AUTO-PROCEED flag through handoff.js |
| D12 | Activation | Uses claude_sessions.metadata.auto_proceed (default: true) |
| D13 | Interruption | Built-in, auto-resume after handling user input |
| D14 | Multi-orchestrator | Show full queue of available orchestrators/SDs |
| D15 | Chaining | Configurable (default: pause at orchestrator boundary) |
| D16 | Validation failures | Skip failed children, mark as blocked, continue |
| D17 | Session summary | Detailed - all SDs processed, status, time, issues |
| D18 | Crash recovery | Both auto-load AND explicit /leo resume |
| D19 | Metrics | Use existing retrospectives and issue patterns |
| D20 | Sensitive SDs | No exceptions - all SD types treated the same |
| D21 | Mid-exec blockers | Attempt to identify and resolve dependency first |
| D22 | Re-prioritization | Auto-adjust queue based on learnings |
| D23 | All blocked | Show blockers, pause for human decision |
| D24 | Mode reminder | Display AUTO-PROCEED status when /leo starts SD |
| D25 | Status line | Add mode + phase + progress (keep existing content) |
| D26 | Completion cue | No acknowledgment between SDs - smooth continuation |
| D27 | Compaction notice | Brief inline notice when context compacted |
| D28 | Error retries | Log inline with "Retrying... (attempt X/Y)" |
| D29 | Resume reminder | Show what was happening before resuming |

*Full discovery details: docs/discovery/auto-proceed-enhancement-discovery.md*


## Session Initialization - SD Selection

### Intent Detection Keywords
When the user says any of the following, run `npm run sd:next` FIRST:
- "start LEO", "start the LEO protocol"
- "what should we work on", "what's next"
- "identify next work", "next SD", "next strategic directive"
- "continue work", "resume", "pick up where we left off"
- "show queue", "show priorities", "what's ready"

### Automatic SD Queue Loading
```bash
npm run sd:next
```

This command provides:
1. **Track View** - Three parallel execution tracks (A: Infrastructure, B: Features, C: Quality)
2. **Dependency Status** - Which SDs are READY vs BLOCKED
3. **Continuity** - Recent git activity and "Working On" flag
4. **Recommendations** - Suggested starting point per track

### After Running sd:next
1. If SD marked "CONTINUE" (is_working_on=true) → Resume that SD
2. If no active SD → Pick highest-ranked READY SD from appropriate track
3. Load CLAUDE_LEAD.md for SD approval workflow

### Related Commands
| Command | Purpose |
|---------|---------|
| `npm run sd:next` | Show intelligent SD queue |
| `npm run sd:status` | Progress vs baseline |
| `npm run sd:burnrate` | Velocity and forecasting |
| `npm run sd:baseline view` | Current execution plan |


## Skill Intent Detection (Proactive Invocation)

**CRITICAL**: When user query or response matches these patterns, IMMEDIATELY invoke the corresponding skill using the Skill tool. Do not just acknowledge - execute.

### SD Creation Triggers → **Semantic Intent**: User wants to create a new trackable work item in the LEO system.

**Explicit triggers** (user directly mentions SD/directive):
- "create an SD", "create a strategic directive", "new SD", "new directive"
- "I want to create an SD", "I want to create a strategic directive"
- "let's create an SD", "make this an SD", "turn this into an SD"
- "create another SD", "another strategic directive"
- "add this to the queue", "queue this up", "track this as an SD"

**Contextual triggers** (user describes work that should become an SD):
- "this should be tracked", "we should track this", "this needs tracking"
- "turn this into a directive", "make this a directive"
- "I want to [refactor/fix/add/build/implement] ..." (when scope is non-trivial)

**After agreement triggers** (when Claude suggests an SD and user agrees):
- "yes", "yes, create", "sure", "ok, create it", "go ahead"
- "yes, let's do that", "sounds good, create it"

**Intelligence hint**: If the user describes a task that would typically require:
- Multiple files to modify
- More than ~50 lines of code
- Planning before implementation
- Tracking in the database

...then SUGGEST creating an SD if one doesn't exist for this work.

**Action**: Use Skill tool with  and 
### Quick-Fix Triggers → - "quick fix", "small fix", "just fix this quickly"
- "patch this", "minor bug", "simple fix"
- "can you fix that real quick", "tiny change needed"
- After  confirms small issue (<50 LOC)

**Action**: Use Skill tool with  and 
### Documentation Triggers → - "document this", "update the docs", "add documentation"
- "we should document this", "this needs documentation"
- After completing feature/API SD work
- When new commands or features are implemented

**Action**: Use Skill tool with 
### Learning Triggers → - "capture this pattern", "we should learn from this"
- "add this as a learning", "this is a recurring issue"
- "remember this for next time", "pattern detected"
- After  completes successfully

**Action**: Use Skill tool with 
### Verification Triggers → - "verify this with other AIs", "triangulate this"
- "is this actually implemented?", "check if this works"
- "get external AI opinion", "multi-AI verification"
- When debugging conflicting claims about codebase state

**Action**: Use Skill tool with 
### UAT Triggers → - "test this", "let's do acceptance testing"
- "run UAT", "human testing needed", "manual test"
- "verify this works", "acceptance test"
- After  for feature/bugfix/security SDs

**Action**: Use Skill tool with 
### Shipping Triggers → - "commit this", "create PR", "ship it", "let's ship"
- "push this", "merge this", "ready to ship"
- "create a pull request", "commit and push"
- After UAT passes or for exempt SD types

**Action**: Use Skill tool with 
### Server Management Triggers → - "restart servers", "fresh environment"
- "restart the stack", "restart LEO", "reboot servers"
- Before UAT, after long sessions, before visual review

**Action**: Use Skill tool with 
### RCA Triggers → - "this keeps failing", "stuck on this", "blocked"
- "need root cause", "root cause analysis", "rca"
- "why does this keep happening", "5 whys", "five whys"
- "diagnose", "debug", "investigate"
- "what caused this", "recurring issue"

**Action**: Use Skill tool with 
### Feedback Triggers → - "check feedback", "see inbox", "any feedback?"
- "review feedback items", "pending feedback"

**Action**: Use Skill tool with 
### Simplify Triggers → - "simplify this code", "clean this up", "refactor for clarity"
- "make this cleaner", "reduce complexity"
- Before shipping if session had rapid iteration

**Action**: Use Skill tool with 
### Context Compaction Triggers → - "context is getting long", "summarize context"
- "compact the conversation", "running out of context"

**Action**: Use Skill tool with 
---

### Command Ecosystem Flow (Quick Reference)

\
### Auto-Invoke Behavior

**CRITICAL**: When user agrees to a suggested command (e.g., "yes, let's ship", "sure, create an SD"), IMMEDIATELY invoke the skill. Do not:
- Just acknowledge the request
- Wait for explicit  syntax
- Ask for confirmation again

The user's agreement IS the confirmation. Execute immediately.

## Common Commands

- `node scripts/cross-platform-run.js leo-stack restart` - Restart all LEO servers (Engineer on 3000, App on 8080, Agent Platform on 8000)
- `node scripts/cross-platform-run.js leo-stack status` - Check server status
- `node scripts/cross-platform-run.js leo-stack stop` - Stop all servers

**Note**: The cross-platform runner automatically selects the appropriate script:
- **Windows**: Uses `leo-stack.ps1` (PowerShell)
- **Linux/macOS**: Uses `leo-stack.sh` (Bash)

## Slash Commands & Command Ecosystem

LEO Protocol includes intelligent slash commands that interconnect based on workflow context:

| Command | Purpose | Key Integration |
|---------|---------|-----------------|
| `/leo` | Protocol orchestrator, SD queue management | Suggests post-completion sequence |
| `/restart` | Restart all LEO stack servers | Pre-ship for UI work, post-completion |
| `/ship` | Commit, create PR, merge workflow | Always after completion, suggests /learn |
| `/learn` | Self-improvement, pattern capture | After shipping, creates SDs |
| `/document` | Update documentation | After feature/API work |
| `/quick-fix` | Small bug fixes (<50 LOC) | After triangulation confirms small bug |
| `/triangulation-protocol` | Multi-AI ground-truth verification | Before fixes, suggests /quick-fix |

**Command Ecosystem**: Commands intelligently suggest related commands based on context. See full workflow:
- **[Command Ecosystem Reference](docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram

**Example Flow (UI Feature Completion)**:
```
LEAD-FINAL-APPROVAL → /restart → Visual Review → /document → /ship → /learn → /leo next
```

## DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2026-01-26 9:35:02 PM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## CURRENT LEO PROTOCOL VERSION: 4.3.3

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-3-3-ui-parity
**Status**: ACTIVE
**Title**: LEO Protocol v4.3.3 - UI Parity Governance

## CLAUDE.md Router (Context Loading)

### Loading Strategy
1. **ALWAYS**: Read CLAUDE_CORE.md first (15k)
2. **Phase Detection**: Load phase-specific file based on keywords
3. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

### Phase Keywords → File
| Keywords | Load |
|----------|------|
| "approve", "LEAD", "directive", "simplicity" | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation", "schema" | CLAUDE_PLAN.md |
| "implement", "EXEC", "code", "test" | CLAUDE_EXEC.md |

### Issue → Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget
- Router + Core: 18k (9% of 200k budget) ✅
- + Phase file: 43k avg (22%) ✅
- + Reference doc: 58k (29%) ✅

## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
| `ANALYTICS` | analytics tracking, conversion tracking, funnel analysis, google analytics, kpi dashboard, metrics dashboard, mixpanel, user analytics, AARRR, KPI (+24 more) |
| `API` | add endpoint, api design, api endpoint, api route, backend route, create endpoint, graphql api, openapi, rest api, swagger (+37 more) |
| `CRM` | contact management, crm system, customer relationship, hubspot setup, lead tracking, salesforce integration, CRM, HubSpot, Salesforce, account (+14 more) |
| `DATABASE` | EXEC_IMPLEMENTATION_COMPLETE, add column, alter table, create table, data model, database migration, database schema, db migration, erd, foreign key (+79 more) |
| `DEPENDENCY` | dependency update, dependency vulnerability, npm audit, npm install, outdated packages, package update, pnpm add, security advisory, yarn add, CVE (+29 more) |
| `DESIGN` | a11y, accessibility, component design, dark mode, design system, mobile layout, responsive design, shadcn, ui design, ux design (+67 more) |
| `DOCMON` | DAILY_DOCMON_CHECK, EXEC_COMPLETION, EXEC_IMPLEMENTATION, FILE_CREATED, HANDOFF_ACCEPTED, HANDOFF_CREATED, LEAD_APPROVAL, LEAD_HANDOFF_CREATION, LEAD_SD_CREATION, PHASE_TRANSITION (+30 more) |
| `FINANCIAL` | burn rate, cash flow analysis, financial model, p&l statement, profit and loss, revenue projection, runway calculation, EBITDA, P&L, break even (+21 more) |
| `GITHUB` | EXEC_IMPLEMENTATION_COMPLETE, LEAD_APPROVAL_COMPLETE, PLAN_VERIFICATION_PASS, ci pipeline, code review, create pr, git merge, git rebase, github actions, github workflow (+33 more) |
| `LAUNCH` | deploy to production, go live checklist, launch checklist, production deployment, ready to launch, release to production, ship to prod, GA release, beta release, cutover (+20 more) |
| `MARKETING` | brand awareness, content marketing, go to market, gtm strategy, marketing campaign, marketing strategy, seo strategy, GTM, SEO, advertising (+20 more) |
| `MONITORING` | alerting system, application monitoring, datadog, error monitoring, health check, prometheus, sentry, system monitoring, uptime monitoring, Datadog (+23 more) |
| `PERFORMANCE` | bottleneck, cpu usage, load time, memory leak, n+1 query, performance issue, performance optimization, response time, slow query, speed optimization (+27 more) |
| `PRICING` | cac ltv, pricing model, pricing page, pricing strategy, subscription pricing, tiered pricing, unit economics, CAC, LTV, arpu (+19 more) |
| `QUICKFIX` | easy fix, hotfix, minor fix, one liner, quick fix, quickfix, simple fix, small fix, trivial fix, adjust (+13 more) |
| `RCA` | 5 whys, causal analysis, ci_pipeline_failure, fault tree, fishbone, five whys, get to the bottom, handoff_rejection, ishikawa, keeps happening (+46 more) |
| `REGRESSION` | api signature, backward compatible, backwards compatible, before and after, breaking change, no behavior change, refactor safely, regression test, DRY violation, backward (+34 more) |
| `RETRO` | LEAD_APPROVAL_COMPLETE, LEAD_REJECTION, PLAN_VERIFICATION_COMPLETE, action items, continuous improvement, learn from this, lessons learned, post-mortem, postmortem, retrospective (+49 more) |
| `RISK` | architecture decision, high risk, pros and cons, risk analysis, risk assessment, risk mitigation, security risk, system design, tradeoff analysis, LEAD_PRE_APPROVAL (+79 more) |
| `SALES` | close deal, objection handling, sales cycle, sales pipeline, sales playbook, sales process, sales strategy, close, closing, deal (+17 more) |
| `SECURITY` | api key exposed, authentication bypass, csrf vulnerability, cve, exposed credential, hardcoded secret, owasp, penetration test, security audit, security vulnerability (+34 more) |
| `STORIES` | acceptance criteria, as a user, definition of done, epic, feature request, i want to, so that, user stories, user story, PLAN_PRD (+23 more) |
| `TESTING` | EXEC_IMPLEMENTATION_COMPLETE, add tests, create tests, e2e test, end to end test, integration test, jest test, playwright test, spec file, test coverage (+42 more) |
| `UAT` | acceptance criteria, click through, happy path, human test, manual test, test scenario, uat test, user acceptance test, user journey, TEST-AUTH (+31 more) |
| `VALIDATION` | already exists, already implemented, before i build, check if exists, codebase search, duplicate check, existing implementation, codebase, codebase check, conflict (+18 more) |
| `VALUATION` | acquisition target, company valuation, dcf analysis, exit strategy, fundraising round, series a, startup valuation, DCF, IPO, Series A (+20 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*


---

*Router generated from database: 2026-01-26*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*
