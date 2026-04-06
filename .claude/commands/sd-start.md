---
description: "Start work on a Strategic Directive: claim, validate status, load phase context. Use when user says /sd-start <SD-ID> or when starting any SD."
---

<!-- GENERATED: hash=d9aa628e7a3a timestamp=2026-04-03T13:56:55.719Z sections=6 -->

# SD Start — Claim, Validate, Load Context

**Purpose**: Execute the SD lifecycle startup sequence without drift.
This skill encodes the exact steps for claiming an SD, validating its status,
and loading the correct phase context. All steps use canonical scripts.

## Quick Reference

**CRITICAL**: Before running sd-start.js, you MUST pass the per-conversation CLAUDE_SESSION_ID
as an inline env var. Find it in the SessionStart hook output at the start of this conversation
(look for `CLAUDE_SESSION_ID=<uuid>`). This ensures each CC conversation has a unique identity.

```bash
# Claim and start SD — CLAUDE_SESSION_ID from SessionStart output
CLAUDE_SESSION_ID=<uuid> node scripts/sd-start.js <SD-ID>

# If worktree path shown in output, cd to it:
# cd <WORKTREE_CWD path>

# Then load phase context:
# Read tool: CLAUDE_CORE.md
# Read tool: CLAUDE_<PHASE>.md
```

**All subsequent node script invocations** (handoff.js, child-sd-preflight.js, etc.) must also
include `CLAUDE_SESSION_ID=<uuid>` as an inline env var prefix.

## Step-by-Step Protocol

### Session Start Verification (MANDATORY)

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

---

### Session Verification & Quick Start (MANDATORY)

## Session Start Checklist

### Required Verification
1. **Check Priority**: `npm run prio:top3`
2. **Git Status**: Clean working directory?
3. **Context Load**: CLAUDE_CORE.md + phase file

### ⚠️ MANDATORY: Read Entire Files (No Partial Reads)

**When reading any file that contains instructions, requirements, or critical context, you MUST read the ENTIRE file from start to finish.**

**General Rule**: If a file is important enough to read, read it completely. Partial reads lead to missed requirements.

**Files that MUST be read in full (no `limit` parameter):**
- CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
- PRD content from database
- Any file containing protocol instructions, requirements, or acceptance criteria
- Configuration files (.json, .yaml, .env.example)
- Test files when debugging failures
- Migration files when working on database changes

**When `limit` parameter IS acceptable:**
- Log files (reading recent entries)
- Large data files where you only need a sample
- Files explicitly marked as "preview only"

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

---

### Session Initialization - SD Selection

## Session Initialization - SD Selection

### Intent Detection Keywords
When the user says any of the following, run `npm run sd:next` FIRST:
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

---

### SD Continuation Truth Table

## SD Continuation Truth Table

**CRITICAL**: This table is AUTHORITATIVE for ALL SD transition decisions. It covers every transition type, not just orchestrator boundaries. When behavior is ambiguous, THIS TABLE WINS.

### Complete Transition Matrix

| Transition Context | AUTO-PROCEED | Chaining | Behavior | Implementation |
|-------------------|:------------:|:--------:|----------|----------------|
| **Handoff completes (not LEAD-FINAL-APPROVAL)** | * | * | **TERMINAL** - Phase work required before next handoff | `getNextInWorkflow()` returns null |
| Handoff completes (LEAD-FINAL-APPROVAL) | ON | * | **AUTO-CONTINUE** to next ready child (if orchestrator) | Child-to-child continuation |
| Handoff completes (LEAD-FINAL-APPROVAL) | OFF | * | PAUSE for user selection | User must invoke next handoff |
| **Child completes → next child** | ON | * | **AUTO-CONTINUE** to next ready child (priority-based) | `getNextReadyChild()` |
| Child completes → next child | OFF | * | PAUSE for user selection | User must invoke `/leo next` |
| **Child fails gate (retries exhausted)** | ON | * | **SKIP** to next sibling (D16) | `executeSkipAndContinue()` |
| Child fails gate (retries exhausted) | OFF | * | PAUSE with failure details | Manual remediation |
| **All children complete (orchestrator done)** | ON | ON | Run /learn → **AUTO-CONTINUE** to next orchestrator | `orchestrator-completion-hook.js` |
| All children complete (orchestrator done) | ON | OFF | Run /learn → Show queue → **PAUSE** (D08) | User selects next orchestrator |
| All children complete (orchestrator done) | OFF | * | PAUSE before /learn | Maximum human control |
| **All children blocked** | * | * | **PAUSE** - show blockers (D23) | Human decision required |
| **Dependency unresolved** | * | * | **SKIP** SD, continue to next ready | `checkDependenciesResolved()` |
| **Grandchild completes** | ON | * | Return to parent context, continue to next child | Hierarchical traversal |

### Phase Work Between Handoffs (D34 - Added 2026-02-06)

**ALL handoffs are terminal.** Phase work must happen between every handoff:

| After Handoff | Required Phase Work | Next Handoff |
|---------------|---------------------|--------------|
| LEAD-TO-PLAN | Create PRD via `add-prd-to-database.js` | PLAN-TO-EXEC |
| PLAN-TO-EXEC | Implement features (coding, testing) | EXEC-TO-PLAN |
| EXEC-TO-PLAN | Verify implementation (QA, review) | PLAN-TO-LEAD |
| PLAN-TO-LEAD | Final review, address feedback | LEAD-FINAL-APPROVAL |
| LEAD-FINAL-APPROVAL | (Triggers child-to-child continuation) | (Next child SD via AUTO-PROCEED) |

**Why handoffs are terminal:**
- Prevents skipping critical work (PRD creation, implementation, verification)
- Clarifies AUTO-PROCEED scope: child-to-child only, not handoff-to-handoff
- Aligns with original design intent

**SD-type-specific workflows** are defined in `workflow-definitions.js` (which handoffs are required/optional per type), not in auto-chaining logic.

### Key Rules

1. **AUTO-PROCEED OFF always pauses** - Chaining has no effect when AUTO-PROCEED is OFF
2. **Chaining only affects orchestrator-to-orchestrator transitions** - Child-to-child is controlled by AUTO-PROCEED alone
3. **All handoffs are terminal (D34)** - No auto-chaining within a single SD, phase work required between handoffs
4. **Priority determines next SD** - `sortByUrgency()` ranks by: Band (P0→P3) → Score → FIFO
5. **Dependencies gate readiness** - SD with unresolved deps is skipped, not paused on
6. **Both ON = no pauses except hard stops** - Runs until D23 (all blocked) or context exhaustion

### Next SD Selection Priority

When AUTO-PROCEED determines "next SD", selection follows this order:

```
1. Unblocked children of current orchestrator (by urgency score)
2. Unblocked grandchildren (depth-first, urgency-sorted)
3. Next orchestrator (if Chaining ON and current orchestrator complete)
4. PAUSE (if nothing ready or Chaining OFF at orchestrator boundary)
```

**Urgency Score Components** (from `urgency-scorer.js`):
- SD Priority (critical/high/medium/low): 25% weight
- Active issue patterns: 20% weight
- Downstream blockers: 15% weight
- Time sensitivity: 15% weight
- Learning signals: 40% blend
- Progress (≥80% complete): 10% bonus

### Decision Flow (Complete)

```
SD Completes (child, grandchild, or orchestrator)
         │
         ▼
   Is this a handoff completion (not LEAD-FINAL-APPROVAL)?
    │           │
   YES          NO (LEAD-FINAL-APPROVAL or child SD done)
    │           │
    │           └──► Continue below to check AUTO-PROCEED
    ▼
   TERMINAL - Show phase work guidance
   Example: "Create PRD, then run PLAN-TO-EXEC"
   PAUSE
         │
         ▼
   AUTO-PROCEED ON?
    │           │
   YES          NO
    │           └──► PAUSE (ask user to invoke /leo next)
    ▼
   Is this an orchestrator with all children done?
    │           │
   YES          NO (more children remain)
    │           │
    │           └──► getNextReadyChild() → Continue to next child
    ▼
   Run /learn automatically
         │
         ▼
   Chaining ON?
    │           │
   YES          NO
    │           └──► Show queue → PAUSE (D08)
    ▼
   findNextAvailableOrchestrator()
    │           │
   Found       Not Found
    │           └──► Show queue → PAUSE (no more work)
    ▼
   Auto-continue to next orchestrator
```

### Implementation Files

| Component | File | Key Function |
|-----------|------|--------------|
| Handoff termination | `scripts/modules/handoff/cli/cli-main.js` | `getNextInWorkflow()` (always returns null) |
| Child selection | `scripts/modules/handoff/child-sd-selector.js` | `getNextReadyChild()` |
| Skip failed child | `scripts/modules/handoff/skip-and-continue.js` | `executeSkipAndContinue()` |
| Orchestrator completion | `scripts/modules/handoff/orchestrator-completion-hook.js` | `executeOrchestratorCompletionHook()` |
| Urgency scoring | `scripts/modules/auto-proceed/urgency-scorer.js` | `sortByUrgency()` |
| Dependency check | `scripts/modules/sd-next/dependency-resolver.js` | `checkDependenciesResolved()` |
| Mode resolution | `scripts/modules/handoff/auto-proceed-resolver.js` | `resolveAutoProceed()` |
| SD-type workflows | `scripts/modules/handoff/cli/workflow-definitions.js` | `getWorkflowForType()` |

### Conflict Resolution

If documentation elsewhere conflicts with this truth table:
1. **This truth table wins** - It is the canonical specification
2. **Report the conflict** - Create an issue or RCA to fix inconsistent text
3. **Never guess** - When behavior is ambiguous, consult this table

### Historical Notes

**2026-02-06 (v3)**: D34 added - All handoffs are terminal (no auto-chaining within SD). Added phase work guidance table. Previous auto-chaining behavior (LEAD-TO-PLAN → PLAN-TO-EXEC) removed as it skipped PRD creation.

**2026-02-01 (v2)**: Expanded to cover ALL transition types, not just orchestrator boundaries. Added child-to-child and grandchild transitions.

**2026-02-01 (v1)**: D08 was written as absolute rule without Chaining exception. Added orchestrator completion matrix.


---

### 5-Phase Strategic Directive Workflow

## LEO 5-Phase Workflow

### Phase Overview
| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | LEAD Approval | LEAD | Strategic alignment, simplicity check |
| 2 | PLAN (PRD) | PLAN | PRD complete, validation gates pass |
| 3 | EXEC (Implementation) | EXEC | Code complete, tests pass |
| 4 | PLAN Verification | PLAN | No stubs, integration verified |
| 5 | LEAD Final Approval | LEAD | Ready for merge |

### Phase Transitions
- Each phase must complete before next begins
- Progress tracked in `strategic_directives.progress` JSONB
- No skipping phases

### Key Commands
- Check status: `SELECT * FROM v_sd_progress WHERE sd_id = 'SD-XXX'`
- View gates: `SELECT * FROM sd_validation_results WHERE sd_id = 'SD-XXX'`

---

### Child SD Context Loading (MANDATORY)

## Child SD Context Loading (MANDATORY)

**CRITICAL**: When starting work on a child SD (any SD with a parent_sd_id), you MUST load context files before beginning work.

### Why This Applies to Children

Child SDs are **independent Strategic Directives** that require their own full LEAD→PLAN→EXEC workflow. Each child:
- Has its own PRD
- Has its own handoffs
- Has its own retrospective
- Must meet its own gate thresholds

**Children are NOT sub-tasks.** They are first-class SDs that happen to be coordinated by a parent orchestrator.

### Required Context Loading Sequence

Before starting ANY work on a child SD:

1. **Run child preflight validation**:
   ```bash
   node scripts/child-sd-preflight.js SD-XXX-001
   ```

2. **Read CLAUDE_CORE.md** (provides SD type requirements):
   ```
   Read tool: CLAUDE_CORE.md
   ```

3. **Read phase-specific file** based on current_phase:
   | Phase | File |
   |-------|------|
   | LEAD_APPROVAL | CLAUDE_LEAD.md |
   | PLAN_*, PRD_* | CLAUDE_PLAN.md |
   | EXEC_*, IMPLEMENTATION_* | CLAUDE_EXEC.md |

### What CLAUDE_CORE.md Provides

- SD type definitions (feature, bugfix, infrastructure, etc.)
- Gate pass thresholds per SD type
- Required handoff counts
- Required sub-agents per SD type
- Global negative constraints

### Consequences of Skipping Context Loading

Without loading CLAUDE_CORE.md before child SD work:
- **Unknown requirements**: May not know PRD is required
- **Wrong thresholds**: May target 70% when 85% is required
- **Missing sub-agents**: May skip TESTING, DESIGN, etc.
- **Incomplete handoffs**: May not execute full chain

### Enforcement

The `child-sd-preflight.js` script now displays a reminder:
```
⚠️  CONTEXT LOADING REMINDER:
   Before starting work, you MUST read:
   1. CLAUDE_CORE.md (SD type requirements, gates, thresholds)
   2. Phase-specific file (CLAUDE_LEAD.md, CLAUDE_PLAN.md, or CLAUDE_EXEC.md)
```

**This reminder is advisory.** The actual context loading must be performed by reading the files.

### Quick Reference

| Child SD Type | Gate Threshold | Min Handoffs | PRD Required |
|---------------|----------------|--------------|--------------|
| feature | 85% | 5 | YES |
| bugfix | 85% | 5 | YES |
| infrastructure | 80% | 4 | YES |
| documentation | 60% | 4 | NO |
| refactor | 75-90% | 5 | Brief |

*Always verify current requirements from CLAUDE_CORE.md as they may be updated.*

## Canonical Scripts (NEVER bypass these)
- `node scripts/sd-start.js <SD-ID>` — Claim + status check + worktree
- `node scripts/handoff.js execute <PHASE> <SD-ID>` — Phase transitions
- `node scripts/child-sd-preflight.js <SD-ID>` — Child SD validation
- `node scripts/orchestrator-preflight.js <SD-ID>` — Orchestrator preflight

## Anti-Drift Rules
1. ALWAYS run sd:start before any work (never query DB directly for claims)
2. ALWAYS cd to worktree path if shown in output
3. ALWAYS read CLAUDE_CORE.md + phase-specific file before coding
4. NEVER skip child-sd-preflight for child SDs
5. NEVER skip orchestrator-preflight for orchestrator SDs
