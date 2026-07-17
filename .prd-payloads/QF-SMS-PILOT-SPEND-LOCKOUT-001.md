# SMS pilot spend-lockout — route ALL spend decisions to console until the financial envelope ships

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Chairman-decided pilot posture 2026-07-17: the SMS bridge goes live for NOTIFY + non-spend DECIDE, with ALL spend-bearing decisions routed to console, until SD-LEO-FEAT-SMS-DECISION-FINANCIAL-ENVELOPE-001 ships Solomon's caps+undo. TODAY the consequence-classifier only routes >= $5,000 to console (HIGH_SPEND_THRESHOLD) — sub-$5k spend is still SMS-approvable, which does NOT honor the chairman's "all spend to console" default. This QF closes that gap as a reversible interim, so the webhook cutover is safe on money from the first live minute.

## Functional Requirements
### FR-1: Any detected spend → console during pilot
Behind an env flag `SMS_SPEND_PILOT_LOCKOUT` (default ON until the envelope ships), `classifyConsequence` treats ANY non-null detected dollar amount as HIGH (console-only), not just >= $5,000. Non-spend decisions (approve/pause/pivot/schedule/notify with no dollar amount) are UNAFFECTED and remain SMS-eligible.
### FR-2: Reversible, superseded by the envelope
The flag is the single toggle the envelope SD (FR-2 caps) flips OFF when the real $250/$500 + undo envelope lands — no code rip-out, clean handoff. Document the linkage in both SDs.
### FR-3: Test
Test: with the flag ON, a "$200 spend" decision classifies HIGH (console); a non-spend "approve the schedule" classifies as today (SMS-eligible). With the flag OFF, behavior reverts to the $5,000 threshold.

## Success Metrics
- metric: sub-$5k spend decisions SMS-approvable during pilot; target: 0 (all to console)
- metric: non-spend decisions wrongly locked out; target: 0
- metric: interim removable by a single flag when the envelope ships; target: yes

## Smoke Test Steps
1. instruction: With SMS_SPEND_PILOT_LOCKOUT on, classify "Approve $200 ad spend"; expected_outcome: HIGH → console.
2. instruction: Classify "Approve the Tuesday launch slot" (no dollar amount); expected_outcome: unchanged (SMS-eligible).

## Sizing / Notes
Tier 1-2 QF (~1-line classifier change + flag + test). HARD PRE-CUTOVER GATE: must land with the drain wire (SD-LEO-FEAT-WIRE-DRAINSMSRELAYSTAGING-SCHEDULED-001) BEFORE the Twilio webhook flip — flag to coordinator. Interim for SD-LEO-FEAT-SMS-DECISION-FINANCIAL-ENVELOPE-001. Real-money keyword → but it TIGHTENS (console-only), so it is a safety-increasing change; still route via the chairman-decision path awareness.
