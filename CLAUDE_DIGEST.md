<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-06T17:50:58.021Z -->
<!-- git_commit: f0129748 -->
<!-- db_snapshot_hash: aeb9b0ee935da47e -->
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

### Loading Strategy
1. **ALWAYS**: Read CLAUDE_CORE.md first (15k)
2. **Phase Detection**: Load phase-specific file based on keywords
3. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

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

**Correct usage:**
```
Read tool: CLAUDE_EXEC.md (no limit parameter)
Read tool: docs/reference/database-agent-patterns.md (no limit parameter)
```

**Incorrect usage:**
```
Read tool: CLAUDE_EXEC.md with limit: 200  ← VIOLATION
Read tool: PRD file with limit: 100  ← VIOLATION
```

**Why this matters:** Critical instructions are often in later sections of files. Partial reads cause:
- Missed validation requirements
- Skipped sub-agent invocations
- Incomplete understanding of acceptance criteria
- Protocol violations

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
| Migration execution | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget
- Router + Core: 18k (9% of 200k budget) ✅
- + Phase file: 43k avg (22%) ✅
- + Reference doc: 58k (29%) ✅

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-06 12:50:58 PM*
*Protocol: 4.3.3*
