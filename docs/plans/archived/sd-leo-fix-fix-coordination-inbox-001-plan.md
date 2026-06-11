<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/autoread-inbox-fix.md -->
<!-- SD Key: SD-LEO-FIX-FIX-COORDINATION-INBOX-001 -->
<!-- Archived at: 2026-06-08T15:41:00.442Z -->

# Fix the coordination-inbox auto-read bug — stop auto-marking read_at on poll; surface read-but-unactioned actionable rows

## Type
bugfix

## Priority
high

## Summary
scripts/hooks/coordination-inbox.cjs (lines 518-524) is a PostToolUse hook that fires on EVERY tool call in EVERY session. It selects rows WHERE target_session=<this session> AND read_at IS NULL and stamps BOTH read_at and acknowledged_at to identical timestamps, draining the session inbox within seconds of message arrival — BEFORE the agent LLM has read the body. Its skip guards (FR-3a signal / adam_advisory / coordinator_reply) are all gated on amCoordinator===true, so they never fire for non-coordinator sessions like Adam, and coordinator->Adam messages are bare INFO with no payload.kind. The Adam inbox monitor correctly gates on read_at IS NULL, so once the hook stamps read_at it reports UNREAD:0 and actionable coordinator directives go invisible fleet-wide. Code-grounded RCA + adversarial verification in feedback b9c4946f.

## Root Cause
The poll-time hook conflates "auto-acknowledged receipt" with "read" by stamping read_at on POLL rather than on actual agent processing, and the unread-only monitor then hides the body it just marked read.

## Success Criteria
- The hook NO LONGER auto-sets read_at on a passive poll. read_at is set only when the agent has actually processed/acted on the message (or via the agent explicitly marking it read after handling).
- acknowledged_at (receipt) may still be stamped on poll if needed for liveness, but it MUST NOT imply read.
- Monitors/consumers surface READ-but-UNACTIONED actionable rows so a directive cannot silently vanish.
- Fast INTERIM acceptable: an Adam-side skip (leave coordinator-originated rows targeting a non-coordinator session read_at IS NULL) symmetric to the existing amCoordinator skips — but the GENERAL fix (poll vs processing) is the target.
- Regression: a coordinator->Adam INFO directive remains visible to the Adam monitor until Adam acts on it.

## Scope
- scripts/hooks/coordination-inbox.cjs:518-524 — separate read_at (agent-processed) from acknowledged_at (receipt); stop stamping read_at on poll.
- Extend the skip logic so non-coordinator target sessions (Adam) are covered, not only amCoordinator.
- Add a read-but-unactioned surfacing path for actionable rows (ACTIONABLE_TYPES).
- Tests: a poll does not mark an unprocessed actionable row read; an Adam-targeted coordinator INFO stays surfaced.

## Notes
- Spec source: feedback b9c4946f (RCA) + culprit coordination-inbox.cjs:518-524. It silently drops coordinator directives fleet-wide (it hid the coordinator-directed SD-creation batch this session).
