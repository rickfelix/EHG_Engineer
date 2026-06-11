<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_sd_gate_leaderboard.md -->
<!-- SD Key: SD-LEO-INFRA-GATE-FALSE-POSITIVE-001 -->
<!-- Archived at: 2026-06-09T12:33:03.978Z -->

# Gate false-positive leaderboard: capture bypassed_gate + 30-day report

## Type
infrastructure

## Priority
high

## Objective
Make the gate pipeline (the harness "verification oracle") self-correcting by recording WHICH named semantic gate was bypassed and surfacing a 30-day leaderboard, so a chronically false-RED gate auto-flags a fix instead of silently burning worker cycles.

## Scope
- Capture `metadata.bypassed_gate` (and a `bypass_class`) at `execution-helpers.js:151-160`, sourced from the failing-gate name known at bypass time, with a regex-over-`failure_reason` fallback. Today every bypass row writes `validator_name='handoff_bypass'` and free-text reason but `metadata.bypassed_gate` is NULL.
- Add a report (or extend gate-health-weekly) grouping `validation_audit_log` bypass rows by `metadata->>bypassed_gate` over 30 days; a gate bypassed N+ times auto-flags a gate-fix SD.
- CORRECTED SCOPE (from adversarial verification): do NOT filter `WHERE rubric_category='TOOLING_BUG'` — live 30-day distribution is UNCLASSIFIED 62 / LEGITIMATE 14 / TOOLING_BUG 0, so that filter returns ~0 rows. Group by parsed gate name and surface `rubric_category` as a column instead.

## Acceptance Criteria
- New `handoff_bypass` rows carry a non-null `metadata.bypassed_gate`.
- The leaderboard lists named gates (CROSS_REPO_STAGE_CONFIG_DRIFT, GATE4_WORKFLOW_ROI, WIRE_CHECK_GATE, GATE2_IMPLEMENTATION_FIDELITY, SCOPE_COMPLETION_VERIFICATION, SUB_AGENT_REPO_RESOLUTION) by 30-day bypass count.
- A gate exceeding the chronic threshold emits a gate-fix SD (or a clearly-surfaced flag).

## Success Metrics
- >=90% of new handoff_bypass rows have a non-null `bypassed_gate`.
- The current top false-positive gate is identifiable from a single query.

## Rationale
`execution-helpers.js:141-162` writes the bypass row but never `bypassed_gate`; `gate-health-check.js:63-71` maps only NUMERIC gates (0/2A/2B/2C/2D/3) and is structurally blind to the named semantic gates. Gate names ARE present and parseable in the free-text reason (sampled). Recurring gate false-positives (CROSS_REPO, GATE4, WIRE_CHECK, USER_STORY_COVERAGE) are top documented pain. No existing leaderboard; no overlap with the pending SDs.
