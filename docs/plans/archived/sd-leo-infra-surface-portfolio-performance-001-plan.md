<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p4_cockpit.md -->
<!-- SD Key: SD-LEO-INFRA-SURFACE-PORTFOLIO-PERFORMANCE-001 -->
<!-- Archived at: 2026-06-09T16:13:45.717Z -->

# Surface portfolio performance to the chairman (build UI on the now-live data layer)

## Type
infrastructure

## Priority
medium

## Objective
Surface portfolio performance to the chairman by building the missing chairman-v3 UI on the now-live data layer — the visible payoff once the cadence runs (P0), the surfaces are honest (P1), the Initiative backbone exists (P2), and the compounding fuel flows (P3).

## Scope
Build the chairman-v3 surfaces that already have schema/backend but no UI: (1) a roadmap/wave view (`strategic_roadmaps` -> waves -> items); (2) a monthly CEO report viewer (`monthly_ceo_reports`); (3) an ops balanced-scorecard view; (4) a portfolio gap-analysis surface (`gap_analysis_results`); (5) an Initiative roll-up (Initiative -> SDs -> KR progress, from P2); (6) a cross-venture capability-REUSE ACTION surface (`CapabilitiesTab` only displays today — add promote-to-template / trigger-reuse actions). Insert lowest-friction first: a new `VisionAlignmentPage` tab, then a Friday agenda section + `friday-meeting-data` query, then a `BriefingDashboard` panel. Consolidate the legacy pre-V3 analytics layer (`ExecutiveDashboardPage` / `LivePerformancePage` / `ProfitabilityPage` / `ROIDashboardPage`).

## Acceptance Criteria
- Each of the 6 surfaces renders LIVE data (not mock/empty).
- Insertion points wired (VisionAlignmentPage tab, Friday agenda section, BriefingDashboard panel).
- Legacy pre-V3 analytics layer consolidated.

## Success Metrics
- 6 new/wired chairman performance surfaces live on real data.
- Legacy duplicate analytics pages removed/consolidated.

## Rationale
UI is built LAST by design — rendering empty/dormant tables is the current failure mode that erodes trust; by this phase the data is real. This is EHG-app (React) work — target_application = EHG. Depends on P2 + P3. Large — LEAD/PLAN may decompose into child SDs per surface. See the performance-framework plan + docs/protocol/README.md.
