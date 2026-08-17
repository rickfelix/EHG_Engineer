---
Category: Database
Status: Approved
Version: 1.0.0
Author: EXEC (SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001)
Last Updated: 2026-08-17
Tags: timestamptz, timezone, js-reader-audit, sd-leo-infra-four-audit-critical-001
---

# JS-reader sweep — SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-3

Audits high-traffic JS/TS readers of the 15 naive timestamp columns being migrated to
`timestamptz` across 4 tables (`quick_fixes`, `sd_phase_handoffs`, `strategic_directives_v2`,
`user_stories`), for double-conversion risk once those columns become tz-aware.

## Scope boundary (read this before the table)

**IN SCOPE**: high-traffic readers — dashboards, CLI hot paths, gate/handoff logic, cron sweeps —
in `EHG_Engineer/{scripts,lib}` and `ehg/src`.

**OUT OF SCOPE, explicitly excluded, not a silent cap**:
- `scripts/archive/one-time/*` and `scripts/one-off/*` in EHG_Engineer — historical/ephemeral,
  not high-traffic by the PRD's own qualifier.
- A generic-pattern grep across EHG_Engineer's `scripts/`+`lib/` for
  `(Date.now()|nowMs) - new Date(x.updated_at|created_at|...)` returned **40 files**. This
  pattern is heavily polluted by false positives: `updated_at`/`created_at` are common column
  names shared by tables that are **already tz-aware** per this SD's own premise
  (`session_coordination`, `claude_sessions`, `feedback`, `retrospectives`,
  `sub_agent_execution_results`, `issue_patterns` all emit `+00:00`). Of those 40 files, only
  `scripts/fleet-dashboard.cjs` was individually re-verified in this pass (see below) because it
  is the SD's own named highest-relevance dashboard and already partially fixed
  (`lib/coordinator/strand-age-gauge.cjs`). **The remaining ~39 files were NOT individually
  triaged in this pass.** A dedicated follow-up sweep (or a stricter grep keyed to the 4 target
  tables' actual query shapes, not just column names) is recommended if further assurance is
  wanted; this is flagged explicitly rather than silently claimed complete.

## Classification table

| Site | Table | Status | Reason |
|---|---|---|---|
| `lib/coordinator/strand-age-gauge.cjs` `tsMs()`→`planStrandAgeGauge()` | `strategic_directives_v2.updated_at/created_at`, `sd_phase_handoffs.resolved_at` | **FIXED** | Routed through `pgTimestampMs()`; `!== null` guard corrected to `Number.isFinite()` (NaN vs null gap). Unit-tested (`tests/unit/coordination/four-audit-critical-timestamptz-js-readers.test.js`). |
| `scripts/modules/sd-next/claim-analysis.js` `hasActiveWorkEvidence()` | `strategic_directives_v2.updated_at`, `sd_phase_handoffs.created_at` | **FIXED** | Routed through `pgTimestampAgeMs()`. Very high traffic — runs on every `sd:next`/claim invocation fleet-wide. Unit-tested. |
| `scripts/modules/sd-next/claim-analysis.js` `checkEnrichmentSignal()` | `strategic_directives_v2.updated_at` | **FIXED** | Third unguarded site, found by prospective TESTING review outside the originally-cited ranges. Routed through `pgTimestampMs()`. Unit-tested. |
| `scripts/analytics/handoff-rejection-rates.mjs` `computeTransitionStats()` | `sd_phase_handoffs.created_at` | **FIXED** | Prior unconditional `+ 'Z'` append was correct only because the column happens to be naive today; would double-convert post-migration. Routed through `pgTimestampMs()`. |
| `scripts/lib/duration-estimator.js` `getElapsedTime()` | `sd_phase_handoffs.created_at`, `strategic_directives_v2.created_at` | **FIXED** | Prior `.endsWith('Z')` guard only recognized literal `Z`, not a `+HH:MM` offset (the form PostgREST commonly returns). Routed through `pgTimestampMs()`. |
| `scripts/ghost-completion-check.mjs` (fresh-ghost filter) | `strategic_directives_v2.updated_at` (via `v_sd_completion_integrity`) | **FIXED** | Prior `${x}Z`.replace('ZZ','Z') trick only handled an already-present literal `Z`. Routed through `pgTimestampMs()`. |
| `scripts/fleet-dashboard.cjs` lines 1570, 1625, 1966, 2094 (`ageMin` from `.created_at`) | `session_coordination.created_at` | SAFE | Already tz-aware column (confirmed by row shape: `.payload`, `.sender_callsign`, `.acknowledged_at`, `.read_at`, `.message_type`) — false positive of the generic grep pattern, not one of the 4 target tables. |
| `scripts/fleet-dashboard.cjs` `computeSolomonLedgerRollup()` line 2149 | Solomon advisory-ledger rows (not one of the 4 target tables) | SAFE | Different domain table by function name/context; not individually re-verified beyond that. |
| `ehg/src/hooks/usePortfolioRoadmap.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file at all. |
| `ehg/src/components/chairman-v3/ventures/VentureTable.tsx` | `strategic_directives_v2` | SAFE | The only query against this table is `count: 'exact', head: true` (no row data returned); the file's `timeAgo()` helper is called with `venture.lastActivity`, sourced from the `ventures` table, not `strategic_directives_v2`. |
| `ehg/src/hooks/useVisionDashboardData.ts` | `strategic_directives_v2.created_at` | SAFE (display passthrough) | Selected and passed through as `createdAt: r.created_at` with no client-side arithmetic in this hook. The `new Date(...)` arithmetic present elsewhere in the file operates on `eva_vision_scores.scored_at`, a different table. Downstream consumer of `createdAt` not traced in this pass — if a consumer later does `new Date(createdAt)` purely for calendar-date display (not age/ordering), the failure mode is a wrong *displayed* date/time, not a wrong boolean/ordering decision; lower severity, not fixed here. |
| `ehg/src/components/chairman-v3/batch-review/BatchReviewDashboard.tsx` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/hooks/useVentureBuildTree.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/hooks/useDecisionTracker.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/components/stages/Stage20BuildExecution.tsx` `formatPauseDuration()` | N/A | SAFE | Called with `pausedAt` sourced from `stageWork.advisory_data.pause_state.paused_at` — a JSONB field, not one of the 15 migrated columns; unaffected by this migration. |
| `ehg/src/hooks/usePipelineStatus.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/app/api/ready/route.ts` | `strategic_directives_v2` (query present) | SAFE | Only `new Date().toISOString()` (current-time stamp), no parsing of stored data. |
| `ehg/src/hooks/useBuilderViews.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |

## Summary

- **5 sites fixed and unit-tested** (all in EHG_Engineer, all confirmed high-traffic hot paths:
  fleet dashboard, `sd:next`/claim CLI, analytics, duration estimation, ghost-completion CI check).
- **10 `ehg/src` sites individually verified SAFE** — the `ehg` frontend does query
  `strategic_directives_v2`, contrary to an earlier assumption that it might not; every site was
  checked directly rather than assumed clean.
- **~39 EHG_Engineer files matching the generic grep pattern were not individually triaged** in
  this pass, for the reason stated in the scope boundary above. This is the honest limit of this
  sweep, not a claim of exhaustive coverage.
