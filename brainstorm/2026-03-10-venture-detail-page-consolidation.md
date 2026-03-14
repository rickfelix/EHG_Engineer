# Brainstorm: Venture Detail Page Consolidation

## Metadata
- **Date**: 2026-03-10
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ListingLens AI, MindStack AI (all active ventures affected)

---

## Problem Statement

The EHG app has 3 separate venture detail pages that evolved independently, creating a confusing navigation experience where clicking the same venture from different entry points lands the user on completely different pages with different capabilities:

1. **VentureDetail** (`/ventures/:id`, 229 LOC) — Legacy management view with 8 tabs including Brand Variants and Exit Readiness
2. **VentureDetailContainer** (`/chairman/ventures/:id`, 229 LOC + BuildingMode 316 + OperationsMode 143) — Mode-aware routing with auto-advance, gate approval, 7 lifecycle modes
3. **OperationsDetail** (`/chairman/operations/:ventureId`, 118 LOC) — Standalone operations view with Health, Metrics, Alerts, Revenue, Customer Service tabs

Additionally, the Briefing page navigation is inconsistent: clicking a venture goes to `/ventures/:id` but "View All" goes to `/chairman/ventures` — mixing namespaces in the same view.

## Discovery Summary

### Current State
- **VentureDetail** has Brand Variants + Exit Readiness tabs that are still actively needed
- **VentureDetailContainer** has the most sophisticated mode detection (building/operations/growth/scaling/exit_prep/divesting/sold)
- **OperationsDetail** is accidental duplication of OperationsMode — different tabs, different hooks, same purpose
- Two venture list pages also exist: VenturesPage (/ventures, most mature) and VentureLifecyclePage (/chairman/ventures)
- ~2,500 LOC blast radius across 6 core files + 7 hooks + 30 sub-components

### Key Decisions Made
- **Consolidation approach**: Unified from scratch (new VentureUnifiedDetail with sidebar nav)
- **Sidebar navigation** preferred over top tabs — scales better for 7+ modes and 25 stages
- **Action buttons**: Sticky action bar in main panel (always visible, contextual to active section)
- **Mode components**: Reused as children via lazy-loading with their own hooks (no data normalization upfront)
- **Route**: Single canonical `/ventures/:id` with redirects from old paths

## Analysis

### Arguments For
1. **Eliminates confusing navigation** — same venture, same page, regardless of entry point
2. **Sidebar scales to 25 stages + modes** — top tabs can't hold 7-10 items without scrolling
3. **Single bug-fix surface** — stage workflow fixes land once, not across 3 pages
4. **Enables future capabilities** — cross-venture comparison, intelligence feeds, shared service panels all slot into sidebar sections

### Arguments Against
1. **Route migration has hidden blast radius** — old URLs may be bookmarked, referenced in DB metadata, or linked from docs/brainstorms
2. **BuildingMode's action buttons need careful UX** — resolved: sticky action bar in main panel
3. **5/10 feasibility** — ~2,500 LOC blast radius, estimated 3-5 days across 3 PRs

### Architecture: Tradeoff Matrix

| Dimension | Weight | A: Absorb into Container | B: Unified from scratch | C: Fix routing only |
|-----------|--------|:---:|:---:|:---:|
| Complexity | 20% | 6 | 7 | 9 |
| Maintainability | 25% | 5 | 8 | 3 |
| Performance | 20% | 7 | 8 | 7 |
| Migration effort | 15% | 7 | 5 | 10 |
| Future flexibility | 20% | 5 | 9 | 2 |
| **Weighted Total** | | **5.9** | **7.5** | **5.7** |

Option B (Unified from scratch) won on maintainability and future flexibility despite higher migration effort.

## Team Perspectives

### Challenger
- **Blind Spots**: Route migration breaks bookmarks/external links; mode detection is coupled to data-fetching hooks (not just UI); Brand Variants/Exit Readiness absence in Chairman view may be a roles/context issue requiring a permission model
- **Assumptions at Risk**: Sidebar nav may invite scope creep vs. tabs which force prioritization; mode components aren't composable children yet (built as page-level owners); only 2 active ventures means 5/7 mode paths will be untested
- **Worst Case**: 800+ LOC conditional rendering monster that's harder to reason about than the 3 separate pages

### Visionary
- **Opportunities**: Sidebar as universal navigation primitive with embedded stage health; composable mode panels as plugin architecture; cross-venture comparison via split-pane
- **Synergies**: Direct remediation target for 25-Stage Workflow GUI work; integration surface for Venture Factory Shared Service Platform; single surface for Unified Strategic Intelligence Pipeline insights
- **Upside Scenario**: Single pane of glass for all venture lifecycle management; venture factory scales from 10 to 50+ ventures without new pages; sidebar becomes product moat

### Pragmatist
- **Feasibility**: 5/10 (moderate — structurally sound, but 2,500 LOC blast radius)
- **Resource Requirements**: 3-5 days, 1 developer, no backend changes, zero new dependencies
- **Constraints**: OperationsDetail uses different data shape than VentureDetailContainer; BuildingMode action buttons need new layout home; two route trees with different auth wrappers
- **Recommended Path**: Shell-first PR (1 day) → migration PR (1-2 days) → cleanup PR (1 day)

### Synthesis
- **Consensus Points**: Mode components need standardized props before composing; data hooks should lazy-load per section; 3-PR phased approach is correct
- **Tension Points**: Sidebar scope governance needed (Challenger) vs. sidebar plugin architecture is the point (Visionary); resolve by defining what earns a sidebar section
- **Composite Risk**: Medium — mitigated by shell-first approach with no behavior changes in PR1

## Open Questions
- Should the `/ventures` list page and `/chairman/ventures` list page also merge? (User: undecided, VenturesPage is more mature)
- What auth wrapper does the unified page use? (Chairman layout likely, with `/ventures/:id` as redirect)
- How to handle mode-specific sidebar sections that appear/disappear based on venture lifecycle state?
- Should placeholder mode tabs (growth, scaling, divesting, sold) be visible in sidebar or hidden until venture reaches that mode?

## Suggested Next Steps
1. Create vision and architecture documents (next step in this brainstorm)
2. Create SD for the consolidation work
3. PR1: Shell with sidebar nav skeleton, no behavior changes
4. PR2: Migrate unique sections + merge operations duplication
5. PR3: Remove dead pages, fix routes, add redirects
