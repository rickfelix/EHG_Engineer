# Wire sendChairmanSmsQuestion into the notification/escalation path — the outbound wire

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Live-verified 2026-07-17: the full SMS round trip works end-to-end (outbound question → chairman phone reply → relay → staging → drain → decision resolved with reply recorded; decision 66eb7ff6, outcome=answered 20:16Z). BUT `sendChairmanSmsQuestion` (lib/chairman/sms-bridge.js) has ZERO production callers — the demo drove it manually. Until the notification/escalation path calls it, no real decision ever reaches the chairman's phone: the bridge is live but nothing feeds it. Classic built-but-unwired final wire.

## Functional Requirements
### FR-1: Call site in the decision-notification path
Wire sendChairmanSmsQuestion into the existing chairman decision-notification/escalation flow (lib/chairman/record-pending-decision.mjs escalateChairmanDecision or the equivalent path that currently notifies via email/console): when a pending decision is SMS-eligible (classifier low/medium — HIGH and all spend already fail closed to console), send the SMS question alongside/instead of the current channel per policy. Ground-truth the actual notification entry point before wiring.
### FR-2: Chairman identity config (no hardcoding)
Chairman phone/email/user-id from config/env (CHAIRMAN_PHONE etc.) or the profile row — not hardcoded. Live values: phone +16096058544; auth user rickfelix2000@gmail.com. NOTE the identity trap found in the demo: chairman_notifications.chairman_user_id is NOT NULL — the wire must pass it and CHECK INSERT ERRORS (the demo's silently-failed notification insert caused a no_match; never swallow the bookkeeping error — if the notification row fails, the reply can never match).
### FR-3: Respect existing guards
Quiet window (isWithinChairmanQuietWindow), rate limit (checkRateLimit channel sms), consequence classification + spend lockout — all already inside sendChairmanSmsQuestion; the wire must not bypass or duplicate them. TTL-fallback: on unanswered token expiry, the decision remains pending via existing escalation (email/console) — no silent drop.
### FR-4: Test
Tests: an SMS-eligible pending decision triggers exactly one send with a correct notification row (chairman_user_id set, insert error surfaced); a HIGH/spend decision does NOT send; quiet-window/rate-limit suppress correctly.

## Success Metrics
- metric: production callers of sendChairmanSmsQuestion; target: >=1 (the notification path)
- metric: SMS-eligible decisions reaching the chairman's phone without manual scripts; target: yes
- metric: bookkeeping insert failures silently swallowed; target: 0 (surfaced/logged)

## Smoke Test Steps
1. instruction: Create an SMS-eligible pending decision via the normal path; expected_outcome: chairman receives the SMS, notification row written with chairman_user_id.
2. instruction: Create a spend-bearing decision; expected_outcome: NO SMS (console route), lockout honored.

## Sizing / Notes
Tier 2 (one call site + config + tests; guards already exist inside the function). This is the LAST wire of SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001's vision — after it, the bridge feeds itself. Includes the demo lesson (checked inserts). SOURCE-AND-GO.
