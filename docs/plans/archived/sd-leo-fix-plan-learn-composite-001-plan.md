<!-- Archived from: docs/plans/learn-noise-filter-plan.md -->
<!-- SD Key: SD-LEO-FIX-PLAN-LEARN-COMPOSITE-001 -->
<!-- Archived at: 2026-04-24T20:15:33.474Z -->

# SD Plan — /learn Composite Scorer Noise Filter

## Type
infra

## Priority
medium

## Problem

`/learn` auto-approves LEARN-FIX SDs based on composite score (`occurrence × severity`) without filtering out known-noise sources. This produces filed-then-cancelled SDs that consume session time with zero shipped value.

**Filter gaps in the current scorer:**
- `source=auto_rca` — CI auto-captures often lack substance (literal "failure" strings, no description/stack)
- `auto_captured=true` without `human_reviewed=true` — raw RCA events shouldn't auto-promote to SDs
- `assigned_sd_id IS NOT NULL` — pattern already addressed by an open or shipped SD
- Fingerprints matching SD UUID format — "ghost patterns" where the fingerprint IS the SD UUID, not a real signal

## Evidence

Three cancelled LEARN-FIX SDs in the 48-hour window 2026-04-22 → 2026-04-24:

| SD | Cancellation reason |
|---|---|
| SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-128 | All cited root causes already fixed (QF-20260423-666, QF-20260422-862, LEARN-126 Phase 3, QF-20260422-740) |
| SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-130 | Google API key auto_rca noise (PAT-AUTO-ca8409ef, occurrence=58, pure noise) |
| SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-131 | Referenced non-existent PAT-HF-LEADTOPLAN-fecb45e8; fingerprint was SD UUID |

**Memory reference:** `feedback_learn_auto_approve_noise_filter_gap.md`

## Functional Requirements

- **FR-1** — `/learn` composite scorer restricts input set to `source IN ('retrospective', 'feedback')` only. Exclude `auto_rca`.
- **FR-2** — Exclude patterns where `auto_captured=true AND human_reviewed=false`.
- **FR-3** — Exclude patterns where `assigned_sd_id IS NOT NULL` and the referenced SD is in `(draft, planning, executing, completed)` status.
- **FR-4** — Validate fingerprint format; reject if it matches the UUID regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (ghost-pattern detection).
- **FR-5** — Log filtered-out patterns (with reason) to `/learn` run output for visibility and debugging.
- **FR-6** — Expose a `--no-filter` escape hatch for operator debugging (off by default).

## Technical Requirements

- **TR-1** — Unit tests: one per filter (FR-1 through FR-4).
- **TR-2** — Integration test with fixture containing a mix of noise + ghost + already-assigned + valid patterns; assert only valid pass through.
- **TR-3** — Regression test: shipped retro-derived patterns (e.g., PAT-HF-EXECTOPLAN-a14ec7de from LEARN-126) must still score and file.
- **TR-4** — Bench: scorer runtime must not regress >10% (filter adds DB lookup per pattern).

## Scope

**in_files:**
- `scripts/learn/scorer.mjs` (or equivalent composite-score code path)
- `scripts/learn/filter.mjs` (new)
- `tests/learn/filter.test.mjs` (new)
- `tests/learn/scorer.test.mjs` (regression)

**out_files:**
- `CLAUDE*.md` — no changes
- `scripts/handoff.js` — no changes
- Any file under `scripts/hooks/` — no changes

## Size Estimate

100–150 LOC (Tier 3 — full SD workflow per CLAUDE.md Work Item Routing).

## Acceptance Criteria

1. Running `/learn` on the current issue_patterns snapshot produces zero SDs whose fingerprints match UUID regex.
2. Running `/learn` on a fixture including `source=auto_rca` rows produces zero SDs for those rows.
3. Patterns with `assigned_sd_id` pointing at an open SD are skipped with a logged reason.
4. All three TRs pass in CI.

## Non-Goals

- Changing the composite score formula itself (occurrence × severity stays).
- Adding a human-review workflow (that's a separate, larger SD).
- Retroactively cancelling previously-filed noise SDs (one-time cleanup, separate task).
