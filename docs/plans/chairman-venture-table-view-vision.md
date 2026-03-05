# Vision: Chairman Venture Table View — Portfolio Command Surface

## Executive Summary
The Chairman's primary venture view (`/chairman/ventures`) currently renders a swimlane/kanban layout that prevents the user from navigating to individual venture detail pages, sorting or filtering ventures, or seeing any exit-readiness information at the portfolio level. This vision replaces the swimlane with a table-based portfolio command surface — following the proven OperationsDashboard pattern already in the codebase — that gives the Chairman direct access to venture details, dynamic sort/filter capabilities, and (in a second phase) exit-readiness columns for portfolio-level triage.

This is a cross-cutting UI change affecting all 7 active ventures. It addresses the primary UX gap identified during UAT testing of the 25-stage venture workflow: the Chairman cannot reach the full venture detail page from the ventures list.

## Problem Statement
The current `VentureLifecycleMap` component renders ventures as cards in 5 (soon 6) swimlane columns grouped by lifecycle phase. Clicking a card opens a `Sheet` side panel showing only 4 data fields (stage, AI score, status, validation score) with no navigation to the full detail page. The full `VentureDetail` page at `/chairman/ventures/:id` — with 8 tabs including the 25-stage workflow viewer and exit readiness tab — is completely unreachable from the Chairman's ventures view. There is no sorting, filtering, or search capability. The Chairman cannot manage a portfolio from this view.

**Who is affected**: The Chairman persona — the primary user of the `/chairman/*` routes, responsible for venture lifecycle oversight, kill-gate decisions, and exit-readiness assessment.

**Current impact**: Every venture interaction requires either manual URL entry or navigating through the legacy `/ventures` route, bypassing the Chairman Shell entirely.

## Personas

### The Chairman (Primary)
- **Goals**: Portfolio oversight, kill-gate decisions, exit-readiness monitoring, venture triage
- **Mindset**: Executive — wants at-a-glance status then drill-down into specifics
- **Key Activities**: Review venture progress across lifecycle phases, identify ventures approaching kill gates, assess exit readiness across the portfolio, make go/no-go decisions on individual ventures
- **Pain Points**: Cannot navigate to venture details from the main ventures view; no way to sort/prioritize ventures; no portfolio-level exit-readiness visibility

### The Builder (Secondary)
- **Goals**: Understand which ventures need technical attention
- **Mindset**: Tactical — wants to know what's blocked and what's next
- **Key Activities**: Check venture health scores, identify stalled ventures, review stage progress
- **Pain Points**: The Builder routes (`/builder/*`) don't have a ventures view — they may use the Chairman ventures page for reference

## Information Architecture

### Routes (Unchanged)
| Route | Component | Purpose |
|-------|-----------|---------|
| `/chairman/ventures` | VentureLifecyclePage | **NEW: Table view** (replaces swimlane) |
| `/chairman/ventures/:id` | VentureDetailPage | Existing 8-tab detail (unchanged) |
| `/chairman/operations` | VentureOperationsPage | Reference implementation for table pattern |

### Data Sources
| Hook/API | Data | Used By |
|----------|------|---------|
| `useVentureLifecycle()` | Ventures + lifecycle stage grouping | Table (refactored to flatten) |
| `useLiveWorkflowProgress()` | Stage execution progress + performance | Optional: progress column |
| `useExitSummary()` | Pipeline mode, asset count, exit profile | Phase 2: exit-readiness columns |
| `venture-workflow.ts` | Stage metadata, phase names, gate types | Phase badge + kill-gate column |

### Navigation Flow
```
/chairman/ventures (Table)
  → Click row → /chairman/ventures/:id (8-tab Detail)
    → Workflow tab → 25-stage viewer (Timeline/Kanban/List sub-views)
    → Exit tab → Exit readiness (pipeline mode, assets, exit profile)
    → Overview tab → Metrics, scores, quick actions
```

## Key Decision Points

1. **Phase-distribution summary**: Include a compact row of chips above the table showing venture count per phase (e.g., "The Truth: 2 | The Engine: 1 | The Build: 4"). This preserves the spatial clustering signal from the swimlane without the swimlane's limitations.

2. **Exit-readiness column timing**: Defer exit-readiness columns (Pipeline Mode, Asset Count, Exit Model) to a follow-up SD after the Venture Architecture ORCH-001 completes and bulk query support exists. Ship Phase 1 with core columns only.

3. **Stub tab handling**: Hide or de-emphasize the 3 placeholder tabs (Financial, Team, Timeline) on the VentureDetail page to avoid exposing unfinished UI as the primary landing page.

4. **Kill-gate proximity**: Include a "Next Gate" computed column showing distance to the nearest kill gate (e.g., "Kill @ Stage 5 (2 away)") — surfaces decision points proactively.

## Integration Patterns

### With Existing Chairman Shell (V3)
- The table view renders inside the `ChairmanShell` grid layout (same as current swimlane)
- No changes to the shell, sidebar, topbar, or attention-queue areas
- `VentureLifecyclePage.tsx` wrapper is unchanged (6 lines)

### With Operations Dashboard
- Reuse the same Shadcn Table component pattern
- Reuse status badge color mapping, timeAgo utility, summary card layout
- Same click-to-navigate pattern: `navigate(/chairman/ventures/${id})`

### With Exit-Readiness System (Phase 2)
- When `GET /api/eva/exit/portfolio` endpoint lands, add exit columns
- `useExitSummary()` already returns the required data shape
- `PIPELINE_MODE_COLORS` from ExitReadinessTab.tsx provides badge styling

### With 6-Phase Restructuring
- Table consumes phase from `getStageByNumber()` in venture-workflow.ts
- Phase is a computed badge, not a spatial column — immune to future restructuring
- Kill gates [3, 5, 13, 23] are sourced from the VENTURE_STAGES config

## Evolution Plan

### Phase 1: Core Table View (This SD)
- Replace VentureLifecycleMap with VentureTable component
- Remove VentureDetailDrawer (Sheet side panel)
- Columns: Name, Status, Phase, Stage, AI Score, Next Gate, Last Activity
- Summary cards: Total Ventures, Active, Avg AI Score, Approaching Kill Gate
- Sort on Name, Stage, AI Score columns
- Phase-distribution chips above table
- Clickable rows navigate to `/chairman/ventures/:id`
- ~200 LOC

### Phase 2: Exit-Readiness Columns (Follow-up SD)
- Add columns: Pipeline Mode, Asset Count, Exit Model
- Requires bulk exit summary endpoint from Venture Architecture ORCH-001
- Filter by pipeline mode (building/operations/exit_prep/divesting)
- Sort by asset count, readiness indicators

### Phase 3: Advanced Portfolio Features (Future)
- Column customization (show/hide columns)
- Saved filter presets
- CSV/PDF export for LP reporting
- Inline quick actions (advance stage, trigger review)

## Out of Scope
- Changing the VentureDetail page tabs or content (separate concern)
- Implementing the 3 stub tabs (Financial, Team, Timeline)
- Backend API changes (Phase 1 uses existing data)
- Exit-readiness bulk endpoint (built by Venture Architecture ORCH-001)
- Mobile/responsive optimization (desktop-first, Chairman persona)

## UI/UX Wireframes

### Phase 1: Table View
```
┌─────────────────────────────────────────────────────────────────────┐
│  Venture Portfolio                                    [+ New Venture]│
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Total: 7 │  │ Active: 5│  │ Avg AI:72│  │ Near Gate│           │
│  │ ventures │  │          │  │          │  │    2     │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────────────────────┤
│  Phase: [Truth:2] [Engine:1] [Identity:0] [Blueprint:1] [Build:2] │
│         [Launch:1]                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Name          │ Status │ Phase      │ Stage │ AI  │ Next Gate     │
│  ──────────────┼────────┼────────────┼───────┼─────┼───────────────│
│  CreatorFlow   │ active │ The Engine │  7/25 │  82 │ Kill @ 13 (6) │
│  NicheSignal   │ active │ The Truth  │  4/25 │  75 │ Kill @ 5  (1) │
│  Synthify      │ active │ The Build  │ 18/25 │  88 │ Kill @ 23 (5) │
│  NicheBrief    │ active │ The Truth  │  2/25 │  68 │ Kill @ 3  (1) │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 2: With Exit-Readiness Columns
```
│  ... │ Pipeline  │ Assets │ Exit Model      │
│  ... │ building  │   --   │ --              │
│  ... │ operations│   12   │ Full Acquisition│
│  ... │ exit_prep │    8   │ Licensing       │
```

## Success Criteria
1. Chairman can navigate from ventures list to any venture detail page in 1 click
2. Chairman can sort ventures by name, stage, AI score, and phase
3. Phase-distribution summary shows venture counts per lifecycle phase
4. Kill-gate proximity is visible for every venture without clicking into details
5. No regression in existing VentureDetail page functionality
6. Side panel (Sheet drawer) is fully removed
7. Table follows the same visual pattern as the Operations Dashboard
