# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** (Strategy) → **PLAN** (Architecture) → **EXEC** (Implementation).
Database is the source of truth. State lives in `strategic_directives_v2`, `product_requirements_v2`, and `sd_phase_handoffs`.

## Issue Resolution
When you encounter ANY issue: **STOP. Do not retry blindly. Do not work around it.**
Invoke the RCA Sub-Agent (`subagent_type="rca-agent"`). Your prompt MUST contain:
- **Symptom**: What IS happening. **Location**: Files/endpoints/tables. **Frequency**: Pattern/timing.
- **Prior attempts**: What you already tried. **Desired outcome**: Clear success criteria.

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## AUTO-PROCEED Mode

AUTO-PROCEED is **ON by default**. Phase transitions execute automatically, no confirmation prompts.
**Pause points** (even when ON): Orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked.

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |

## Work Item Routing

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
| **DRAFT** | New SD, needs LEAD approval to begin | **YES** - This is the normal starting point. Load CLAUDE_LEAD_DIGEST.md and run LEAD-TO-PLAN. |
| **READY** | Past LEAD phase, dependencies resolved | **YES** - Proceed to next handoff in workflow |
| **PLANNING** | In PLAN phase (PRD creation) | **YES** - Continue planning work |
| **EXEC N%** | In EXEC phase with progress | **YES** - Continue implementation |
| **BLOCKED** | Dependencies not resolved | **NO** - Work on blocking SDs first |
| **CLAIMED** | Another session is actively working on it | **NO** - Pick a different SD |

### After Running sd:next
1. If SD marked "CONTINUE" (is_working_on=true) and not CLAIMED by another session → Resume that SD
2. If no active SD → Pick the highest-ranked **workable** SD (any status except BLOCKED or CLAIMED)
3. **DRAFT SDs are the normal starting point** — they need LEAD approval. Load CLAUDE_LEAD_DIGEST.md.
4. READY SDs have already been approved — proceed to the next handoff in their workflow.
5. Prioritize: READY > EXEC > PLANNING > DRAFT (prefer SDs with existing momentum)

### Related Commands
| Command | Purpose |
|---------|---------|
| `npm run sd:next` | Show intelligent SD queue |
| `npm run sd:status` | Progress vs baseline |
| `npm run sd:burnrate` | Velocity and forecasting |
| `npm run sd:baseline view` | Current execution plan |

## Context Loading
Load the authoritative rules for your current phase:
- **Starting Work**: Read `CLAUDE_CORE_DIGEST.md`
- **LEAD Phase**: Read `CLAUDE_LEAD_DIGEST.md`
- **PLAN Phase**: Read `CLAUDE_PLAN_DIGEST.md`
- **EXEC Phase**: Read `CLAUDE_EXEC_DIGEST.md`
Escalate to full files (e.g. `CLAUDE_CORE.md`) only when digest is insufficient.

## Essential Commands
- **Pick Work**: `npm run sd:next`
- **Phase Handoff**: `node scripts/unified-handoff-system.js execute <PHASE> <SD-ID>`
- **Create SD**: `node scripts/leo-create-sd.js`
- **Create PRD**: `node scripts/add-prd-to-database.js`
- **LEO Stack**: `node scripts/cross-platform-run.js leo-stack restart|status|stop`

> Sub-agent routing and background execution rules are enforced by PreToolUse hooks. See `scripts/hooks/pre-tool-enforce.cjs`.

---
*Generated: 2026-02-20 1:40:12 PM | Protocol: LEO 4.3.3 | Source: Database*
