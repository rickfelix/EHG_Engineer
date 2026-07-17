# CHAINING scores in the venture-selection rubric — chaining-now + chaining-option, triggers in tech-trajectory vocabulary

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved hand-off #5 items 1+2 (ledger 94617eb5). Content change to the shipped SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001 permanent selection stage: score every candidate on **(i) CHAINING-NOW 0-5** (a sibling venture consumes this capability, or serves as its anchor customer, THIS quarter — anchor-customer is first-class: EHG's own properties as customer #1, e.g. venture sites consuming Alt-Text for the SEO/accessibility standard) and **(ii) CHAINING-OPTION 0-5** (probability-weighted future chain). CHAIRMAN-SET HARD RULES: no-trigger-no-option (every option names a measurable trigger + review_at + confidence); options DECAY to zero at horizon; option value is a BONUS never load-bearing (standalone viability required at chaining-now=0).

## Functional Requirements
### FR-1: The two scores in the rubric
Add chaining-now + chaining-option (0-5 each) to the permanent selection stage's scoring, citing the portfolio-strategy artifact (SD-EHG-PORTFOLIO-STRATEGY-ARTIFACT-001) as the thesis source. Enforce the hard rules structurally (an option without trigger+review_at+confidence is invalid; option value bonus-only in the aggregate).
### FR-2: Triggers expressed in the EXISTING tech-trajectory vocabulary (constraint, not build)
Chaining-option triggers = axis thresholds of lib/eva/stage-zero/synthesis/tech-trajectory.js (RA/CD/ME axes, bull/base/bear bands, opening/closing/contested timing — SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001), e.g. "viable when cost_deflation base>=65". NOTE (do NOT fix here, record in the SD): known gaps — 6mo horizon (options need 12/24/60), per-venture not per-PAIR, 0.05 advisory weight, ungraded projections; the stubbed dataFeed seam is where the ratified Market-Signal Scanner plugs in later (scanner → dataFeed → bands → option re-score). Also STAMP on the deferred Futurist-Board build record: chaining-options = pair-level ForecastRecords monitored by the scanner.
### FR-3: Decay + review mechanics
Options decay to zero at horizon; review_at drives re-scoring (hold-state-style stamp, not a forgotten flag).

## Success Metrics
- metric: selection rubric scores chaining-now + chaining-option; target: every candidate
- metric: options lacking trigger/review_at/confidence; target: 0 (invalid at write)
- metric: option value load-bearing in viability; target: never (bonus-only)

## Smoke Test Steps
1. instruction: Score a candidate with a sibling anchor-customer; expected_outcome: chaining-now >0 with the consuming venture named.
2. instruction: Submit an option with no trigger; expected_outcome: rejected (no-trigger-no-option).

## Sizing / Notes
Tier 1-2 (rubric content + validation; triggers reuse existing vocabulary). SEQUENCE AFTER SD-EHG-PORTFOLIO-STRATEGY-ARTIFACT-001 (cites it). ITEM 4 (board-as-cadence) DELIBERATELY NOT SOURCED — deferred with trigger = 2+ live revenue ventures (org-template audit evidence: agent-rows-before-substance = decor); recorded on Adam's board.
