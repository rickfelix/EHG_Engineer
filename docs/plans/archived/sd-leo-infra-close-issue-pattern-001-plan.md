<!-- Archived from: scratch/closure-loop-plan.md -->
<!-- SD Key: SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 -->
<!-- Archived at: 2026-06-05T13:17:01.735Z -->

# Close the issue_pattern closure-loop gap on SD cancellation

## Type
infrastructure

## Priority
medium

## Description
The learning-system closure loop leaks on SD cancellation. When a fix-SD that an `issue_patterns` row was assigned to (`issue_patterns.status='assigned'`, `assigned_sd_id=<sd>`) is cancelled, `scripts/cancel-sd.js` updates the SD, writes an `audit_log` row, and releases the `claude_sessions` claim — but it never touches `issue_patterns`. The pattern stays `status='assigned'` forever, dangling on a dead SD, and never re-enters the learning queue (the queue surfaces `active`/unassigned patterns). Today 95 `issue_patterns` rows are stuck `assigned` against `cancelled` SDs. This is the asymmetric half of an existing closure path: on SD *completion*, `resolveLearningItems()` (scripts/modules/handoff/executors/lead-final-approval/helpers.js) already flips assigned→resolved — but there is no matching handler on the cancellation path.

## Rationale
A cancelled fix-SD means its fix never shipped, so the underlying recurring issue is still open. Leaving the pattern `assigned` to a dead SD silently suppresses it from the learning queue: it is never re-surfaced, never re-assigned, and its `occurrence_count` keeps climbing invisibly. Closing the loop on cancellation restores the self-healing intent of the pattern lifecycle (SD-PATTERN-LIFECYCLE-001) and prevents the dangling-assignment backlog from regrowing after each cancellation.

## Scope
In scope:
- FR-1 (systemic guard): `scripts/cancel-sd.js` resets the cancelled SD's assigned patterns — `UPDATE issue_patterns SET status='active', assigned_sd_id=NULL, assignment_date=NULL WHERE assigned_sd_id=<sd> AND status='assigned'` — so each pattern re-enters the learning queue. Mirror the existing verified-write + `audit_log` rigor already in cancel-sd.js; non-fatal but loud on failure (the SD is already cancelled).
- FR-2 (one-time reconciliation): reset the existing backlog of `issue_patterns` that are `status='assigned'` with `assigned_sd_id` resolving to a `cancelled` SD → `status='active'` (clear assigned_sd_id + assignment_date). Idempotent; re-running is a no-op. Resolve `assigned_sd_id` by both `id` (uuid) and `sd_key`.
- FR-3 (regression test): prove cancel-sd.js resets assigned patterns of the cancelled SD and leaves patterns of OTHER SDs untouched; prove the reconciler is idempotent.

Out of scope (flag to coordinator, do NOT silently expand):
- The 15 `issue_patterns` stuck `assigned` against `completed` SDs (their fix shipped → arguably `resolved`, a different transition than the cancellation mandate).
- The 6 `issue_patterns` stuck `assigned` with NULL `assigned_sd_id` (orphaned-assignment class, no SD to key on).
- Converting the cancellation guard to a DB trigger on `strategic_directives_v2` (catches non-canonical cancel paths too, but is higher-risk shared machinery) — note as a follow-up alternative.

## Success Metrics
- After ship: 0 `issue_patterns` rows with `status='assigned'` AND `assigned_sd_id` resolving to a `cancelled` SD (down from 95).
- A future `node scripts/cancel-sd.js <SD>` on an SD with assigned patterns flips those patterns to `active` in the same run (verified by the regression test).
- The reconciler is idempotent: a second run reports 0 additional resets.

## Smoke Test Steps
1. Create a throwaway issue_patterns row `status='assigned'`, `assigned_sd_id=<a test SD key>`; cancel that SD via `node scripts/cancel-sd.js <SD> --reason "smoke"`; assert the pattern is now `status='active'` with `assigned_sd_id=NULL`.
2. Run the FR-2 reconciler; assert it reports the count of cancelled-SD danglers reset to active and that a second run resets 0.
3. Query `issue_patterns` for `status='assigned'` joined to cancelled SDs; assert count = 0.
