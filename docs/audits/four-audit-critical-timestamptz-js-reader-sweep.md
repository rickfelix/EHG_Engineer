---
Category: Database
Status: Approved
Version: 1.1.0
Author: EXEC (SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001)
Last Updated: 2026-08-17
Tags: timestamptz, timezone, js-reader-audit, sd-leo-infra-four-audit-critical-001
---

# JS-reader sweep — SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-3

Audits high-traffic JS/TS readers of the 15 naive timestamp columns being migrated to
`timestamptz` across 4 tables (`quick_fixes`, `sd_phase_handoffs`, `strategic_directives_v2`,
`user_stories`), for double-conversion risk once those columns become tz-aware. Classifies each
reader **SAFE** (no timezone assumption — server-side filter, already-aware column, row-vs-row
comparison, or already routed through the canonical normalizer `lib/time/pg-timestamp.cjs`) or
**FIXED** (patched during this SD).

## Scope boundary (read this before the table)

**IN SCOPE**: high-traffic readers — dashboards, CLI hot paths, gate/handoff logic, cron sweeps —
in `EHG_Engineer/{scripts,lib}` and `ehg/src`.

**OUT OF SCOPE, explicitly excluded, not a silent cap**:
- `scripts/archive/one-time/*` and `scripts/one-off/*` in EHG_Engineer — historical/ephemeral,
  not high-traffic by the PRD's own qualifier.
- A generic single-table grep (`.from('sd_phase_handoffs')` alone) across EHG_Engineer's
  `scripts/`+`lib/` matched **100+ files** (hit the search tool's result cap); `strategic_directives_v2`
  — the single most-queried table in the repository — would match substantially more. An
  exhaustive, verified, file-by-file trace-back of every touching site is a multi-day undertaking
  disproportionate to this SD's own "high-traffic" framing.
- **What this sweep actually covers instead**, to keep the bound defensible rather than arbitrary:
  every site named by PLAN-phase VALIDATION and Explore (5 sites, fixed); both files Explore
  separately flagged as "very high-traffic"/"very high frequency" hot paths
  (`scripts/fleet-dashboard.cjs`, `scripts/worker-checkin.cjs`) — checked line-by-line for every
  `Date.parse`/`new Date` call touching the 4 tables' columns, not spot-checked; the direct
  `sd:next` CLI display path (`scripts/modules/sd-next/display/quick-fixes.js`); and a full
  `ehg/src` sweep for any reference to the 4 table names at all (10 files individually verified).
- **The remaining ~95+ EHG_Engineer files that touch these tables incidentally were NOT
  individually triaged.** A dedicated follow-up sweep (or a stricter grep keyed to actual query
  shapes, not just column names) is the honest recommendation if further assurance is wanted; this
  is flagged explicitly rather than silently claimed complete.

## Classification table

| Site | Table/Column(s) | Status | Reason |
|---|---|---|---|
| `lib/coordinator/strand-age-gauge.cjs` `tsMs()`→`planStrandAgeGauge()` | `strategic_directives_v2.updated_at/created_at`, `sd_phase_handoffs.resolved_at` (aware, fallback) | **FIXED** | Raw `Date.parse` with no hasTZ guard; feeds `fleet-dashboard.cjs printStrandAgeGauge()`. Routed through `pgTimestampMs()`; `!== null` guard corrected to `Number.isFinite()` (NaN vs null gap). Unit-tested (`tests/unit/coordination/four-audit-critical-timestamptz-js-readers.test.js`). |
| `scripts/modules/sd-next/claim-analysis.js` `hasActiveWorkEvidence()` | `strategic_directives_v2.updated_at`, `sd_phase_handoffs.created_at` | **FIXED** | Raw `new Date()`, runs on every `sd:next`/claim invocation fleet-wide (very high traffic). Routed through `pgTimestampAgeMs()`. Unit-tested. |
| `scripts/modules/sd-next/claim-analysis.js` `checkEnrichmentSignal()` | `strategic_directives_v2.updated_at` | **FIXED** | Third unguarded site, found by prospective TESTING review outside the originally-cited ranges. Routed through `pgTimestampMs()`. Unit-tested. |
| `scripts/analytics/handoff-rejection-rates.mjs` `computeTransitionStats()` | `sd_phase_handoffs.created_at` | **FIXED** | Unconditional `+ 'Z'` append — correct only while the column stays naive; would double-convert post-migration. Routed through `pgTimestampMs()`. |
| `scripts/lib/duration-estimator.js` `getElapsedTime()` | `sd_phase_handoffs.created_at`, `strategic_directives_v2.created_at` | **FIXED** | `.endsWith('Z')` guard recognized only the literal `Z` suffix, not a `+HH:MM` offset (PostgREST's common form for aware columns) — would double-convert post-migration. Routed through `pgTimestampMs()`. |
| `scripts/ghost-completion-check.mjs` (fresh-ghost filter) | `v_sd_completion_integrity.updated_at` (sources `strategic_directives_v2.updated_at`) | **FIXED** | `` `${ts}Z`.replace('ZZ','Z') `` trick handled a pre-existing literal `Z` but not a `+HH:MM` offset. Routed through `pgTimestampMs()`. |
| `scripts/fleet-dashboard.cjs` line ~1688 (chairman-gated QF age display) | `quick_fixes.created_at` | **FIXED** | Raw `Date.parse`, unguarded, in the SAME file that already correctly uses `pgTimestampAgeMs()` elsewhere (line ~816) for the identical column — an inconsistent duplicate found on line-by-line review of this file. Routed through `pgTimestampAgeMs()`. |
| `scripts/fleet-dashboard.cjs` line ~816 (existing) | `quick_fixes.created_at` | SAFE | Already routed through `pgTimestampAgeMs()` (predecessor SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001 fix, cited in `lib/time/pg-timestamp.cjs`'s own header). |
| `scripts/fleet-dashboard.cjs` lines 1570, 1625, 1966, 2094 (`ageMin` from `.created_at`) | `session_coordination.created_at` | SAFE | Already tz-aware column (confirmed by row shape: `.payload`, `.sender_callsign`, `.acknowledged_at`, `.read_at`, `.message_type`) — not one of the 4 target tables. |
| `scripts/fleet-dashboard.cjs` `sd.completion_date`/`c.completion_date` sites (multiple) | `strategic_directives_v2.completion_date` | SAFE | Already-`timestamptz` column (out of this SD's 15-column scope) — a raw `new Date()` on an offset-bearing string parses correctly. |
| `scripts/fleet-dashboard.cjs` `computeSolomonLedgerRollup()` line ~2149 | Solomon advisory-ledger rows (not one of the 4 target tables) | SAFE | Different domain table by function name/context. |
| `scripts/worker-checkin.cjs` line ~216 | `quick_fixes.created_at` | SAFE | Already routed through `pgTimestampMs()` (predecessor SD fix, cited by name in `lib/time/pg-timestamp.cjs`'s header as the historical duplicate-logic site this SD's canonical module replaced). |
| `scripts/worker-checkin.cjs` line ~195 (sort comparator) | `quick_fixes.created_at` (both operands) | SAFE | Row-vs-row comparison — two naive timestamps shift identically under local-time misparse, so ordering is unaffected. Per `lib/time/pg-timestamp.cjs`'s documented scope: normalizing row-vs-row is churn, not a fix. |
| `scripts/modules/sd-next/display/quick-fixes.js` (age column, `not_before` gating) | `quick_fixes.created_at` (via `pgTimestampAgeMs()`), `quick_fixes.not_before` (already aware) | SAFE | `created_at` already routed through the canonical normalizer; `not_before` is already `timestamptz` (out of this SD's scope), so raw `Date.parse` on it is correct. Sort comparator (row-vs-row) also exempt. |
| `scripts/modules/handoff/gates/subagent-evidence-gate.js` `parseAsUTC()` | `sd_phase_handoffs.accepted_at`, `strategic_directives_v2.created_at` | SAFE (but flagged) | Own independently-written, CORRECT hasTZ-guarded implementation — not a defect. Flagged in this SD's PRD (FR-6) as a 3rd duplicate of the canonical normalizer, a consolidation candidate for a future cleanup, not fixed here. |
| `ehg/src/hooks/usePortfolioRoadmap.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file at all. |
| `ehg/src/components/chairman-v3/ventures/VentureTable.tsx` | `strategic_directives_v2` | SAFE | The only query against this table is `count: 'exact', head: true` (no row data returned); the file's `timeAgo()` helper is called with `venture.lastActivity`, sourced from the `ventures` table, not `strategic_directives_v2`. |
| `ehg/src/hooks/useVisionDashboardData.ts` | `strategic_directives_v2.created_at` | SAFE (display passthrough) | Selected and passed through as `createdAt: r.created_at` with no client-side arithmetic in this hook. The `new Date(...)` arithmetic elsewhere in the file operates on `eva_vision_scores.scored_at`, a different table. If a downstream consumer later does `new Date(createdAt)` purely for calendar-date display (not age/ordering), the failure mode is a wrong *displayed* date, not a wrong boolean/ordering decision — lower severity, not fixed here. |
| `ehg/src/components/chairman-v3/batch-review/BatchReviewDashboard.tsx` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/hooks/useVentureBuildTree.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/hooks/useDecisionTracker.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/components/stages/Stage20BuildExecution.tsx` `formatPauseDuration()` | N/A | SAFE | Called with `pausedAt` sourced from `stageWork.advisory_data.pause_state.paused_at` — a JSONB field, not one of the 15 migrated columns. |
| `ehg/src/hooks/usePipelineStatus.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |
| `ehg/src/app/api/ready/route.ts` | `strategic_directives_v2` (query present) | SAFE | Only `new Date().toISOString()` (current-time stamp), no parsing of stored data. |
| `ehg/src/hooks/useBuilderViews.ts` | `strategic_directives_v2` (query present) | SAFE | No `new Date()`/`Date.parse()` in the file. |

## Summary

- **7 sites fixed** this SD (2 Explore-named, 3 VALIDATION-named, 1 third site found by prospective
  TESTING review, 1 additional found on line-by-line review of `fleet-dashboard.cjs`), across 6
  files, all regression-tested (26 unit tests: `tests/unit/coordination/`, `tests/unit/time/`,
  `tests/unit/database/`).
- **11 sites confirmed SAFE** — already fixed by a predecessor SD, already-aware column, row-vs-row
  exemption, or a different table entirely — each individually verified, not assumed.
- **1 site flagged as technical debt, not a defect** (`subagent-evidence-gate.js`'s duplicate
  normalizer) — already documented in the PRD's FR-6 out-of-scope findings.
- **10 `ehg/src` sites individually verified SAFE** — the `ehg` frontend does query
  `strategic_directives_v2`, contrary to an earlier assumption it might not; every site was checked
  directly rather than assumed clean.
- **~95+ EHG_Engineer files matching the generic grep pattern remain unswept** at the individual-site
  level — explicitly out of bounds for this SD (see Scope boundary above), not a silent gap.
