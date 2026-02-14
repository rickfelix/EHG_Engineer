<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-14T12:50:42.761Z -->
<!-- git_commit: 4759585d -->
<!-- db_snapshot_hash: 09759431152b1c6f -->
<!-- file_content_hash: pending -->

# CLAUDE_DIGEST.md - LEO Protocol Router (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: Minimal router for gate enforcement (<3k chars)

---

## Context Loading Strategy

1. **Default**: Load DIGEST files for gate checks
2. **On-demand**: Load FULL files only when `needs_full_protocol=true`
3. **Override**: Set `CLAUDE_PROTOCOL_MODE=full` to always use FULL files

### File Loading Priority
| Phase | Primary (DIGEST) | Fallback (FULL) |
|-------|------------------|-----------------|
| ALL | CLAUDE_CORE_DIGEST.md | CLAUDE_CORE.md |
| LEAD | CLAUDE_LEAD_DIGEST.md | CLAUDE_LEAD.md |
| PLAN | CLAUDE_PLAN_DIGEST.md | CLAUDE_PLAN.md |
| EXEC | CLAUDE_EXEC_DIGEST.md | CLAUDE_EXEC.md |

## Context Router & Loading Strategy

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

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`

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

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-14 7:50:42 AM*
*Protocol: 4.3.3*
