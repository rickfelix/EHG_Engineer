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

### SD Creation Triggers → `/leo create`
**Semantic Intent**: User wants to create a new trackable work item in the LEO system.

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

**Action**: Use Skill tool with `skill: "leo"` and `args: "create"`

### Quick-Fix Triggers → `/quick-fix`
- "quick fix", "small fix", "just fix this quickly"
- "patch this", "minor bug", "simple fix"
- "can you fix that real quick", "tiny change needed"
- After `/triangulation-protocol` confirms small issue (<50 LOC)

**Action**: Use Skill tool with `skill: "quick-fix"` and `args: "[issue description]"`

### Documentation Triggers → `/document`
- "document this", "update the docs", "add documentation"
- "we should document this", "this needs documentation"
- After completing feature/API SD work
- When new commands or features are implemented

**Action**: Use Skill tool with `skill: "document"`

### Learning Triggers → `/learn`
- "capture this pattern", "we should learn from this"
- "add this as a learning", "this is a recurring issue"
- "remember this for next time", "pattern detected"
- After `/ship` completes successfully

**Action**: Use Skill tool with `skill: "learn"`

### Verification Triggers → `/triangulation-protocol`
- "verify this with other AIs", "triangulate this"
- "is this actually implemented?", "check if this works"
- "get external AI opinion", "multi-AI verification"
- When debugging conflicting claims about codebase state

**Action**: Use Skill tool with `skill: "triangulation-protocol"`

### UAT Triggers → `/uat`
- "test this", "let's do acceptance testing"
- "run UAT", "human testing needed", "manual test"
- "verify this works", "acceptance test"
- After `/restart` for feature/bugfix/security SDs

**Action**: Use Skill tool with `skill: "uat"`

### Shipping Triggers → `/ship`
- "commit this", "create PR", "ship it", "let's ship"
- "push this", "merge this", "ready to ship"
- "create a pull request", "commit and push"
- After UAT passes or for exempt SD types

**Action**: Use Skill tool with `skill: "ship"`

### Server Management Triggers → `/restart`
- "restart servers", "fresh environment"
- "restart the stack", "restart LEO", "reboot servers"
- Before UAT, after long sessions, before visual review

**Action**: Use Skill tool with `skill: "restart"`

### Escalation Triggers → `/escalate`
- "this keeps failing", "stuck on this", "blocked"
- "need root cause", "escalate this issue"
- "why does this keep happening", "5 whys"

**Action**: Use Skill tool with `skill: "escalate"`

### Feedback Triggers → `/inbox`
- "check feedback", "see inbox", "any feedback?"
- "review feedback items", "pending feedback"

**Action**: Use Skill tool with `skill: "inbox"`

### Simplify Triggers → `/simplify`
- "simplify this code", "clean this up", "refactor for clarity"
- "make this cleaner", "reduce complexity"
- Before shipping if session had rapid iteration

**Action**: Use Skill tool with `skill: "simplify"`

### Context Compaction Triggers → `/context-compact`
- "context is getting long", "summarize context"
- "compact the conversation", "running out of context"

**Action**: Use Skill tool with `skill: "context-compact"`

---

### Command Ecosystem Flow (Quick Reference)

```
Issue Found → /triangulation-protocol → /quick-fix (if <50 LOC) OR Create SD (if larger)
SD Complete → /restart (if UI) → /uat → /ship → /document → /learn → /leo next
```

### Auto-Invoke Behavior

**CRITICAL**: When user agrees to a suggested command (e.g., "yes, let's ship", "sure, create an SD"), IMMEDIATELY invoke the skill. Do not:
- Just acknowledge the request
- Wait for explicit `/command` syntax
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
LEAD-FINAL-APPROVAL → /restart → Visual Review → /ship → /document → /learn → /leo next
```

## DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2026-01-22 9:56:48 PM
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
| `ANALYTICS` | analytics, metrics, dashboard, aarrr, funnel, conversion rate, user behavior, tracking, kpi, retention rate (+1 more) |
| `API` | api, rest, restful, graphql, endpoint, route, controller, middleware, request, response (+7 more) |
| `CRM` | crm, customer relationship, contact management, lead tracking, customer success, salesforce, hubspot, customer data |
| `DATABASE` | query, select from, insert into, supabase, fetch from database, database query |
| `DEPENDENCY` | dependency, dependencies, npm, yarn, pnpm, package, package.json, vulnerability, cve, security advisory (+12 more) |
| `DESIGN` | component, visual, design system, styling, css, tailwind, interface, ui, button, form (+32 more) |
| `DOCMON` | lead_sd_creation, lead_handoff_creation, lead_approval, plan_prd_generation, plan_verification, exec_implementation, exec_completion, handoff_created, handoff_accepted, phase_transition (+4 more) |
| `FINANCIAL` | financial, p&l, profit and loss, cash flow, burn rate, runway, revenue projection, margin, gross margin, ebitda (+2 more) |
| `GITHUB` | exec_implementation_complete, create pull request, gh pr create, lead_approval_complete, create release, plan_verification_pass, github deploy, github status, deployment ci pattern |
| `LAUNCH` | launch, go-live, production launch, deployment, release, rollout, cutover, launch checklist, beta release, ga release |
| `MARKETING` | marketing, go-to-market, gtm, campaign, positioning, messaging, channel strategy, content marketing, seo, brand awareness (+1 more) |
| `MONITORING` | uptime, incident, observability, logging, tracing, datadog, prometheus, monitoring, alerting, health check (+1 more) |
| `PERFORMANCE` | optimization |
| `PRICING` | pricing, price point, pricing strategy, unit economics, subscription, freemium, tiered pricing, cac, ltv, revenue model |
| `RCA` | sub_agent_blocked, ci_pipeline_failure, quality_gate_critical, test_regression, handoff_rejection, sub_agent_fail, quality_degradation, pattern_recurrence, performance_regression, diagnose defect (+2 more) |
| `REGRESSION` | refactor, refactoring, backward compatibility, backwards compatible, breaking change, regression, restructure, no behavior change, no functional change, api signature (+17 more) |
| `RETRO` | lead_rejection, plan_verification_complete, plan_complexity_high, exec_sprint_complete, exec_quality_issue, handoff_rejected, handoff_delay, phase_complete, sd_status_completed, sd_status_blocked (+18 more) |
| `RISK` | high risk, complex, architecture, sophisticated, advanced, overhaul, redesign, authorization, rls, permission (+35 more) |
| `SALES` | sales, sales playbook, sales process, pipeline, deal flow, quota, sales cycle, objection handling, sales enablement, closing |
| `SECURITY` | authentication, security, security auth pattern |
| `STORIES` | user story, user stories, acceptance criteria, implementation, context, guidance, plan_prd |
| `TESTING` | coverage, protected route, build error, dev server, test infrastructure, testing evidence, redirect to login, playwright build, unit tests, vitest (+3 more) |
| `UAT` | uat test, execute test, run uat, test execution, manual test, uat testing, start testing, test-auth, test-dash, test-vent |
| `VALIDATION` | existing implementation, duplicate, conflict, already implemented, codebase check |
| `VALUATION` | valuation, exit, exit strategy, acquisition, ipo, series a, fundraising, multiple, dcf, comparable (+1 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*


---

*Router generated from database: 2026-01-22*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*
