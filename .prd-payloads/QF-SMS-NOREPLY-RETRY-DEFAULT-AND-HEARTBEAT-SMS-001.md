# SMS no-reply retry→default engine + heartbeat-as-SMS (chairman-directed 2026-07-17)

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Two chairman-directed mechanism changes to the Adam↔chairman SMS channel (ratified 2026-07-17; policy already landed in the governed contract leo_protocol_sections id=601). (1) NO-REPLY RETRY→DEFAULT: an unanswered SMS-decide retries up to 2× then auto-applies its stated safe default — needs durable per-question state + a scheduled checker. (2) HEARTBEAT-AS-SMS: the routine hourly status heartbeat goes as a brief text, not the executive-summary email (email reserved for length: findings/decision-packets/NEEDS-YOU).

## Functional Requirements
### FR-1: Outstanding-question state
Each sent SMS-decide records {decision_id, question, default_option, sent_at, retry_count, next_check_at, status} (extend the chairman_decisions/notification rows or a small companion table). Only items with a SAFE stated default (reversible, non-spend) are auto-default-eligible; no-safe-default items are marked HELD-console-escalate.
### FR-2: Retry→default checker (quiet-hours aware)
A scheduled check (Adam tick core or cron) that, for each outstanding auto-default-eligible question: if unanswered and next_check_at passed AND within waking hours (~5AM-11PM ET), send a retry SMS ("still need your call on X — auto-defaulting to <default> if no reply") and increment retry_count + advance next_check_at ~40 min; after retry_count reaches 2 and the next interval passes, AUTO-APPLY the stated default (resolve the decision as if the chairman chose it, stamped auto_defaulted=true + audit row) and confirm by SMS. The clock PAUSES during quiet hours (a night-sent question does not burn retries while he sleeps). Interval + max-retries config-driven (chairman-tunable).
### FR-3: Spend + safety invariants
Auto-default NEVER fires for spend or irreversible items (they were never SMS-eligible). An auto-applied default is fully reversible and audit-stamped. If the chairman replies mid-retry, his reply wins and cancels the auto-default.
### FR-4: Heartbeat channel switch
The recurring heartbeat sends a SHORT professional-casual SMS (1-2 sentences, quiet-hours-respecting, silence-by-default on nothing-ticks) via the SMS primitive instead of adam-heartbeat-email.mjs. Keep the email path for findings / decision packets / NEEDS-YOU. A "something is wrong" heartbeat still routes to the decision/alert path, not the brief SMS.
### FR-5: Tests
Unanswered question retries exactly 2× at interval then auto-defaults (reversible only); spend item never auto-defaults; chairman reply mid-retry cancels the timer; quiet-hours pauses the clock; heartbeat sends SMS not email and honors quiet hours.

## Success Metrics
- metric: SMS-decides blocked forever on chairman silence; target: 0 (auto-default after 2 retries)
- metric: spend/irreversible items auto-defaulted; target: 0 (never)
- metric: questions auto-defaulted during quiet hours; target: 0 (clock paused)
- metric: routine heartbeat channel; target: brief SMS (email reserved for length)

## Smoke Test Steps
1. instruction: Send a reversible SMS-decide, leave it unanswered through 2 retry intervals (waking hours); expected_outcome: 2 retry texts, then auto-default applied + confirmation SMS + audit row.
2. instruction: Reply after the first retry; expected_outcome: reply wins, no auto-default, timer cancelled.
3. instruction: Trigger the heartbeat; expected_outcome: a short SMS (not an email), suppressed in quiet hours.

## Sizing / Notes
Tier 2-3 (state + scheduled checker + channel switch + tests). Pairs with QF-WIRE-SMS-QUESTION-INTO-NOTIFICATION-PATH-001 (shares the outbound question surface) and QF-BAKE-CHAIRMAN-SMS-WATCH-INTO-ADAM-TICK-001 (the checker can ride the same tick core). Policy is chairman-RATIFIED + contract-encoded; this is the mechanism. Interim (Adam-driven, until shipped): Adam tracks outstanding questions in-session, retries + auto-defaults per the contract, and sends the heartbeat as SMS.
