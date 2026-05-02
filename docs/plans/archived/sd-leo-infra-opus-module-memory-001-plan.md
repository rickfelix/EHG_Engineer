<!-- Archived from: docs/plans/opus47-module-d-memory-validation-frontmatter-plan.md -->
<!-- SD Key: SD-LEO-INFRA-OPUS-MODULE-MEMORY-001 -->
<!-- Archived at: 2026-04-24T20:15:22.011Z -->

# SD — Opus 4.7 Module D: Memory Validation Frontmatter

## Type
infrastructure

## Priority
medium

## Problem

Bug-specific memories (line numbers, file paths, SHAs) go stale silently when upstream fixes land. 2026-04-24 incident: almost-filed a duplicate QF for a bug fixed 21 commits earlier on main because the memory's cited line numbers were no longer applicable. Memory `feedback_verify_memory_before_applying_bugfix.md` captures the behavioral rule ("verify against current HEAD before applying"), but the rule is enforced by prompt, not by the memory schema.

Opus 4.7's literal-instruction profile means self-verification is more consistent than 4.6, but it still depends on the model remembering to check. A schema-level signal (`verified_against`, `expires_at`) converts the discipline into a filter: stale memories get flagged at retrieval time rather than at apply time.

## Scope Context

Memory files live in `~/.claude/projects/<repo>/memory/` with YAML frontmatter. The frontmatter currently has `name`, `description`, `type`. This SD adds four optional fields governing verification state. Memories written without the fields continue to work; memories with the fields get retrieval-time guardrails.

## Functional Requirements

### FR-1 — Frontmatter Fields
Add four optional fields to memory frontmatter:
- `verified_against` — git SHA the memory was last verified against (e.g., `fc8262a325`)
- `verified_at` — ISO date of last verification
- `specificity` — one of `general` | `file-level` | `line-level`
- `expires_at` — ISO date after which the memory needs re-verification (30 days line-level, 90 days file-level, 365 days general)

### FR-2 — Frontmatter Parser
A small utility `scripts/modules/memory/frontmatter.js` that:
- parses memory files
- computes `is_expired` from `expires_at`
- computes `verification_age_days`
- exposes `formatMemoryCitation(memory)` returning `"<title> (verified against <sha>, <age>d ago)"` or `"<title> ⚠️ verification expired"` for expired memories.

### FR-3 — CLAUDE.md Retrieval Guard Rule
Update CLAUDE.md (via DB section) with a new rule block: "Before recommending from memory with specificity=line-level or file-level: verify the cited path/function/line exists at current HEAD. Output 'verified against <sha>' before acting. If memory is expired, verify and then update its `verified_against` + `verified_at` before relying on it."

### FR-4 — MEMORY.md Index Enhancer
Update `MEMORY.md` generation so expired memories show a ⚠️ prefix. Requires a lightweight generator (new) that reads all memory files and rewrites the index with flags. Fail-soft: runs on each memory write but exits clean on error.

### FR-5 — Regression Test
- Parser returns correct `is_expired` across boundary cases (exact `expires_at`, 1 day before, 1 day after).
- `formatMemoryCitation` outputs the expected strings.
- Fixtures for each specificity level.

## Technical Approach

1. Add parser + citation formatter.
2. Write migration updating CLAUDE.md retrieval guard section (via `leo_protocol_sections`).
3. Backfill existing memories: add `specificity` field to the ~60 memories listed in MEMORY.md (best-effort — infer from content; `general` for user/project/reference types, `file-level` or `line-level` for feedback citing code).
4. Tests.

## Scope

**in_files:**
- `scripts/modules/memory/frontmatter.js` (new)
- `scripts/modules/memory/index-generator.js` (new)
- `database/migrations/YYYYMMDD_opus47_module_d_memory_validation_frontmatter.mjs` (new)
- `tests/memory/frontmatter.test.js` (new)
- `~/.claude/projects/<repo>/memory/*.md` (backfill, opt-in per file)

**out_files:**
- Any file outside the above.

## Acceptance Criteria

1. Parser correctly identifies expired memories in test fixtures.
2. CLAUDE.md contains the Memory Validation Guard rule block.
3. At least 10 high-frequency memories (the ones cited most in session retros) are backfilled with `specificity` + `verified_against`.
4. Retrospective shows zero ghost-bug duplicate QFs filed in the next 30 days (tracked via `feedback_check_origin_before_qf.md` recurrence count).
5. Regression test `tests/memory/frontmatter.test.js` passes.

## Non-Goals

- Rewriting all 60 memory files with full backfill (opt-in per memory; focus on the ones with code citations).
- Automatic re-verification (manual for this SD; a future SD can automate).
- Changing how memories are stored on disk.

## References

- Source analysis: `.claude/session-module-refactor-opus47.md` Module D
- Parent SD: SD-LEO-FIX-PLAN-OPUS-HARNESS-001 (shipped 2026-04-24)
- Memory: `feedback_verify_memory_before_applying_bugfix.md`
- Memory: `feedback_check_origin_before_qf.md`

## Size Estimate

150–250 LOC across parser + generator + migration + test + selective backfill. Tier 3 — full SD workflow.
