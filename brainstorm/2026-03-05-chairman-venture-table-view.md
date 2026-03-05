# Brainstorm: Chairman Venture Table View — Replace Swimlane with Portfolio Command Surface

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (cross-cutting UI change)

---

## Problem Statement
The Chairman's primary venture view (`/chairman/ventures`) renders a 5-column swimlane (VentureLifecycleMap) where clicking a venture card opens a Sheet side panel with only 4 data fields (stage, AI score, status, validation score). There is no way to navigate to the full venture detail page (`/chairman/ventures/:id`), which has 8 tabs including the 25-stage workflow and exit readiness. No sorting or filtering exists. The Chairman cannot effectively manage a portfolio from this view.

## Discovery Summary

### Current State
- `VentureLifecycleMap` renders 5 columns (being restructured to 6 by active SD)
- `VentureDetailDrawer` (Sheet) shows: Stage, AI Score, Status, Validation Score + bar chart
- No "View Details" button in the drawer — full detail page is unreachable
- No sort, filter, or search capabilities
- Full `VentureDetail` page exists at `/chairman/ventures/:id` with 8 tabs: Overview, Workflow, Research, Brand Variants, Financial, Team, Timeline, Exit
- 3 of 8 tabs are placeholder stubs (Financial, Team, Timeline)

### User Requirements
- Replace swimlane entirely with a table/list view
- Remove the side panel — clicking rows navigates to full detail page
- Follow the Operations page pattern (`/chairman/operations`)
- Include exit-readiness elements (pipeline mode, asset count, exit model)
- Account for active 6-phase restructuring (5→6 columns, LAUNCH_LEARN→THE_LAUNCH, kill gates [3,5,13,23])

### Reference Implementation
- `OperationsDashboard` at `/chairman/operations` has the desired pattern:
  - Summary cards at top (Total, Active, Avg Progress, Efficiency)
  - Scrollable table with columns: Venture, Status, Stage, Progress, Health %, Last Activity
  - Clickable rows navigate to detail page
  - Real-time updates via WebSocket

## Analysis

### Arguments For
- Gives Chairman direct access to venture detail pages (currently impossible from swimlane)
- Adds sort/filter capability that doesn't exist today
- Follows a proven pattern already in the codebase (Operations)
- ~200 LOC — small, low-risk change
- Makes the UI immune to future phase restructurings (phase is a badge, not a column position)
- Removes ~70 lines of dead-end drawer code
- Enables future portfolio-level triage ("show me all ventures in exit_prep sorted by asset count")

### Arguments Against
- Loses the spatial lifecycle clustering view (mitigated by phase-distribution summary chips)
- Exit-readiness columns won't have data for most ventures yet (mitigated by deferring to Step 2)
- VentureDetail page has 3 stub tabs (mitigated by hiding/de-emphasizing)

## Team Perspectives

### Challenger
- **Blind Spots**: Schema drift between arch docs and actual DB; swimlane encodes spatial lifecycle info that tables destroy; detail page has 3 stub tabs
- **Assumptions at Risk**: Operations pattern may not work for heterogeneous data; 6-phase restructuring is in-flight; exit-readiness data doesn't exist yet for most ventures
- **Worst Case**: Spatial overview lost, empty exit columns undermine confidence, stub tabs exposed as primary landing

### Visionary
- **Opportunities**: Unified portfolio command surface (composable table reused across views); exit-readiness as first-class sort/filter dimension; kill-gate radar (computed "next kill gate" column)
- **Synergies**: Table is immune to phase restructuring; exit-readiness backend already built; removes Sheet drawer code (~70 lines)
- **Upside Scenario**: Table becomes central portfolio management surface, composable pattern propagates to LP Dashboard / Board View

### Pragmatist
- **Feasibility**: 3/10 difficulty — proven reference impl in codebase
- **Resource Requirements**: ~200 LOC net change, 1 component + 1 hook, single SD child
- **Constraints**: Exit-readiness data is per-venture API (N+1 queries), readiness_score not in DB yet, 6-phase restructuring should land first
- **Recommended Path**: Step 1 — table with core columns (Name, Status, Phase, Stage, AI Score, Last Activity). Step 2 — add exit-readiness columns after bulk endpoint exists.

### Synthesis
- **Consensus**: Operations pattern is proven, Sheet should go, ~200 LOC, defer exit columns
- **Tension**: Spatial awareness vs flat table (resolved: phase-distribution summary above table)
- **Composite Risk**: Low

## Open Questions
- Should stub tabs (Financial, Team, Timeline) be hidden entirely or shown as "coming soon"?
- Should a compact phase-distribution summary (venture count chips per phase) sit above the table?
- When exit-readiness bulk endpoint lands, what column set is ideal?

## Suggested Next Steps
1. Generate Vision + Architecture Plan → Register in EVA
2. Create SD for Step 1 (table view with core columns)
3. After Venture Architecture ORCH-001 completes → create follow-up SD for exit-readiness columns
