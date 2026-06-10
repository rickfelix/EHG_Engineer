<!-- Archived from: C:/Users/rickf/.claude/plans/sd-adam-coordinator-comms-channel.md -->
<!-- SD Key: SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 -->
<!-- Archived at: 2026-06-09T11:21:42.361Z -->

# Plan: Resilient symmetric Adam<->coordinator advisory channel — actioned_at re-surface gate, replyable fire-and-forget, durable coordinator->Adam reply path, peek/ack verbs, self-surfacing docs

## Type
infrastructure

## Priority
high

## Summary
Coordinator-sourced infrastructure SD hardening the Adam<->coordinator communication channel. Live failure this session: a coordinator could not receive Adam's advisory (only selector is payload->>kind='adam_advisory'; queries by from_session/subject return nothing) and the inbox cron auto-marked it read on display; the coordinator's 3 replies to Adam sat UNREAD because coordinator-reply.cjs requires a correlation_id that fire-and-forget advisories lack, the coordinator invented a non-canonical payload.kind, and Adam's inbox drainer (coordination-inbox.cjs:102) skips coordinator_reply rows so there is NO persistent Adam-side reader. Root-caused via a 5-agent workflow with file:line evidence. This SD makes the lane resilient and symmetric in both directions: an advisory cannot be silently retired by a parked-cron render (it retires only when actioned), every advisory is replyable, coordinator->Adam replies survive a synchronous-await timeout via a persistent reader, both sides get read-only peek and explicit ack verbs, writes route through the validated dispatcher, and BOTH startup paths self-surface the lane (not just docs) so neither side has to reverse-engineer the channel again. This is the residual integration that complements — but does not duplicate — the prior Adam/coordinator comms SDs.

## Scope
Eliminate the Adam<->coordinator comms dead-letter that already cost a chairman-poke and 3 lost replies. The SD scope is the following eight functional requirements, included verbatim:

FR-1: adam_advisory re-surface gate moves from read_at IS NULL to payload.actioned_at IS NULL. printAdamInbox (fleet-dashboard.cjs:1154-1198) keeps stamping read_at on display as DELIVERED-only and NEVER sets actioned_at, so a parked-cron render no longer hides an unactioned advisory (closes auto-read-on-display; mirrors the adam_action_required two-stage ACK in adam-action-ack.cjs).

FR-2: NEW coordinator-ack-adam.cjs --advisory <id> stamps payload.actioned_at on the original advisory (the only thing that retires it); optional --reply also writes the coordinator_reply row.

FR-3: Every adam-advisory 'send' carries payload.correlation_id (drop the null branch) making fire-and-forget advisories replyable; coordinator-reply.cjs accepts --advisory <id> and auto-resolves correlation_id + the Adam target session (Adam's reply-by-advisory) — eliminates the hand-rolled insert / invented payload.kind.

FR-4: Durable coordinator->Adam reply path. coordination-inbox.cjs:102 no longer skips coordinator_reply rows for an Adam session; adam-advisory.cjs gains a 'replies' persistent reader (target_session=<Adam>, payload->>kind='coordinator_reply', read_at IS NULL) so replies arriving after the synchronous await times out are not lost.

FR-5: NEW read-only read-adam-advisories.cjs peek verb that displays unactioned advisories (target_session IN coordinatorId,'broadcast-coordinator') and stamps NOTHING.

FR-6: Route the advisory INSERT through lib/coordinator/dispatch.cjs insertCoordinationRow so an advisory to a stale coordinator UUID gets a DISPATCH_TARGET_UNKNOWN refusal (validated writer; also assert target_session is a full UUID + live in claude_sessions).

FR-7 (CHAIRMAN ACCEPTANCE CRITERION — must be explicit): SELF-SURFACING ON STARTUP, not just docs. /coordinator startup (scripts/coordinator-startup-check.mjs) PRINTS a 'Adam advisory lane (read+reply)' summary + the canonical doc path on init; /adam startup PRINTS the mirror (consume-reply path). PLUS docs: a canonical doc (docs/protocol/coordinator-adam-comms.md), coordinator.md subsection with the exact selector/verbs, and adam.md + CLAUDE_ADAM.md document the persistent consume-reply path. Both sides become self-documenting AND self-surfacing so neither has to reverse-engineer the channel again.

FR-8: Tests — selector uses actioned_at gate; display sets read_at not actioned_at; ack stamps actioned_at; Adam inbox leaves coordinator_reply unread for the persistent reader; send carries correlation_id.

DEDUP (already verified is_duplicate=false — this is the residual integration; complements but does not duplicate): SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001, SD-LEO-INFRA-COMPLETE-TWO-WAY-001, SD-LEO-FIX-FIX-COORDINATION-INBOX-001, SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001, SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001, SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B/-D, SD-LEO-INFRA-COORDINATOR-WORKER-DELIVERED-001.

## Objectives

- Make adam_advisory retire only on payload.actioned_at, never on a parked-cron read_at render, so an unactioned advisory always re-surfaces until explicitly actioned.
- Make every fire-and-forget advisory replyable by always carrying payload.correlation_id and giving coordinator-reply.cjs an --advisory resolver, eliminating hand-rolled inserts and invented payload.kind values.
- Guarantee a durable coordinator->Adam reply path with a persistent Adam-side reader so replies survive a synchronous-await timeout instead of becoming dead-letters.
- Add read-only peek and explicit ack verbs on both sides plus a validated-dispatcher write path so stale-UUID advisories are refused with DISPATCH_TARGET_UNKNOWN.
- Make both sides self-surfacing on startup (not just documented) so neither Adam nor the coordinator has to reverse-engineer the channel again.

## Success Metrics

- A parked-cron inbox render of an unactioned adam_advisory leaves payload.actioned_at NULL and the advisory re-surfaces on the next read (0 silent auto-retirements on display).
- 100% of adam-advisory sends carry payload.correlation_id and are replyable via coordinator-reply.cjs --advisory with no hand-rolled insert and no invented payload.kind.
- Coordinator->Adam replies arriving after the synchronous await times out are recovered by the persistent Adam-side reader (0 lost replies versus the 3 lost this session).
- An advisory addressed to a stale/dead coordinator UUID is refused with DISPATCH_TARGET_UNKNOWN instead of becoming a dead-letter.
- Both /coordinator and /adam startup print the advisory-lane summary plus the canonical doc path on init (lane is discoverable with 0 reverse-engineering).

## Success Criteria

- FR-1 re-surface gate uses payload.actioned_at IS NULL; display stamps read_at only, never actioned_at.
- FR-2 coordinator-ack-adam.cjs stamps payload.actioned_at and optionally writes the coordinator_reply row.
- FR-3 every send carries payload.correlation_id and coordinator-reply.cjs --advisory auto-resolves correlation_id plus the Adam target session.
- FR-4 coordination-inbox.cjs no longer skips coordinator_reply for an Adam session and adam-advisory.cjs has a persistent replies reader.
- FR-5 read-adam-advisories.cjs peek verb displays unactioned advisories and stamps nothing.
- FR-6 the advisory INSERT routes through insertCoordinationRow with full-UUID + live-session assertion and DISPATCH_TARGET_UNKNOWN refusal.
- FR-7 both startup paths print the lane summary and canonical doc path, and the canonical doc plus coordinator.md/adam.md/CLAUDE_ADAM.md are authored.
- FR-8 tests cover the actioned_at selector, display-stamps-read_at-not-actioned_at, ack stamps actioned_at, Adam inbox leaves coordinator_reply unread, and send carries correlation_id.

## Risks

- High blast radius: the advisory selector and inbox drainer changes touch the live Adam<->coordinator comms path; a regression could drop messages in either direction.
- coordination-inbox.cjs:102 currently skips coordinator_reply by design for non-Adam sessions; the FR-4 change must scope the un-skip to Adam sessions only so worker inboxes are unaffected.
- Routing the INSERT through insertCoordinationRow adds a live-session lookup; a stale claude_sessions row could cause a false DISPATCH_TARGET_UNKNOWN refusal of a legitimate advisory.
- Two-stage ACK (read_at vs actioned_at) must stay consistent with the existing adam_action_required pattern in adam-action-ack.cjs or the two ACK models diverge.

## Scope of Work Notes

LOC estimate ~290. Coordinator review-gated draft (not_claimable_until_reviewed scan-marker set in metadata). No auth/RLS/payments/migration/schema keywords in scope, so no --security-reviewed or --migration-reviewed guardrail flags are required.
