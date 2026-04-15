<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-04-15T13:11:58.994Z -->
<!-- git_commit: 33e08791 -->
<!-- db_snapshot_hash: a08c22f75efba9a2 -->
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

### Loading Strategy (Full-File)
1. **ALWAYS**: Read CLAUDE_CORE.md first (~10k) - compact enforcement rules
2. **Phase Detection**: Load phase-specific DIGEST file based on keywords
3. **Escalation**: Load FULL file only when digest is insufficient
4. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

### Digest vs Full File

| Situation | Load |
|-----------|------|
| Starting any SD work | CLAUDE_CORE.md (default) |
| Need detailed sub-agent config | CLAUDE_CORE.md (full) |
| Need detailed handoff procedures | CLAUDE_PLAN.md (full) |
| Complex debugging or unknown errors | Full phase file |
| ... | *(see full file for complete table)* |

### Escalation Triggers (When to Load Full Files)
- Gate validation fails and root cause is unclear
- Sub-agent invocation requires detailed configuration
- Handoff template structure needed
- Database schema constraint lookup required
- Retrospective or pattern analysis needed

### Phase Keywords -> File
| Keywords | Digest (Default) | Full (Escalation) |
|----------|-------------------|-------------------|
| "approve", "LEAD", "directive" | CLAUDE_LEAD.md | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation" | CLAUDE_PLAN.md | CLAUDE_PLAN.md |
| "implement", "EXEC", "code" | CLAUDE_EXEC.md | CLAUDE_EXEC.md |

### Issue -> Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Migration execution | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| ... | *(see full file for complete table)* |

### Context Budget (Full-File)
- Router + Core Digest: ~12k (6% of 200k budget)
- + Phase Digest: ~17k (9%)
- + Full file (if escalated): ~55k (28%)
- Savings vs always-full: ~75% per session

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
| ... | *(see full file for complete table)* |

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

*DIGEST generated: 2026-04-15 9:11:59 AM*
*Protocol: 4.3.3*
