# Brainstorm: Mental Models vs Forecasting Models — Naming Disambiguation

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: PortraitPro AI (active)
- **Related SDs**: SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001 (in_progress), SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J (completed)

---

## Problem Statement

The EHG codebase has two distinct concepts both using the word "models":

1. **Modeling Module** (`lib/eva/stage-zero/modeling.js`) — Horizontal forecasting infrastructure that generates financial projections (revenue, TAM/SAM/SOM, unit economics, growth trajectories) for venture candidates during Stage 0 evaluation. DB table: `modeling_requests`.

2. **Mental Models Repository** (SD in progress) — Cognitive decision frameworks (First Principles Thinking, Inversion, JTBD, etc.) applied across the 25-stage venture workflow to improve analytical quality and track effectiveness.

As the Mental Models SD builds out, the generic term "Modeling Module" becomes ambiguous. A comprehensive rename of "Modeling" → "Forecasting" is needed across code, database, and SD references.

## Discovery Summary

### Current Surface Area

| Artifact | Current Name | Proposed Name |
|----------|-------------|---------------|
| Code file | `lib/eva/stage-zero/modeling.js` | `lib/eva/stage-zero/forecasting.js` |
| Test file | `test/unit/modeling.test.js` | `test/unit/forecasting.test.js` |
| DB table | `modeling_requests` | `forecasting_requests` |
| Barrel export | `index.js` → `'./modeling.js'` | `index.js` → `'./forecasting.js'` |
| Orchestrator import | `stage-zero-orchestrator.js` | Updated import path |
| Services index | `lib/eva/services/index.js` | Updated import path |
| DB indexes | `idx_modeling_requests_*` | `idx_forecasting_requests_*` |
| RLS policies | `modeling_requests_service_all` | `forecasting_requests_service_all` |

### What Does NOT Change
- Function names: `generateForecast()`, `calculateVentureScore()` — already correctly named
- JSON field names in venture brief metadata — backward compatible
- `FINANCIAL_MODELING` references in vision docs — already domain-qualified

### User Decision
- **Scope**: Comprehensive rename (code + DB + SD references)
- **Level**: File rename, import updates, DB migration, documentation

---

## Analysis

### Arguments For
1. **Eliminates naming collision** — `forecasting.js` + `mental-models/` is unambiguous
2. **Self-documenting code** — developers immediately understand the domain distinction
3. **Function names already align** — `generateForecast()`, `calculateVentureScore()` don't need changing
4. **Small blast radius** — 5-7 code files, 1 DB table, 1 test file
5. **Optimal timing** — mental models SD hasn't merged yet, worktree is on separate branch

### Arguments Against
1. **"Forecasting" may need further qualification later** — if market/demand forecasting is added
2. **DB migration is non-trivial** — table + indexes + RLS policies must be atomic
3. **Worktree merge ordering matters** — rename must coordinate with mental models branch

---

## Architecture: Tradeoff Matrix

| Dimension | Weight | Option A: `forecasting` | Option B: `financial-forecasting` | Option C: Status quo (no rename) |
|-----------|--------|------------------------|----------------------------------|----------------------------------|
| Complexity | 20% | 8/10 (simple rename) | 7/10 (longer name) | 10/10 (no work) |
| Maintainability | 25% | 8/10 (clear distinction) | 9/10 (maximally explicit) | 3/10 (growing confusion) |
| Performance | 20% | 10/10 (no impact) | 10/10 (no impact) | 10/10 (no impact) |
| Migration effort | 15% | 7/10 (moderate) | 6/10 (more files) | 10/10 (none) |
| Future flexibility | 20% | 7/10 (may need qualifier later) | 9/10 (domain-qualified) | 2/10 (collision worsens) |

**Weighted Scores**:
- Option A (`forecasting`): **8.0** — best balance of simplicity and clarity
- Option B (`financial-forecasting`): **8.3** — maximum future-proofing, slightly more work
- Option C (no rename): **6.5** — technical debt accumulates

**Recommendation**: Option A (`forecasting`) for now. If/when additional forecasting domains are added (market, capacity), qualify at that point.

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. DB has distributed read paths (views, RLS policies, indexes) beyond the table itself — renaming the table alone misses dependent objects
  2. The Mental Models Repository introduces its own semantic collisions at Layer 1-2 — the rename shifts the collision point rather than eliminating it
  3. Transitive imports through barrel/index files aren't counted in the "6-7 files" estimate
- **Assumptions at Risk**:
  1. "Forecasting" may collide later with market forecasting, demand forecasting, capacity forecasting
  2. Integration semantics between forecasting output and mental model output are underspecified
  3. The "6-7 files" count understates the maintenance burden when including tests, mocks, docs, worktree copies
- **Worst Case**: Rename succeeds but creates a slow-burn naming debt as "forecasting" becomes overloaded in 6-12 months. Integration between forecast scores and mental model effectiveness tracking is ad-hoc.

### Visionary
- **Opportunities**:
  1. Semantic clarity as architectural documentation — `forecasting.js` immediately signals "quantitative projections" vs "qualitative frameworks"
  2. Composability signal — clean naming enables Mental Models → Forecasting integration patterns (e.g., "ventures using Inversion + forecast >70 = 84% Stage 3 pass rate")
  3. Scope precision — "Forecasting" is narrower than "Modeling", preventing scope creep into the module
- **Synergies**: Stage 0 data flow becomes self-documenting: `Path → Synthesis (13 + mental model component) → [Forecasting] → Chairman Review`
- **Upside Scenario**: Mental Models Phase 1 ships with zero naming confusion. Effectiveness tracking cleanly correlates `mental_model_effectiveness` with `forecasting_requests` data. Code review velocity improves.

### Pragmatist
- **Feasibility**: 6/10 (moderate — low risk code change, medium risk DB migration)
- **Resource Requirements**: 3-4 hours (1 session), 1 engineer, single coordinated PR
- **Constraints**:
  1. Worktree blocking order — mental models SD must not be rebased during rename window
  2. DB migration requires production access and must be atomic with code changes
  3. Documentation schema may be auto-generated and needs re-generation after rename
- **Recommended Path**: Execute in next 1-2 sessions before mental models SD merges. Single PR with code + migration (can't split).

### Synthesis
- **Consensus**: Rename is necessary, timing is optimal, blast radius is manageable
- **Tension**: `forecasting` vs `financial-forecasting` (current sufficiency vs future-proofing)
- **Composite Risk**: Low-Medium

---

## Open Questions
1. Should we use `forecasting` or `financial-forecasting` as the qualifier? (Team leans toward `forecasting` for simplicity)
2. Are there any Supabase views or RPC functions that reference `modeling_requests` beyond the direct table?
3. Should the SD title for the completed `SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J` be retroactively updated from "Modeling Module" to "Forecasting Module"?

## Suggested Next Steps
1. **Create an SD** for the comprehensive rename (code + DB + docs)
2. Coordinate with mental models SD worktree merge timing
3. Execute as single atomic PR: file rename + import updates + DB migration + doc updates
