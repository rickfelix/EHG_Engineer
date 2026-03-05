# Vision: Venture Acquisition-Readiness Architecture

## Executive Summary

EHG is a venture factory whose core business model is building and selling ventures. The 25-stage pipeline evaluates, builds, launches, and operates ventures — but the architecture stops at "operations." There is no concept of preparing a venture for sale, tracking its assets, scoring its separability from shared infrastructure, or generating the artifacts an acquirer needs for due diligence.

This vision establishes acquisition-readiness as a first-class concern embedded throughout the venture lifecycle — from Stage 0 evaluation through Operations mode and into a new Exit Preparation phase. The system will track venture assets with provenance, compute separability scores continuously, maintain live data rooms, and support multiple exit models (full acquisition, licensing, revenue share) per venture.

The goal is not just to make ventures sellable, but to make them sellable fast — compressing M&A timelines from the industry-standard 60-180 days to under 30 days by having every artifact an acquirer needs continuously maintained and validated.

## Problem Statement

EHG's pipeline produces ventures that can operate but cannot be sold without significant manual work. When an acquisition opportunity arises, the team must improvise: manually inventorying assets, untangling shared infrastructure, preparing financial documentation, and generating due diligence artifacts under time pressure. This ad hoc process is expensive, error-prone, and slow.

The specific gaps are:
- **No exit pipeline mode** — ventures can only be "parked" or "killed" after Operations. There is no recognized phase for exit preparation.
- **No asset registry** — there is no programmatic record of what a venture consists of (code, domains, customers, integrations, brand assets) or who owns each asset.
- **No separability assessment** — ventures share EHG infrastructure (Supabase, Express server, worker scheduler) with no continuous measurement of how cleanly they could be extracted.
- **No financial data for valuation** — the Financial Sync worker checks contract existence but doesn't track MRR, ARR, churn, CAC, or LTV.
- **No data room capability** — there is no system for generating the packaged documentation and data an acquirer's technical and legal teams need.

These gaps affect all current ventures: Synthify Studios, NicheSignal AI, CreatorFlow AI, and NicheBrief AI — and will affect every future venture EHG creates.

## Personas

### The Chairman (Rick)
- **Goals**: Maximize venture value at exit, maintain portfolio visibility, make informed park/kill/sell decisions
- **Mindset**: Strategic, data-driven, wants to see acquirability alongside health metrics
- **Key activities**: Reviews portfolio dashboard, assesses exit timing, engages with acquirers, approves exit preparation

### The Acquirer's Technical Lead
- **Goals**: Assess integration risk, validate data completeness, estimate separation cost
- **Mindset**: Skeptical, detail-oriented, looking for hidden dependencies and technical debt
- **Key activities**: Reviews data room, runs sandbox environments, evaluates infrastructure entanglement, produces technical due diligence report

### The Acquirer's Business Analyst
- **Goals**: Validate financial metrics, assess customer health, confirm unit economics
- **Mindset**: Numbers-focused, wants auditable data with provenance
- **Key activities**: Reviews revenue history, churn analysis, customer acquisition costs, growth trajectory

### EVA (The Autonomous Pipeline)
- **Goals**: Compute separability scores, maintain asset registry, generate data room artifacts, flag score degradation
- **Mindset**: Continuous, automated, event-driven
- **Key activities**: Runs scoring workers, updates asset ledger, produces export packages, alerts on regressions

## Information Architecture

### Views and Routes
- `/chairman/portfolio/exit-readiness` — Portfolio-level acquirability overview (all ventures, scores, exit models)
- `/chairman/ventures/:id/exit` — Per-venture exit dashboard (asset registry, separability score history, data room status)
- `/chairman/ventures/:id/data-room` — Data room viewer (generated artifacts, completeness %)
- `/chairman/ventures/:id/separation-plan` — Separation plan with dependency map and dry-run status

### Data Sources
- `venture_asset_registry` — Asset inventory with provenance
- `venture_exit_profiles` — Per-venture exit model, target buyer type, readiness score
- `venture_separability_scores` — Time-series separability assessments
- `venture_data_room_artifacts` — Generated due diligence documents
- Existing: `ventures.pipeline_mode` (extended with `exit_prep`, `divesting`, `sold`)
- Existing: `venture_financial_contract`, `eva_scheduler_metrics`

### Navigation
- Exit readiness is a tab within the existing Chairman venture detail view
- Portfolio-level view is accessible from the main Chairman dashboard
- Data room is a sub-view of the exit dashboard

## Key Decision Points

### Decision 1: When to enter Exit Preparation
- Trigger: Manual chairman action (not automated)
- The acquirability score is informational — it informs the decision but doesn't make it
- A soft-gate warns if separability score has degraded below threshold for 3+ months

### Decision 2: Exit model selection per venture
- Mutable attribute with version history (may change as acquirer pool becomes clearer)
- Options: `full_acquisition`, `licensing`, `revenue_share`
- Each model has different data room requirements and separation scope

### Decision 3: Separation validation frequency
- During Operations: quarterly dry-run assessment (lightweight — schema analysis + dependency scan)
- During Exit Prep: full separation rehearsal (heavyweight — attempted standalone deployment)
- Dry-run failures produce actionable work items, not blockers

### Decision 4: Asset provenance depth
- Phase 1: Current-state inventory (what assets exist, who owns them)
- Phase 2: Event-sourced ledger (when each asset was added/modified, by whom, under what terms)
- Phase 2 is required for licensing and revenue share models where IP chain matters

## Integration Patterns

### With Existing Pipeline (Stages 0-25)
- Acquirability criteria added as evaluation dimensions in stage templates (not new gates — added to existing gate evaluations)
- Stage 0: "Is this venture concept separable by design?"
- Build stages (18-22): "Are shared infrastructure dependencies documented?"
- Launch stage (24): "Is the asset registry complete for launch?"
- These are soft criteria that contribute to scores, not hard blockers

### With Operations Mode Workers
- New `ops_separability_score` worker (hourly) — computes separability based on infrastructure dependency scan
- Extended `ops_financial_sync` — when Stripe integration is built, feeds MRR/ARR into exit profile
- Extended `ops_status_snapshot` — includes separability score in snapshot
- New `ops_data_room_refresh` worker (daily) — regenerates stale data room artifacts

### With EVA Master Scheduler
- New domain handlers registered via `registerExitReadinessHandlers(domainRegistry)`
- Follows the same pattern as `registerOperationsHandlers()` in `domain-handler.js`

### With Chairman Dashboard
- New views consume existing `/api/eva/operations/status` (extended) plus new `/api/eva/exit/*` endpoints
- Real-time updates via Supabase Realtime on `venture_separability_scores` and `venture_data_room_artifacts`

## Evolution Plan

**All 3 phases completed** — Orchestrator SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001 (Children A, B, C). See `docs/plans/venture-exit-readiness-architecture.md` for detailed deliverables per phase.

### Phase 1: Foundation (Asset Registry + Exit Modes) — COMPLETED
- Add `exit_prep`, `divesting`, `sold` to `pipeline_mode` CHECK constraint
- Create `venture_asset_registry` table with provenance fields
- Create `venture_exit_profiles` table (exit model, target buyer type, readiness metadata)
- API endpoints for CRUD operations on assets and exit profiles
- Chairman UI: exit readiness tab on venture detail view

### Phase 2: Scoring + Workers — COMPLETED
- Create `venture_separability_scores` table (time-series)
- Implement `ops_separability_score` worker (infrastructure dependency analysis)
- Implement `ops_data_room_refresh` worker (artifact generation)
- Extend existing operations workers with exit-relevant data
- Chairman UI: separability score history chart, data room status

### Phase 3: Stage Integration + Validation — COMPLETED
- Add acquirability criteria to stage templates (0, 18-22, 24) — 7 analysis step files
- Implement separation rehearsal capability (5-dimension engine with weighted scoring)
- Data room templates for 6 exit models (full_acquisition, licensing, acqui_hire, revenue_share, merger, wind_down)
- Chairman V3 UI: `PortfolioExitReadiness.tsx` (portfolio dashboard), `SeparationPlanView.tsx` (venture detail)
- 115 unit tests, 4 Phase 3 API endpoints

## Out of Scope

- **Legal entity creation** — The system tracks which legal entity owns each asset but does not create LLCs, draft IP assignment agreements, or file paperwork.
- **Acquirer discovery / matchmaking** — Finding buyers is a business development function. The system prepares ventures for sale; it does not find buyers.
- **Post-acquisition integration support** — Once a venture is sold, the pipeline's job is done. Buyer integration is the buyer's responsibility.
- **Pricing / valuation models** — The system provides data for valuation (financials, metrics, asset inventory) but does not compute a price or multiple.
- **Acqui-hire support** — Originally excluded from scope but implemented in Phase 3 as one of 6 supported exit models (full_acquisition, licensing, acqui_hire, revenue_share, merger, wind_down).

## UI/UX Wireframes

### Portfolio Exit Readiness View
```
┌─────────────────────────────────────────────────────────┐
│ Portfolio Exit Readiness                                │
├──────────────┬──────────┬─────────┬─────────┬──────────┤
│ Venture      │ Mode     │ Exit    │ Separ.  │ Data Rm  │
│              │          │ Model   │ Score   │ Complete │
├──────────────┼──────────┼─────────┼─────────┼──────────┤
│ Synthify     │ ops      │ full    │ 72%     │ 45%      │
│ NicheSignal  │ ops      │ license │ 84%     │ 68%      │
│ CreatorFlow  │ exit_prep│ full    │ 91%     │ 92%      │
│ NicheBrief   │ build    │ —       │ 31%     │ 12%      │
└──────────────┴──────────┴─────────┴─────────┴──────────┘
```

### Venture Exit Dashboard
```
┌─────────────────────────────────────────────────────────┐
│ CreatorFlow AI — Exit Preparation                       │
├─────────────────────────────────────────────────────────┤
│ Exit Model: Full Acquisition    Status: exit_prep       │
│                                                         │
│ ┌─ Separability Score ──────────────────────────────┐   │
│ │  91% ████████████████████░░  (+3% from last month) │   │
│ │  History: 78% → 82% → 88% → 91%                   │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Asset Registry (14 assets) ──────────────────────┐   │
│ │  Code Repos: 2    Domains: 1    Integrations: 4   │   │
│ │  Customers: 847   Brand Assets: 3   API Keys: 4   │   │
│ │  ⚠ 1 asset missing provenance (domain ownership)  │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Data Room (92% complete) ────────────────────────┐   │
│ │  ✓ Financial summary   ✓ Customer list            │   │
│ │  ✓ Technical arch doc  ✓ Dependency map           │   │
│ │  ✓ Integration inventory  ○ Separation rehearsal  │   │
│ │  Last refreshed: 2h ago                           │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ [Enter Divestiture Mode]  [Generate Data Room Export]   │
└─────────────────────────────────────────────────────────┘
```

## Success Criteria

1. **Every venture has an asset registry** within 30 days of entering Build phase (Stage 18)
2. **Separability score is computed hourly** for all ventures in Operations or Exit Prep mode
3. **Data room can be generated on demand** in under 5 minutes for any venture in Exit Prep mode
4. **Exit preparation phase reduces M&A timeline** — target: 50% reduction from current ad hoc baseline
5. **Zero "surprise" shared infrastructure dependencies** during due diligence — all dependencies surfaced by the separability scorer before buyer engagement
6. **Acquirability criteria are evaluated** at every stage gate from Stage 0 onward (as soft criteria, not blockers)
7. **Multiple exit models supported** per venture with model-specific data room templates
