<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-07T14:17:27.428Z -->
<!-- git_commit: 826248eb -->
<!-- db_snapshot_hash: e0c92dff9edd1cbb -->
<!-- file_content_hash: pending -->

# CLAUDE_CORE_DIGEST.md - Core Protocol (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow rules and constraints (<10k chars)

---

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

## MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions.

### Required Commands

**Pre-flight Batch Validation (RECOMMENDED)**:
**Phase Transitions**:
### Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run | Run TESTING first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff | Complete missing handoff |
| `ERR_NO_PRD` | No PRD for PLAN-TO-EXEC | Create PRD first |

### Emergency Bypass (Rate-Limited)
- 3 bypasses per SD max, 10 per day globally
- All bypasses logged to `audit_log` with severity=warning

### Compliance Check
**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## Mandatory Agent Invocation Rules

**CRITICAL**: Certain task types REQUIRE specialized agent invocation - NO ad-hoc manual inspection allowed.

### Task Type -> Required Agent

| Task Keywords | MUST Invoke | Purpose |
|---------------|-------------|---------|
| UI, UX, design, landing page, styling, CSS, colors, buttons | **design-agent** | Accessibility audit (axe-core), contrast checking |
| accessibility, a11y, WCAG, screen reader, contrast | **design-agent** | WCAG 2.1 AA compliance validation |
| form, input, validation, user flow | **design-agent** + **testing-agent** | UX + E2E verification |
| performance, slow, loading, latency | **performance-agent** | Load testing, optimization |
| security, auth, RLS, permissions | **security-agent** | Vulnerability assessment |
| API, endpoint, REST, GraphQL | **api-agent** | API design patterns |
| database, migration, schema | **database-agent** | Schema validation |
| test, E2E, Playwright, coverage | **testing-agent** | Test execution |

### Why This Exists

**Incident**: Human-like testing perspective interpreted as manual content inspection.
**Result**: 47 accessibility issues missed, including critical contrast failures (1.03:1 ratio).
**Root Cause**: Ad-hoc review instead of specialized agent invocation.
**Prevention**: Explicit rules mandate agent use for specialized tasks.

### How to Apply

1. Detect task type from user request keywords
2. Invoke required agent(s) BEFORE making changes
3. Agent findings inform implementation
4. Re-run agent AFTER changes to verify fixes

## Execution Philosophy

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness > speed. 2-4 hours careful implementation beats 6-12 hours rework.

### Testing-First (MANDATORY)
- E2E testing is MANDATORY
- 100% user story coverage required
- Both unit tests AND E2E tests must pass

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth:
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Handoffs → `sd_phase_handoffs`
- Retrospectives → `retrospectives`

### Validation-First (GATEKEEPING)
- LEAD validates: Real problem? Feasible? Resources?
- After approval: SCOPE LOCK - deliver what was approved

### Anti-Bias Rules (MANDATORY)
| Bias | Incorrect | Correct |
|------|-----------|---------|
| Efficiency | Skip workflow steps | Full workflow is non-negotiable |
| Completion | "complete" = code works | "complete" = database status + validations |
| Abstraction | Children are sub-tasks | Children are INDEPENDENT SDs |
| Autonomy | No human gates | Each phase requires validation |

**RULE**: When ANY bias-pattern detected, STOP and verify with user.

**NEVER**:
- Ship without completing full LEO Protocol
- Skip LEAD approval for child SDs
- Skip PRD creation for child SDs
- Mark parent complete before all children complete in database

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## Critical Term Definitions

## 🚫 CRITICAL TERM DEFINITIONS (BINDING)

These definitions are BINDING. Misinterpretation is a protocol violation.

### "Complete an SD"
**Definition**: An SD is "complete" ONLY when:
1. Full LEAD→PLAN→EXEC cycle executed (per sd_type requirements)
2. Database status = 'completed'
3. All required handoffs recorded
4. Retrospective created
5. LEO Protocol validation trigger passes

**NOT complete**: Code shipped but database shows 'draft'/'in_progress'

### "Continue autonomously"
**Definition**: Execute the current SD through its full LEO Protocol workflow WITHOUT stopping to ask for user confirmation at each step.
**NOT**: Skip workflow steps for efficiency.
**AUTO-PROCEED**: Phase transitions, post-completion sequence, and next SD selection all happen automatically.
**ONLY STOP IF**:
- Blocking error requires human decision (e.g., merge conflicts)
- Tests fail after 2 retry attempts
- Critical security or data-loss scenario

### "Child SD"
**Definition**: An INDEPENDENT Strategic Directive that requires its own full LEAD→PLAN→EXEC cycle.
**NOT**: A sub-task or implementation detail of the parent.
**Each child**: Has its own PRD, handoffs, retrospective, and completion validation.

### "Ship" vs "Complete"
**Ship**: Code merged to main branch.
**Complete**: Ship + database status 'completed' + all handoffs + retrospective.
**CRITICAL**: Shipping is NECESSARY but NOT SUFFICIENT for completion.

## SD Type-Aware Workflow Paths

## SD Type Validation & Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs AND different gate pass thresholds.

### Gate Pass Thresholds
| SD Type | Threshold | Required Handoffs | Notes |
|---------|-----------|-------------------|-------|
| `feature` | 85% | All 5 | Full validation |
| `bugfix` | 85% | All 5 | Regression testing critical |
| `database` | 85% | All 5 | May skip UI-dependent E2E |
| `security` | 90% | All 5 | Strictest validation |
| `refactor` | 75-90% | All 5 | Varies by intensity |
| `infrastructure` | 80% | 4 (skip EXEC-TO-PLAN) | No production code |
| `documentation` | 60% | 4 (skip EXEC-TO-PLAN) | No code changes |
| `orchestrator` | 70% | Coordinates children | USER_STORY gate bypassed |

### Workflow Paths

**Full Workflow (5 handoffs)** - feature, bugfix, database, security, refactor:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
```

**Reduced Workflow (4 handoffs)** - infrastructure, documentation:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
                                    ↑ (skip EXEC-TO-PLAN)
```

### Required Sub-Agents by Type
| SD Type | Required Sub-Agents |
|---------|---------------------|
| `feature` | TESTING, DESIGN, DATABASE, STORIES |
| `bugfix` | TESTING, REGRESSION |
| `database` | DATABASE |
| `security` | SECURITY, TESTING |
| `infrastructure` | DOCMON |

### UAT Requirements
| SD Type | UAT Required | Notes |
|---------|-------------|-------|
| `feature` | **YES** | Human-verifiable outcome |
| `bugfix` | **YES** | Verify fix works |
| `infrastructure` | **EXEMPT** | Internal tooling |
| `documentation` | No | No runtime behavior |

### Pre-Handoff Check
Reference: `lib/utils/sd-type-validation.js`

## Database Sub-Agent Auto-Invocation

## Database Sub-Agent Semantic Triggering

When SQL execution intent is detected, the database sub-agent should be auto-invoked instead of outputting manual execution instructions.

### Intent Detection Triggers

The following phrases trigger automatic database sub-agent invocation:

| Category | Example Phrases | Priority |
|----------|-----------------|----------|
| **Direct Command** | "run this sql", "execute the query" | 9 |
| **Delegation** | "use database sub-agent", "have the database agent" | 8 |
| **Imperative** | "please run", "can you execute" | 8 |
| **Operational** | "update the table", "create the table" | 7 |
| **Result-Oriented** | "make this change in the database" | 6 |
| **Contextual** | "run it", "execute it" (requires SQL context) | 5 |

### Denylist Phrases (Block Execution Intent)

These phrases force NO_EXECUTION intent:
- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"

### Integration

When Claude generates SQL with execution instructions:
1. Check for SQL execution intent using `shouldAutoInvokeAndExecute()`
2. If intent detected with confidence >= 80%, use Task tool with database-agent
3. Never output "run this manually" when auto-invocation is permitted

### Configuration

Runtime configuration in `db_agent_config` table:
- `MIN_CONFIDENCE_TO_INVOKE`: 0.80 (default)
- `DB_AGENT_ENABLED`: true (default)
- `DENYLIST_PHRASES`: Array of blocking phrases

### Audit Trail

All invocation decisions logged to `db_agent_invocations` table with:
- correlation_id for tracing
- intent and confidence scores
- matched trigger IDs
- decision outcome

## Background Task Output Retrieval

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
| `ANALYTICS` | analytics tracking, conversion tracking, funnel analysis, google analytics, kpi dashboard, metrics dashboard, mixpanel, user analytics, AARRR, KPI (+24 more) |
| `API` | add endpoint, api design, api endpoint, api route, backend route, create endpoint, graphql api, openapi, rest api, swagger (+37 more) |
| `CRM` | contact management, crm system, customer relationship, hubspot setup, lead tracking, salesforce integration, CRM, HubSpot, Salesforce, account (+14 more) |
| `DATABASE` | EXEC_IMPLEMENTATION_COMPLETE, add column, alter table, apply migration, apply schema changes, apply the migration, create table, data model, database migration, database schema (+84 more) |
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
| `TESTING` | EXEC_IMPLEMENTATION_COMPLETE, add tests, create tests, e2e test, end to end test, integration test, vitest test, playwright test, spec file, test coverage (+42 more) |
| `UAT` | acceptance criteria, click through, happy path, human test, manual test, test scenario, uat test, user acceptance test, user journey, TEST-AUTH (+31 more) |
| `VALIDATION` | already exists, already implemented, before i build, check if exists, codebase search, duplicate check, existing implementation, codebase, codebase check, conflict (+18 more) |
| `VALUATION` | acquisition target, company valuation, dcf analysis, exit strategy, fundraising round, series a, startup valuation, DCF, IPO, Series A (+20 more) |
| `VETTING` | vet, vetting, proposal, rubric, constitutional, aegis, governance check, compliance check, validate proposal, assess feedback (+14 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*



---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_CORE.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-07 9:17:27 AM*
*Protocol: 4.3.3*
