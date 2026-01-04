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


## Common Commands

- `bash scripts/leo-stack.sh restart` - Restart all LEO servers (Engineer on 3000, App on 8080, Agent Platform on 8000)
- `bash scripts/leo-stack.sh status` - Check server status
- `bash scripts/leo-stack.sh stop` - Stop all servers

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2026-01-04 9:03:44 AM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: 4.3.3

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
| `RETRO` | lead_rejection, plan_verification_complete, plan_complexity_high, exec_sprint_complete, exec_quality_issue, handoff_rejected, handoff_delay, phase_complete, sd_status_completed, sd_status_blocked (+10 more) |
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

*Router generated from database: 2026-01-04*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*
