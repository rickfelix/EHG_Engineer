<!-- Archived from: docs/plans/memory-reindex-plan.md -->
<!-- SD Key: SD-LEO-REFAC-PLAN-MEMORY-INDEX-001 -->
<!-- Archived at: 2026-04-24T20:15:39.669Z -->

# SD Plan — MEMORY.md Re-Index Under 15KB Budget

## Type
infra

## Priority
medium

## Problem

`MEMORY.md` (the auto-memory index loaded into every session's context) has exceeded its 24.4KB cap. System reminders now fire in every session: *"MEMORY.md is 25KB (limit: 24.4KB) — index entries are too long. Only part of it was loaded."*

**Root cause:** index entries average 250–300 characters where the documented target is ~150 chars. Multiple entries cover overlapping topics (claim lifecycle, auto-proceed discipline, tool-use constraints, LEO-INFRA project status) but are not clustered into topic files.

**Impact:** Index truncation means sessions operate with partial memory context. The most recently-added entries (often the most relevant) may be the ones dropped.

## Evidence

- Current MEMORY.md: ~25KB (over 24.4KB cap).
- Observed truncation warning in 2026-04-24 session contexts.
- Visible in this conversation: 63+ index lines, many 250+ chars.
- No information in individual memory files is lost — only the index is over-budget.

**Memory reference:** The system-reminder warning itself, visible when MEMORY.md exceeds the soft cap.

## Functional Requirements

- **FR-1** — New script `scripts/memory/reindex.mjs` invoked via `npm run memory:reindex`:
  - Reads all memory files in the user's memory directory
  - Groups by common filename prefix (e.g., `feedback_auto_proceed_*`, `feedback_claim_*`, `feedback_tool_*`, `project_sd_leo_infra_*`)
  - For any group with ≥3 entries, creates a topic file that lists member entries with one-line summaries
  - Rewrites MEMORY.md with one-line index entries, each ≤120 characters
- **FR-2** — Preview mode (`npm run memory:reindex -- --preview`) shows proposed diff without writing files.
- **FR-3** — Preservation: no memory content is deleted, modified, or merged. Only the INDEX is restructured. Topic files are additive.
- **FR-4** — Output target: `MEMORY.md` ≤ 15KB (buffer below the 24.4KB hard cap).
- **FR-5** — Topic files carry `type: topic` in frontmatter with a list of member-memory links.
- **FR-6** — Idempotency: running the script twice produces the same output (stable ordering, no growth).
- **FR-7** — Dry-run exit code: nonzero if any single group would still exceed budget after clustering (signals manual intervention needed).

## Technical Requirements

- **TR-1** — Unit test: no content loss. Assert that every fact in every memory file pre-run is still reachable post-run (either directly from MEMORY.md or transitively via a topic-file link).
- **TR-2** — Integration test against a fixture directory with 50+ simulated memory files across 8 topic prefixes; assert MEMORY.md output is ≤15KB and topic files are well-formed.
- **TR-3** — Byte-count regression: MEMORY.md post-reindex must be ≤15KB (fail build if not).
- **TR-4** — Idempotency test: run script twice, assert zero diff between runs.

## Scope

**in_files:**
- `scripts/memory/reindex.mjs` (new)
- `scripts/memory/clustering.mjs` (new — prefix-grouping logic)
- `package.json` (add `memory:reindex` npm script)
- `tests/memory/reindex.test.mjs` (new)
- `tests/memory/fixtures/` (new — simulated memory corpus)

**out_files:**
- User's live `memory/*.md` files — NOT modified by this SD's code; only the operator's one-time run of the script touches them, and only additively
- `CLAUDE*.md` — no changes
- `scripts/hooks/*` — no changes
- `scripts/learn/*` — no changes

## Size Estimate

150–200 LOC (Tier 3 — full SD workflow per CLAUDE.md Work Item Routing).

## Acceptance Criteria

1. After `npm run memory:reindex`, `MEMORY.md` on the user's current memory directory is ≤15KB.
2. No memory file's content is modified by the script.
3. Topic files are created for every prefix group with ≥3 entries.
4. Every index line in MEMORY.md is ≤120 chars.
5. All 4 TRs pass in CI.
6. Running the script twice in a row produces zero diff.

## Non-Goals

- Changing the memory creation flow (existing auto-memory rules in CLAUDE.md Section `# auto memory` stay unchanged).
- Automatic consolidation on every session start (re-index is an explicit operator command).
- Deleting stale memories (separate concern; handled by future expires_at / verified_at fields from Module D of the larger harness refactor).
- Migrating memory frontmatter schema (also Module D, separate SD).

## Operational Notes

- First run may produce a large diff in MEMORY.md as ~60 individual entries collapse into ~15–20 topic lines. This is expected.
- Users who prefer flat memory organization can skip the script; it is opt-in via npm command, not a hook.
- Integrates cleanly with a future Module D (memory frontmatter validation) since topic files would inherit the same `verified_against` / `expires_at` fields.
