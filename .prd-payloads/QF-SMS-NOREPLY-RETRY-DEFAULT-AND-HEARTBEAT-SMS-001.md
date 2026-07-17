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
### FR-2: Retry→default checker (sleep-window robust)
A scheduled check (Adam tick core or cron) that, for each outstanding auto-default-eligible question: if unanswered and next_check_at passed AND OUTSIDE the chairman sleep window, send a retry SMS ("still need your call on X — auto-defaulting to <default> if no reply") and increment retry_count + advance next_check_at ~40 min; after retry_count reaches 2 and the next interval passes, AUTO-APPLY the stated default (resolve as if the chairman chose it, stamped auto_defaulted=true + audit row) and confirm by SMS. **SLEEP WINDOW = 22:00-06:00 America/New_York, DST-aware IANA tz (NEVER a hardcoded UTC offset) — chairman-stated, config-tunable.** During the window: the retry/auto-default clock is FROZEN (waking-hours age only — a 9:50PM question does not burn retries by midnight; nothing auto-defaults overnight; clock resumes 06:00 ET); outbound texts are SUPPRESSED and QUEUED, flushed as one morning batch at 06:00 ET (a genuine can-wait-till-morning critical alert may send, written to be read on waking, never expecting a reply); inbound replies are still honored if he texts late (resolves/cancels timers, window unchanged). Boundary-safe at both edges. A chairman reply mid-retry always wins.
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
