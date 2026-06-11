<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p1b_ui_truth.md -->
<!-- SD Key: SD-LEO-INFRA-MAKE-EHG-CHAIRMAN-001 -->
<!-- Archived at: 2026-06-09T16:13:42.565Z -->

# Make the EHG Chairman cockpit truthful (fix dead-table panels + quarantine mocks)

## Type
infrastructure

## Priority
high

## Objective
Make the EHG Chairman cockpit truthful: fix panels that query non-existent tables (rendering empty as if live) and clearly quarantine hardcoded mockups so demo data stops masquerading as live signal.

## Scope
- Repoint `OKRPortfolioAnalytics.tsx` off the non-existent `okr_objectives` + `venture_portfolio_data` onto the real `objectives` / `key_results` (mirror the working `useOKRScorecard.ts`).
- `useStageOKRAlignment.ts` fabricates relevance from hardcoded defaults because its backing tables `okr_stage_weights` + `venture_stage_progress` do not exist — either wire it to real data or clearly mark it a placeholder (no silent fake relevance).
- Fix the BROKEN Mission tab: `useStrategicGovernance.ts` (L43-49) selects non-existent columns `venture_name` / `mission_statement` from `missions` (real columns are `mission_text` / `venture_id`), so the chairman-v3 `GovernanceOverview` Mission tab renders "No active mission defined" DESPITE a live active portfolio mission row. Repoint it to `mission_text` and resolve the venture name via the `venture_id` FK (or "EHG (Portfolio)" when NULL). Same wrong-columns class as the OKR panel fix above.
- Quarantine/flag the mock surfaces so they are not mistaken for live data: `CompetitiveIntelligenceModule.tsx` (hardcoded mockup with a fake 3s setTimeout "AI analysis"), `StrategicInitiativeTracking.tsx` (hardcoded gantt mock), and the `/gap-analysis` cards (hardcoded). Add a visible "sample data — not live" banner or gate them behind a flag until they are wired (P4).

## Acceptance Criteria
- `OKRPortfolioAnalytics` renders real `objectives` / `key_results`.
- No chairman-v3 panel silently renders a non-existent/empty table as if it were live.
- Every mock surface is clearly labeled or flag-gated.

## Success Metrics
- Zero chairman-v3 panels querying non-existent tables.
- All identified mock surfaces labeled/quarantined.

## Rationale
Rendering empty or mock data is the current failure mode that erodes chairman trust; establishing the truth baseline must precede building new surfaces (P4). This is EHG-app (React) work — target_application = EHG. Parallel to P0/P1a. See the performance-framework plan.
