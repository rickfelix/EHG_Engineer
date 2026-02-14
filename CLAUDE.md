# CLAUDE.md - LEO Protocol Context Router

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

### Sub-Agent Prompt Quality Standard (Five-Point Brief)

**CRITICAL**: The prompt you write when spawning ANY sub-agent is the highest-impact point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

Every sub-agent invocation MUST include these five elements:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | Observable behavior (what IS happening) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, DB tables involved | "routes/users.js line 45, lib/queries/user-lookup.js" |
| **Frequency** | How often, when it started, pattern | "Started 2h ago, every 3rd request fails" |
| **Prior attempts** | What was already tried (so agent doesn't repeat) | "Server restart didn't help, DNS is fine" |
| **Desired outcome** | What success looks like | "Identify root cause, propose fix with <30min implementation" |

**Anti-patterns** (NEVER do these):
- ❌ "Analyze why [issue] is occurring" — too vague, agent has nothing to anchor on
- ❌ Dumping entire conversation context — unrelated tokens waste investigation capacity
- ❌ Omitting prior attempts — agent repeats your failed approaches

**Example invocation (GOOD - RCA agent):**
```
Task tool with subagent_type="rca-agent":
"Symptom: SD cannot be marked completed. DB trigger rejects with 'Progress: 20% (need 100%)'.
Location: get_progress_breakdown() function, trigger on strategic_directives_v2, UUID: 7d2aa25e
Frequency: 6th child of orchestrator. First 5 siblings completed. Only this one stuck.
Prior attempts: Direct status update blocked. Checked sd_phase_handoffs — empty for all siblings.
Desired outcome: Identify what mechanism marked sibling phases complete, apply same to this SD."
```

**Example invocation (BAD - too vague):**
```
Task tool with subagent_type="rca-agent":
"Analyze why the SD completion is failing. Perform 5-whys analysis and identify the root cause."
```

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in `issue_patterns` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**

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
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## AUTO-PROCEED Mode (Summary)

AUTO-PROCEED is **ON by default**. Phase transitions execute automatically, no confirmation prompts.

| When ON | When OFF |
|---------|----------|
| Auto phase transitions | Pause and ask |
| Post-completion: /document then /ship then /learn | Ask before each |
| No confirmation prompts | AskUserQuestion at each decision |

**Pause points** (even when ON): Orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked.

**Check**: `node -e "require('dotenv').config();const{createClient}=require('@supabase/supabase-js');createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).from('claude_sessions').select('metadata').eq('status','active').order('heartbeat_at',{ascending:false}).limit(1).single().then(({data})=>console.log('AUTO_PROCEED='+(data?.metadata?.auto_proceed??true)))"`

**CRITICAL**: When AUTO-PROCEED is ON, NEVER use `run_in_background: true` on Bash or Task tools.

*Full details: CLAUDE_CORE.md → auto_proceed_mode section*

## SD Continuation (Summary)

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |

**Key rules**: All handoffs are terminal (D34). Priority determines next SD. Dependencies gate readiness.

*Full truth table: CLAUDE_CORE.md → sd_continuation_truth_table section*

## Work Item Routing (Summary)

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords (auth, migration, schema, feature) always force Tier 3.

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
2. **SD Status Badges** - Current state of each SD (see legend below)
3. **Continuity** - Recent git activity and "Working On" flag
4. **Recommendations** - Suggested starting point per track

### SD Status Badge Legend
| Badge | Meaning | Workable? |
|-------|---------|-----------|
| **DRAFT** | New SD, needs LEAD approval to begin | **YES** - This is the normal starting point. Load CLAUDE_LEAD.md and run LEAD-TO-PLAN. |
| **READY** | Past LEAD phase, dependencies resolved | **YES** - Proceed to next handoff in workflow |
| **PLANNING** | In PLAN phase (PRD creation) | **YES** - Continue planning work |
| **EXEC N%** | In EXEC phase with progress | **YES** - Continue implementation |
| **BLOCKED** | Dependencies not resolved | **NO** - Work on blocking SDs first |
| **CLAIMED** | Another session is actively working on it | **NO** - Pick a different SD |

### After Running sd:next
1. If SD marked "CONTINUE" (is_working_on=true) and not CLAIMED by another session → Resume that SD
2. If no active SD → Pick the highest-ranked **workable** SD (any status except BLOCKED or CLAIMED)
3. **DRAFT SDs are the normal starting point** — they need LEAD approval. Load CLAUDE_LEAD.md.
4. READY SDs have already been approved — proceed to the next handoff in their workflow.
5. Prioritize: READY > EXEC > PLANNING > DRAFT (prefer SDs with existing momentum)

### Related Commands
| Command | Purpose |
|---------|---------|
| `npm run sd:next` | Show intelligent SD queue |
| `npm run sd:status` | Progress vs baseline |
| `npm run sd:burnrate` | Velocity and forecasting |
| `npm run sd:baseline view` | Current execution plan |

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
**Last Generated**: 2026-02-14 8:45:39 AM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## CURRENT LEO PROTOCOL VERSION: 4.3.3

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-3-3-ui-parity
**Status**: ACTIVE
**Title**: LEO Protocol v4.3.3 - UI Parity Governance

## CLAUDE.md Router (Context Loading)

### Loading Strategy (Digest-First)
1. **ALWAYS**: Read CLAUDE_CORE_DIGEST.md first (~10k) - compact enforcement rules
2. **Phase Detection**: Load phase-specific DIGEST file based on keywords
3. **Escalation**: Load FULL file only when digest is insufficient
4. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE_DIGEST.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

### Digest vs Full File

| Situation | Load |
|-----------|------|
| Starting any SD work | CLAUDE_CORE_DIGEST.md (default) |
| Need detailed sub-agent config | CLAUDE_CORE.md (full) |
| Need detailed handoff procedures | CLAUDE_PLAN.md (full) |
| Complex debugging or unknown errors | Full phase file |
| Everything else | DIGEST files |

### Escalation Triggers (When to Load Full Files)
- Gate validation fails and root cause is unclear
- Sub-agent invocation requires detailed configuration
- Handoff template structure needed
- Database schema constraint lookup required
- Retrospective or pattern analysis needed

### Phase Keywords -> File
| Keywords | Digest (Default) | Full (Escalation) |
|----------|-------------------|-------------------|
| "approve", "LEAD", "directive" | CLAUDE_LEAD_DIGEST.md | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation" | CLAUDE_PLAN_DIGEST.md | CLAUDE_PLAN.md |
| "implement", "EXEC", "code" | CLAUDE_EXEC_DIGEST.md | CLAUDE_EXEC.md |

### Issue -> Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Migration execution | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget (Digest-First)
- Router + Core Digest: ~12k (6% of 200k budget)
- + Phase Digest: ~17k (9%)
- + Full file (if escalated): ~55k (28%)
- Savings vs always-full: ~75% per session

## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
| `ANALYTICS` | analytics tracking, conversion tracking, funnel analysis (+31 more) |
| `API` | add endpoint, api design, api endpoint (+44 more) |
| `CRM` | contact management, crm system, customer relationship (+21 more) |
| `DATABASE` | EXEC_IMPLEMENTATION_COMPLETE, add column, alter table (+91 more) |
| `DEPENDENCY` | dependency update, dependency vulnerability, npm audit (+36 more) |
| `DESIGN` | a11y, accessibility, component design (+74 more) |
| `DOCMON` | DAILY_DOCMON_CHECK, EXEC_COMPLETION, EXEC_IMPLEMENTATION (+37 more) |
| `FINANCIAL` | burn rate, cash flow analysis, financial model (+28 more) |
| `GITHUB` | EXEC_IMPLEMENTATION_COMPLETE, LEAD_APPROVAL_COMPLETE, PLAN_VERIFICATION_PASS (+40 more) |
| `LAUNCH` | deploy to production, go live checklist, launch checklist (+27 more) |
| `MARKETING` | brand awareness, content marketing, go to market (+27 more) |
| `MONITORING` | alerting system, application monitoring, datadog (+30 more) |
| `PERFORMANCE` | bottleneck, cpu usage, load time (+34 more) |
| `PRICING` | cac ltv, pricing model, pricing page (+26 more) |
| `QUICKFIX` | easy fix, hotfix, minor fix (+20 more) |
| `RCA` | 5 whys, causal analysis, ci_pipeline_failure (+53 more) |
| `REGRESSION` | api signature, backward compatible, backwards compatible (+41 more) |
| `RETRO` | LEAD_APPROVAL_COMPLETE, LEAD_REJECTION, PLAN_VERIFICATION_COMPLETE (+56 more) |
| `RISK` | architecture decision, high risk, pros and cons (+86 more) |
| `SALES` | close deal, objection handling, sales cycle (+24 more) |
| `SECURITY` | api key exposed, authentication bypass, csrf vulnerability (+41 more) |
| `STORIES` | acceptance criteria, as a user, definition of done (+30 more) |
| `TESTING` | EXEC_IMPLEMENTATION_COMPLETE, add tests, create tests (+49 more) |
| `UAT` | acceptance criteria, click through, happy path (+38 more) |
| `VALIDATION` | already exists, already implemented, before i build (+25 more) |
| `VALUATION` | acquisition target, company valuation, dcf analysis (+27 more) |
| `VETTING` | vet, vetting, proposal (+21 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*


---

*Router generated from database: 2026-02-14*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*
