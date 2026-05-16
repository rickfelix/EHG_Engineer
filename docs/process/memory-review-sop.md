# MEMORY.md 49-Line Review SOP

**Owner**: @rickfelix
**Deadline**: 30 days from 2026-05-16 (i.e., by 2026-06-15)
**Status**: ACTIVE
**Source**: Sibling F (SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-F) FR-F-4. Closes RISK M-02 (MEMORY-AUDIT-KEEP-VERBATIM-DEFAULT). LEO Empirics specialist flagged 49 bypass-verb lines.

## Purpose

Review the 49 MEMORY.md lines flagged by the LEO Empirics specialist for containing bypass-verb references. Determine for each line whether the content should be KEPT-VERBATIM, EDITED-WITH-RATIONALE, or REMOVED-WITH-RATIONALE.

## Default Action

**KEEP-VERBATIM**. Model-authored rewrites are disallowed without explicit human sign-off (RISK M-02 keep-verbatim default).

## 3-Option Decision Workflow

For each of the 49 flagged lines:

1. **KEEP-VERBATIM** — line content stays as-is. Default action. No further work required.
2. **EDIT-WITH-RATIONALE** — line content is modified. Owner must record (a) the original verbatim text, (b) the new text, (c) a written rationale explaining why the change is necessary (must reference a specific safety/compliance concern). Recorded in `docs/process/memory-review-sop-log.md`.
3. **REMOVE-WITH-RATIONALE** — line content is deleted. Owner records (a) the original verbatim text, (b) a written rationale explaining why removal is necessary. Recorded in `docs/process/memory-review-sop-log.md`.

## Owner Responsibilities

- Review all 49 flagged lines by the 30-day deadline (2026-06-15).
- For each line, apply one of the 3 decisions and log per workflow above.
- File the completion log at `docs/process/memory-review-sop-log.md`.
- After completion, mark `app_config.memory_review_sop_completed.signal_at` to a timestamp.

## Constraints

- No model-authored rewrites without human sign-off.
- All EDIT and REMOVE decisions require written rationale.
- Default to KEEP-VERBATIM when in doubt.
- Logs must be human-readable Markdown (not opaque JSON).

## Related

- RISK M-02 in parent SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001 (MEMORY-AUDIT-KEEP-VERBATIM-DEFAULT prd_condition).
- Sibling F FR-F-4 (this SOP) + FR-F-5 (parent unblock signal).
- LEO Empirics specialist report (49 bypass-verb lines flagged 2026-05-14).
