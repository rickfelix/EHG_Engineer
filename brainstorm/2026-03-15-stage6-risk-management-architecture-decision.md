# Brainstorm: Stage 6 Risk Management Architecture Decision

## Metadata
- **Date**: 2026-03-15
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: All active ventures
- **Part of**: Venture Stage Integration Master Plan (Area 3 of 8)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement

Stage 6 (Risk Evaluation) produces a risk register with 8+ risks across 6 categories using 3-factor scoring (severity × probability × impact, range 1-125), but stores results only in flat advisory_data JSONB. Four purpose-built risk tables exist with mature infrastructure (43-column form, escalation triggers, gate evaluation functions, chairman review automation, dashboard view) but have 0 rows.

Additionally, the risk lifecycle spans two distinct phases — pre-launch evaluation (Stages 1-25) and post-launch operations (post-25) — but the current schema only handles pre-launch gates (3-6).

## Discovery Summary

### Key Findings from CTO Deep Dive

1. **All 4 risk tables exist and are fully provisioned** — not phantom
2. **Stage 6 is fully operational** — produces structured risk data for Stages 7-9
3. **risk_recalibration_forms has 43 columns**, 4 FKs, 16 CHECK constraints, 7 indexes, 2 RLS policies, chairman review trigger
4. **risk_forecaster.js (133 LOC) exists but queries the WRONG table** (risk_assessments instead of risk_recalibration_forms)
5. **Existing dashboard view** (`v_risk_gate_dashboard`) aggregates across ventures — free portfolio-level risk visibility once data exists
6. **Pre-existing bug**: Stage 6 generates MIN 8 risks, Stage 9 requires MIN 10

### Dual Risk Tracks
- **Venture Risk** (Stage 6 → Stages 7-9 → Stage 15): risk_recalibration_forms
- **SD Implementation Risk** (LEAD/PLAN): risk_assessments table (separate, not venture-linked)

## Architecture Decisions

### 1. Unified Risk Lifecycle (Chairman Decision)
Extend risk_recalibration_forms to handle both pre-launch evaluation AND post-launch operations. Same tables, extended phase system, risk_context discriminator.

### 2. Add Columns, Don't Merge (CRO Correction)
Stage 6 produces 6 risk categories. The form has 4 column groups. **Add 10 new columns** (product_risk_* and legal_risk_*) instead of merging 6→4. Zero cost at 0 rows. Preserves full granularity.

### 3. Extend Gate Range, Don't Make Nullable (CRO Correction)
Operations reviews use gate_number 7+ instead of NULL. Preserves referential integrity, keeps existing functions/triggers/dashboard working.

### 4. Split Into 2 SDs
~370 LOC total split into:
- **SD-A**: Schema extension (DDL + column additions + constraint changes) ~170 LOC
- **SD-B**: Stage 6 wiring + forecaster rewire + MIN_RISKS fix ~200 LOC

### 5. Stagger Behind Areas 1-2
COO/CFO recommend starting Area 3 after Areas 1-2 reach EXEC to validate the wiring pattern first.

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Activates dead infrastructure (4 tables, 4 functions, 1 trigger, 1 dashboard view). Unified risk lifecycle is the correct abstraction. Lowest-effort, highest-yield integration in the 8-area plan. |
| CRO | What's the blast radius if this fails? | **Medium risk from design decisions.** Don't merge 6→4 categories (permanently destroys signal). Don't make gate_number nullable (breaks existing functions). Found MIN_RISKS mismatch (8 vs 10). |
| CTO | What do we already have? What's the real build cost? | **~370 LOC across 2 SDs.** Migration ~50 LOC, mapper ~60 LOC, writer ~120 LOC, forecaster rewire ~40 LOC, tests ~100 LOC. risk_forecaster.js queries wrong table. |
| CISO | What attack surface does this create? | **Minimal.** Existing RLS covers new columns automatically. Data classified CONFIDENTIAL/BUSINESS-SENSITIVE. No new policies needed. |
| COO | Can we actually deliver this given current load? | **Yes, but stagger.** Start after Areas 1-2 reach EXEC to validate the pattern. Don't run 3 simultaneous LEAD phases. |
| CFO | What does this cost and what's the return? | **~2-3 developer-days.** Return is option value — when first venture reaches Stage 6, plumbing exists. Not urgent. |

### Board Consensus
1. Add 10 columns for full 6-category granularity (don't merge)
2. Extend gate_number range to 7+ for operations (don't make nullable)
3. Fix MIN_RISKS mismatch (8→10 or 10→8)
4. Rewire risk_forecaster.js to query correct table
5. Stagger execution behind Areas 1-2

### Key Tensions
- **Scope**: CRO corrections grew estimate from 120-160 to ~370 LOC (resolved: split into 2 SDs)
- **Timing**: CFO says no urgency vs CSO says activating dead infrastructure is high-yield (resolved: stagger)

## SD-A Scope: Schema Extension (~170 LOC)

1. **Add 10 columns**: product_risk_previous, product_risk_current, product_risk_delta, product_risk_justification, product_risk_mitigations + same for legal_risk_*
2. **Add risk_context**: CHECK (evaluation|operations)
3. **Add review_period**: nullable text for operations cycles
4. **Extend gate_number CHECK**: allow 7+ for operations reviews
5. **Extend from_phase/to_phase CHECK**: add OPERATIONS, GROWTH, SCALING_OPS, EXIT_PREP
6. **Replace UNIQUE constraint**: partial unique index for evaluation context
7. **Update trigger**: fn_update_risk_form_chairman_flag to count 6 categories
8. **Update functions**: fn_evaluate_risk_recalibration_gate, fn_check_risk_escalation_triggers
9. **Extend risk_escalation_log.risk_category CHECK**: add PRODUCT, LEGAL

## SD-B Scope: Stage 6 Wiring + Fixes (~200 LOC)

1. **Category mapper**: Direct 6→6 mapping from Stage 6 output to form columns
2. **Recalibration form writer**: After Stage 6 analysis, insert risk_recalibration_forms row
3. **venture_artifacts ref**: Write artifact reference as in Areas 1-2
4. **Forecaster rewire**: Change risk_forecaster.js to query risk_recalibration_forms
5. **MIN_RISKS fix**: Reconcile Stage 6 MIN=8 vs Stage 9 MIN=10
6. **Tests**: Unit tests for mapper, integration for writer

## Open Questions
- What gate_number should operations quarterly reviews use? (7? 10? TBD in Area 8)
- Should risk_forecaster.js also serve SD-level risk_assessments, or only venture risk?
- Should the dashboard view be updated to show operations-phase risks?

## Suggested Next Steps
- Create vision document and architecture plan
- Generate 2 SDs (SD-A schema, SD-B wiring)
- Execute after Areas 1-2 validate the integration pattern
