# Brainstorm: Acquisition Readiness Gap Remediation

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (portfolio-level feature)
- **Related Brainstorm**: "Venture Acquisition-Readiness Architecture" (2026-03-05) — the original brainstorm that produced the orchestrator SD

---

## Problem Statement

The completed orchestrator SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001 (3 phases, 3 child SDs) delivered 90% of the specified scope. A gap analysis identified two concrete implementation gaps:

1. **Route Registration Gap** — PRD FR-7 and FR-8 specified standalone routes for PortfolioExitReadiness (`/chairman/portfolio/exit-readiness`) and SeparationPlanView (`/chairman/ventures/:id/separation-plan`). Components exist and work but are only accessible as embedded tabs in VentureDetail.tsx — no standalone route pages were created.

2. **Per-PR Separability Delta** — The original SD scope included CI integration for computing how each PR affects venture separability. This was intentionally deferred during implementation.

## Discovery Summary

### Current State
- **PortfolioExitReadiness** (280 lines) — props-based portfolio dashboard. Exported from `chairman-v3/index.ts` but has no page integration or route.
- **SeparationPlanView** (361 lines) — props-based per-venture view. Embedded as tab in `VentureDetail.tsx` (lines 236, 311) but no standalone route.
- **Chairman V3** has 11 routes in `chairmanRoutesV3.tsx`, all lazy-loaded via `LazyRoute` + `ProtectedRouteWrapper` pattern.
- **Separation rehearsal engine** exists at `lib/eva/exit/separation-rehearsal.js` (497 lines), scoring 5 dimensions with PASS_THRESHOLD=70.
- **4 API endpoints** exist in `server/routes/eva-exit.js` for data fetching.

### Decisions Made
- **Route registration**: Option C — Keep tabs AND add standalone pages (both access patterns serve different mental models)
- **Separability delta**: Option B — npm run script (not GitHub Action). Engine scores DB state, not code diff, so CI would show zero delta.
- **Snapshot storage**: Option B — Database table (over filesystem JSON). Scored 8.10/10 in tradeoff matrix vs 5.85/10 for filesystem.

## Analysis

### Arguments For
1. **PRD compliance** — FR-7 and FR-8 explicitly specify standalone routes
2. **Deep-linkability** — standalone routes enable bookmarking/sharing for acquisition discussions
3. **Separability trajectory** — delta snapshots over time become a differentiated M&A asset
4. **Low effort, high option value** — ~1 week total for both gaps

### Arguments Against
1. **Dual-path data consistency risk** — two code paths fetching the same data can diverge
2. **Manual delta script adoption** — without CI enforcement, may be unused when it matters
3. **Maintenance surface expands** — 13 routes instead of 11, plus a new CLI tool

### Tradeoff Matrix: Snapshot Storage

| Dimension | Weight | Filesystem JSON | DB Table | Hybrid |
|-----------|--------|----------------|----------|--------|
| Complexity | 20% | 9/10 | 5/10 | 4/10 |
| Maintainability | 25% | 7/10 | 8/10 | 5/10 |
| Portability | 15% | 3/10 | 9/10 | 8/10 |
| Auditability | 20% | 4/10 | 9/10 | 9/10 |
| Future flexibility | 20% | 5/10 | 9/10 | 8/10 |

**Winner: DB Table (8.10/10)** — filesystem scored < 3 on portability (critical weakness in acquisition context).

Proposed table: `separability_snapshots` with columns `(id, venture_id, dimension_scores, overall_score, snapshot_type, triggered_by, created_at)`.

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Dual data paths (tab wrapper vs page wrapper) will diverge unless tightly coupled via shared hooks
  2. No deprecation plan for tab embeddings — maintenance surface doubles indefinitely
  3. Delta script snapshots are ephemeral without a persistence layer
- **Assumptions at Risk**:
  1. DB state may not reflect actual separability (aspirational vs real coupling)
  2. LazyRoute doesn't protect against data-fetching waterfalls in portfolio view
  3. Manual process won't be followed under time pressure
- **Worst Case**: Standalone page and tab show different scores during due diligence → trust-destroying inconsistency

### Visionary
- **Opportunities**:
  1. Standalone pages become investor-facing surfaces with minimal permission layer
  2. Delta snapshots as time-series produce separability trajectory charts
  3. Props-based pattern enables PDF/export pipeline for board reporting
- **Synergies**: Delta script plugs into existing rehearsal engine with zero duplication; lazy-loading pattern keeps new routes Tier 2 LOC
- **Upside Scenario**: Acquirers receive defensible separability history tied to specific engineering decisions — commands a premium

### Pragmatist
- **Feasibility**: GAP 1 = 3/10, GAP 2 = 5/10
- **Resource Requirements**: 1 developer, ~1 week, no external dependencies
- **Constraints**: Snapshot storage decision is blocking for GAP 2; page wrappers need error boundaries
- **Recommended Path**: GAP 1 first (2-3 hours, establishes data-fetching patterns), then GAP 2 (4-6 hours)

### Synthesis
- **Consensus Points**: Both gaps worth closing, GAP 1 is straightforward, snapshot storage is the critical decision for GAP 2
- **Tension Points**: Dual-path consistency (Challenger) vs different mental models (Visionary) — resolved by shared data-fetching hook
- **Composite Risk**: Low-Medium

## Open Questions
1. Should the delta script auto-trigger at SD completion (Visionary's suggestion) or remain manual-only?
2. Should the portfolio exit readiness page aggregate all ventures or only active ones?
3. What retention policy for separability snapshots? (Keep all vs rolling window)

## Suggested Next Steps
1. Create a corrective SD to address both gaps
2. GAP 1 first: 2 page wrappers + route registration in chairmanRoutesV3.tsx
3. GAP 2 second: `separability_snapshots` table + npm run script
4. Shared data-fetching hook to mitigate Challenger's dual-path concern
5. Future: wire delta into post-completion pipeline for automatic trajectory tracking
