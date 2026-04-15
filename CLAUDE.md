# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** (Strategy) → **PLAN** (Architecture) → **EXEC** (Implementation).
Database is the source of truth. State lives in `strategic_directives_v2`, `product_requirements_v2`, and `sd_phase_handoffs`.
> Why: The DB enforces schema constraints and tracks every state transition. It's the only source all sessions, agents, and gates share — markdown files drift silently and can't be queried by the gate pipeline.

## Issue Resolution
When you encounter ANY issue: **STOP. Do not retry blindly. Do not work around it.**
> Why: Blind retries mask root causes and waste context. Workarounds leave the underlying defect in place, guaranteeing it recurs. The RCA sub-agent surfaces systemic fixes — not band-aids.
Invoke the RCA Sub-Agent (`subagent_type="rca-agent"`). Your prompt MUST contain:
- **Symptom**: What IS happening. **Location**: Files/endpoints/tables. **Frequency**: Pattern/timing.
- **Prior attempts**: What you already tried. **Desired outcome**: Clear success criteria.

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
> Why: Each phase produces a gate-validated artifact (strategic intent → PRD → code). Skipping phases means the next gate has no artifact to validate against, causing failures that are expensive to unwind.
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
> Why: Sub-agents run formal, database-backed gate checks stored in `sub_agent_execution_results`. Handoff gates query this table — without sub-agent runs, gates block regardless of actual code quality.
3. **Database-first** - No markdown files as source of truth
> Why: Markdown files drift silently and are never validated. The DB enforces schema constraints, tracks state transitions, and is the only source future sessions can query reliably to resume work.
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
> Why: `handoff.js` and `add-prd-to-database.js` run the full gate pipeline and write canonical phase state to the DB. Bypassing them skips validation, leaves DB state inconsistent, and produces false-pass handoffs that corrupt downstream phases.
5. **Small PRs** - Target ≤100 lines, max 400 with justification
> Why: Large PRs fail review at higher rates, introduce more merge conflicts, and are harder to roll back. Retrospective analysis shows ≤100 LOC correlates with faster cycle time and fewer post-merge defects.
6. **Priority-first** - Use `npm run prio:top3` to justify work
> Why: Without priority justification, the highest-ROI SD can be overlooked in favour of something familiar. `prio:top3` enforces objective ordering, not recency ordering.
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`
> Why: CLAUDE.md is auto-generated from the DB. Operating on a stale file means reading outdated rules without knowing it — the session follows a protocol that has since been superseded.

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## AUTO-PROCEED Mode

AUTO-PROCEED is **ON by default**. Phase transitions execute automatically, no confirmation prompts.
> Why: The user approved the SD. Every unnecessary pause adds friction without adding value — AUTO-PROCEED respects that approval by eliminating confirmation theater.

**Pause points** (even when ON): Orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked.
> Why: These are the only states where user input can actually change the outcome. All others are decisions the orchestrator is authorized and expected to make autonomously.

**NOT pause triggers**: scope size, "substantial" upcoming work, decomposition into multiple children, PRD creation, large refactors, "warrants confirmation". Phase boundaries are NOT pause points. If your reason isn't in the list above, KEEP WORKING.
> Why: Each item on this list is a judgment call the orchestrator is empowered to make without escalation. Pausing on these trains the user to expect interruptions and undermines the AUTO-PROCEED contract.

Asking "want me to continue or pause here?" at a phase transition is a protocol violation.
> Why: Confirmation-fishing is the most common AUTO-PROCEED failure mode. Naming it explicitly as a violation prevents the LLM from treating asking as a safe default when uncertain.

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |

> Why (TERMINAL): A non-final handoff means gate-validated state must be written to the DB before the next phase begins. Skipping this orphans the SD — the next session finds no handoff record and cannot determine what was approved or completed.

## Work Item Routing

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords (auth, migration, schema, feature) always force Tier 3.
> Why: These change classes carry disproportionate blast radius — auth bugs cause security incidents, schema changes can corrupt data, and feature work needs full stakeholder visibility. Tier 3 ensures the gate pipeline (TESTING, SECURITY, GITHUB sub-agents) always runs for them.

## Session Initialization - SD Selection

### Intent Detection Keywords
When the user says any of the following, run `npm run sd:next` FIRST:
> Why: Without checking the queue first, the session may pick up stale context from a session summary or start the wrong SD. `sd:next` is the only authoritative source of current state — what's claimed, what's blocked, and which SD has momentum.
- "start LEO", "start the LEO protocol"
- "what should we work on", "what's next"
- "identify next work", "next SD", "next strategic directive"
- "continue work", "resume", "pick up where we left off"
- "show queue", "show priorities", "what's ready"

### Claim Management Keywords
When the user mentions any of the following, invoke /claim (or suggest it):
- "claim status", "my claim", "what am I working on", "what's claimed"
- "release claim", "release SD", "free SD", "unclaim", "drop claim"
- "who has", "who is working on", "active claims", "active sessions", "show claims"
- "claim stuck", "claim conflict", "stale claim", "claimed by another"
- "claim list", "list claims", "all claims"

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

## Context Loading
Load the authoritative rules for your current phase:
- **Starting Work**: Read `CLAUDE_CORE.md`
- **LEAD Phase**: Read `CLAUDE_LEAD.md`
- **PLAN Phase**: Read `CLAUDE_PLAN.md`
- **EXEC Phase**: Read `CLAUDE_EXEC.md`
> Why: Each phase file contains gate requirements, anti-patterns, and sub-agent triggers specific to that phase. Reading the wrong file (or none) means operating without the relevant constraints — the most common cause of handoff failures is a gate requirement that wasn't loaded.
Use `*_DIGEST.md` variants only when context is constrained (e.g. smaller models, near token limits).
> Why: Full phase files can exceed token budgets on smaller models. The DIGEST variants preserve the critical rules at ~85% compression — enough to pass gates, not enough to catch every edge case.

## Essential Commands
- **Pick Work**: `npm run sd:next`
- **Phase Handoff**: `node scripts/handoff.js execute <PHASE> <SD-ID>`
- **Create SD**: `node scripts/leo-create-sd.js`
- **Create PRD**: `node scripts/add-prd-to-database.js`
- **LEO Stack**: `node scripts/cross-platform-run.js leo-stack restart|status|stop`

> Sub-agent routing and background execution rules are enforced by PreToolUse hooks. See `scripts/hooks/pre-tool-enforce.cjs`.

---
*Generated: 2026-04-15 9:19:17 AM | Protocol: LEO 4.3.3 | Source: Database*
