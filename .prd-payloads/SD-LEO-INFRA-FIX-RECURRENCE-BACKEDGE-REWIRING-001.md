# Fix-recurrence back-edge REWIRING — light up outcome-tracker's dark halves

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved hand-off #4 item A (ledger 6644b4af; 5-agent ground-truth triangulation + adversarial ranking; "cheapest confirmed win — mostly rewiring, not building"). `lib/learning/outcome-tracker.js` has BOTH halves of the fix-effectiveness back-edge built but DARK: (1) it reads `leo_feedback` while the sourcing engine writes `feedback` (disjoint tables — sd-from-feedback.js:306 vs outcome-tracker.js:82,150,300), so `computeEffectiveness` never sees the originating fingerprint; (2) `detectRecurrence` (fingerprint jaccard → outcome_signals pattern_recurrence, lines 293-388) has ZERO production callers; (3) `sd_effectiveness_metrics` is write-only — no consumer; (4) QFs bypass the tracker entirely (complete-quick-fix path). Net effect: the system cannot tell whether its fixes actually stop recurrences — the learn-loop's back-edge is severed. Classic built-but-unwired (reachability) class.

## Functional Requirements
### FR-1: Unify the table seam
Point outcome-tracker's reads at the table the sourcing engine actually writes (`feedback`), or bridge the two, so computeEffectiveness sees originating fingerprints. Ground-truth which table is SSOT before rewiring (don't guess — verify against live writes).
### FR-2: Dispatch detectRecurrence
Give `detectRecurrence` a production caller on the flow that owns it (e.g. on fix-SD completion or a scheduled sweep) so pattern_recurrence signals are actually emitted. Registered-verifier-never-dispatched fix.
### FR-3: Consume sd_effectiveness_metrics
Add the missing consumer: surface effectiveness (recurrence-after-fix rate) where it drives action — the retro/learn pipeline or the coordinator health gauges. Write-only metrics are gauge-theater.
### FR-4: Include QFs
Route the complete-quick-fix path through the tracker so QF fixes get the same recurrence accounting as SDs.
### FR-5: Test
Tests: a seeded fix + recurring symptom produces a pattern_recurrence signal; effectiveness computes against the real feedback table; a QF completion lands in the tracker.

## Success Metrics
- metric: detectRecurrence production callers; target: >=1 (dispatched)
- metric: computeEffectiveness reading the table sourcing writes; target: yes
- metric: sd_effectiveness_metrics consumers; target: >=1
- metric: QF fixes tracked; target: yes

## Smoke Test Steps
1. instruction: Complete a fix SD, then file a recurring symptom with a matching fingerprint; expected_outcome: pattern_recurrence signal emitted.
2. instruction: Query effectiveness for that fix; expected_outcome: computed from real feedback rows, not empty.

## Sizing / Notes
Tier 2-3 (mostly rewiring existing tested code into flows; decompose only if the QF-path change balloons). Solomon-adjudicated + chairman-approved. Same reachability class as the substrate-wiring SD (shipped today) — this is the LEARN-loop's version. Relates the leo_feedback-vs-feedback disjoint-tables trap + fix-shipped-symptom-recurs-check-reachability doctrine.
