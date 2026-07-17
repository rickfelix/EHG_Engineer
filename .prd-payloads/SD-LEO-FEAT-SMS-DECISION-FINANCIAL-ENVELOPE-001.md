# SMS chairman-decision FINANCIAL ENVELOPE — spend caps + undo window + DB whitelist (Solomon-ratified, not yet shipped)

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Adam ground-truth 2026-07-17 (pre-cutover governance catch): the delivered SMS two-way bridge (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001) shipped Solomon's SECURITY guards (Twilio signature verify, auto-suspend after N invalid, consequence-classification with HIGH→console) but did NOT ship Solomon's ratified FINANCIAL ENVELOPE. Solomon's verdict (consult 1a809123, ref 4e1a7094, captured .prd-payloads/CAPTURE-SOLOMON-SMS-DECISION-ROUTING.md, committed a0e14aa8a3d) specified four financial-safety items the PLAN owner was to encode; verified absent in `lib/chairman/consequence-classifier.js` / `lib/chairman/sms-bridge.js` on origin/main:

- ❌ **$250/decision + $500/day CUMULATIVE cap**, chairman-tunable. Delivered instead: a single `HIGH_SPEND_THRESHOLD = 5000` per-decision ceiling with NO daily cumulative cap — so SMS can approve up to ~$4,999/decision, unbounded per day. Solomon flagged the cumulative cap as the one that matters most ("a spoofer must not clear N×$250 in a burst" — the SIM-swap worst case nonce-binding does NOT stop).
- ❌ **~15-min UNDO window on spend** ("reply UNDO by HH:MM" — converts reversible-in-principle to reversible-by-mechanism). Absent.
- ❌ **DB-backed ENUMERATED WHITELIST** keyed to the L6 taxonomy as the RUNTIME predicate (unknown/unclassified → console, fail-closed). Delivered instead: runtime regex consequence-classification — which is exactly the per-message judgment Solomon warned is "the rationalization hole" vs enumerated class membership. (A `20260717_governed_change_proposals_STAGED.sql` migration references an SMS whitelist but is STAGED, not applied/wired.)
- ✅ auto-suspend, no-batching intent, audit parity, HIGH→console — present.

This SD closes the envelope so real-money chairman approval over SMS is bounded as Solomon ratified. GATES real-money SMS approval: until it ships, all spend-bearing decisions must route to console (see pilot posture in Notes).

## Functional Requirements
### FR-1: DB-backed decision-class whitelist (runtime predicate)
Encode the SMS-eligible decision classes as a DB-backed whitelist keyed to the SAME L6 taxonomy. Runtime check is whitelist MEMBERSHIP server-side at the bridge; unknown/unclassified → console; fail-closed; never trust the asking agent's self-label. Widening the whitelist is a governance change → console-only ratchet (never editable over the channel it governs).
### FR-2: Cumulative + per-decision spend caps (chairman-tunable)
Default $250/decision AND $500/day cumulative across ALL sms-channel-approved spend, both chairman-tunable via config (not code). Enforce cumulative at approval time against the day's prior sms-approved spend; over-cap → route to console, never silently approve. "Reversible" for money = refundable/cancellable within the undo window.
### FR-3: Undo window on spend classes
SMS-approved spend executes after a ~15-min delay; the confirmation SMS states "reply UNDO by HH:MM"; an UNDO within the window cancels execution. One decision per SMS (NO batching — "YES approves all 5" rebuilds high consequence from low pieces).
### FR-4: Acceptance = Solomon's red-team list
Tests: unknown-class → console; batch reply rejected; whitelist-edit-over-SMS rejected; no magic links (deep-links carry no auth); over-cap → console; undo cancels within window; audit parity (sms decisions land on the same `chairman_decisions` row with channel='sms').

## Success Metrics
- metric: SMS-approvable spend without a cumulative cap; target: 0 (capped at $500/day default)
- metric: spend classes lacking an undo window; target: 0
- metric: runtime routing via enumerated whitelist (not per-message regex judgment); target: yes
- metric: Solomon red-team acceptance list passing; target: 100%

## Smoke Test Steps
1. instruction: Approve two $200 spends by SMS in one day, then a third; expected_outcome: third exceeds $500/day cumulative → routed to console, not approved.
2. instruction: Approve a spend by SMS, then reply UNDO within 15 min; expected_outcome: execution cancelled; the chairman_decisions row reflects undo.
3. instruction: Send a decision whose class is not on the whitelist; expected_outcome: routed to console (fail-closed), never SMS-approved.

## Sizing / Notes
TIER 3 (forced): real-money + auth/credentials-adjacent (chairman decision channel) + an existing Solomon architecture plan (auto-escalation). Reasoning-correctness already adjudicated by Solomon (design ratified) — this is faithful implementation of a ratified design, so SOLOMON re-consult is NOT required; COORDINATOR review for sequencing (gates the live-money cutover). PILOT POSTURE (chairman-decision, see advisory): the webhook cutover may proceed for NOTIFY + non-spend DECIDE with ALL spend routed to console until this SD ships; real-money SMS approval and any widening beyond the chairman's own number wait on this envelope. Ties CAPTURE-SOLOMON-SMS-DECISION-ROUTING.md + SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001.
