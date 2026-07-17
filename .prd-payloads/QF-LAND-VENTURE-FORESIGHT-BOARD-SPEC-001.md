# Land the Venture Foresight Board spec to main + supersede the stub + stamp consolidation constraints

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved Mode-C hand-off #3 (ledger 299c7f9f): the chairman's Venture Foresight Board spec (5-council / 20 public-thought-informed lenses venture-ideation/adjudication system) is now durably preserved at docs/design/ehg-venture-foresight-board-spec.md @ bdf819f3e58 (quick-fix/QF-20260711-736), extracted verbatim from the chairman's Dropbox .docx which sat outside every durable estate surface. This QF lands the spec to main and prevents plan-forking. The Phase-1 BUILD is DEFERRED-with-trigger (recorded separately, do NOT build now).

## Functional Requirements
### FR-1: Land the spec to main
Ship docs/design/ehg-venture-foresight-board-spec.md to main via the QF/ship path (it currently lives only on the evidence branch). Provenance + ratified disposition already in the file header.
### FR-2: Supersede the deferred stub (one capture surface)
Point the deferred stub SD-REFILL-00X2A49J ("I need a futurist roll AI agent role" — same idea, raw form) at this spec and supersede it — do NOT leave two capture surfaces for the same concept.
### FR-3: Stamp THREE binding consolidation constraints (anti-fork)
Stamp on the future build so it cannot fork the plan: (1) the board's Signal-Scan mode IS the ratified Market-Signal Scanner — one signal system, never a parallel second; (2) the spec's §17 model routing CONSUMES model_capability_reference from SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-HARNESS-001 — same table, no second routing doctrine; (3) the Venture-Screen mode EXTENDS the shipped SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001 permanent stage, not a parallel screen.

## Success Metrics
- metric: spec durable on main (not just evidence branch); target: yes
- metric: duplicate capture surfaces for the concept; target: 0 (stub superseded)
- metric: consolidation constraints stamped on the build record; target: 3/3

## Smoke Test Steps
1. instruction: Verify docs/design/ehg-venture-foresight-board-spec.md on origin/main; expected_outcome: present.
2. instruction: Check SD-REFILL-00X2A49J; expected_outcome: superseded, pointing at the spec.

## Sizing / Notes
Tier 1 (land + supersede + stamp — no build). SOURCE-AND-GO. DEFER-WITH-TRIGGER (chairman-ratified, recorded on Adam's ledger — NOT sourced now): the Phase-1 manual-doctrine MVP (spec §20, Tier 3) is deferred; TRIGGER = the v3 selection cycle opening (Alt-Text reaching first-dollar OR kill), at which point Phase 1 pilots on a live selection decision per §21. Taper rationale: nothing in Waves 0-2 depends on it; first customer is the next ideation cycle. Board-track both the land-QF and the deferred-build.
