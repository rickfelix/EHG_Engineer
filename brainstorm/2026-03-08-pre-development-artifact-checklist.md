# Brainstorm: Pre-Development Artifact Checklist & Quality Gates

## Metadata
- **Date**: 2026-03-08
- **Domain**: protocol
- **Phase**: mvp (formalizing artifact prerequisites before EXEC phase)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (LEO Protocol gate infrastructure)
- **Source**: Chairman final cut — item retained from SD-RESEARCH-LIFECYCLE_GATES-20260309-013

---

## Problem Statement
EHG's LEO Protocol has a sophisticated gate system — 40+ gates across 4 phase transitions, type-aware scoring, progressive preflight, and 3-tier auto-heal. But the gates are scattered across 5 executor directories with no unified "readiness dashboard" that tells you whether all prerequisite artifacts are complete before an SD enters EXEC (implementation). The infrastructure exists to enforce artifact requirements; it just needs orchestration at a higher level. Specifically: brainstorm docs, vision docs, architecture plans, PRDs, and EVA registrations are sometimes created and sometimes skipped depending on the developer's diligence, not on systematic enforcement. The recently merged SD-type-aware gates (PR #1890) and progressive preflight provide the foundation — the question is whether to add a unified pre-EXEC artifact checklist on top of this foundation.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist's exploration revealed that 90% of the infrastructure already exists:

**Gate Infrastructure (Comprehensive):**
- **BaseExecutor** (`scripts/modules/handoff/executors/BaseExecutor.js`, 1,021 LOC): Template method pattern orchestrating all phase transitions
- **ValidationOrchestrator** (`scripts/modules/handoff/validation/ValidationOrchestrator.js`, 949 LOC): Gate execution coordinator with retry logic
- **Phase-specific gate directories**: LEAD-TO-PLAN (8 gates), PLAN-TO-EXEC (16+ gates), EXEC-TO-PLAN (21+ gates), PLAN-TO-LEAD (16+ gates)
- **Database-driven rules**: `leo_validation_rules` table enables dynamic gate policy override
- **SD Type Awareness**: Different blocking/advisory behavior per SD type (feature, infrastructure, fix, etc.)

**Already Validated at PLAN-TO-EXEC:**
- PRD exists and status = 'approved' (GATE_PRD_EXISTS)
- Architecture verification (GATE_ARCHITECTURE_VERIFICATION)
- Exploration audit (≥5 files documented — currently advisory only)
- Planning completeness with 3-ring model (GATE_PLANNING_COMPLETENESS)
- Vision dimension completeness (GATE_VISION_DIMENSION_COMPLETENESS)
- Architecture requirement trace (GATE_ARCHITECTURE_REQUIREMENT_TRACE)

**Gaps Identified:**
1. **No centralized artifact checklist UI** — gates are scattered, no single readiness summary
2. **EVA registration not enforced** — vision scores checked but brainstorm/vision/architecture document presence not required
3. **PRD exec_checklist not validated at PLAN-TO-EXEC** — only checked at EXEC-TO-PLAN (after implementation)
4. **Exploration audit is advisory-only** — warns but doesn't block
5. **No phase coverage gate in PLAN-TO-EXEC** — phase-coverage-validator.js exists but isn't wired in
6. **No orchestrator coherence check at PLAN-TO-EXEC** — only validated in LEAD phase

### What Must Be Built
- **Unified PRE-EXEC-READINESS gate** (~100-150 LOC): Aggregate artifact checks into single gate with missing-artifacts summary
- **EVA artifact registration gate** (~80-120 LOC): Validate vision + architecture docs exist in EVA
- **PRD exec_checklist validation** (~40-60 LOC): Check exec_checklist exists at PLAN-TO-EXEC
- **Elevate exploration audit to blocking** (~20 LOC): Feature/infrastructure/database types require 5+ files
- **Orchestrator coherence gate** (~100-150 LOC): Child dependencies validated at PLAN-TO-EXEC

## Analysis

### Arguments For
- 90% of infrastructure already exists — this is configuration, not construction
- The recently shipped type-aware gates and progressive preflight provide the perfect foundation
- Artifacts created to pass gates become AI training data — improving LEO's future performance
- Chairman gets predictability: work is legible before code is written
- Rework caught at artifact stage costs 10-100x less than rework caught in production
- Cross-venture learning can correlate artifact quality with implementation outcomes
- Genesis customers benefit from the same artifact pipeline (scaling readiness)

### Arguments Against
- **Gate count is already high** (8+ validation checkpoints in the pipeline) — adding more risks gate fatigue
- **Small work items suffer disproportionately** — a 15-line config fix doesn't need a brainstorm doc
- **Artifact existence ≠ artifact utility** — developers create boilerplate to pass gates (compliance theater)
- **EVA registration as gate is premature** — EVA intake redesign itself is still in design phase
- **Automation creates workaround incentives** — people who skip artifacts are the same people who'll find bypasses
- **No evidence from retrospectives** that missing artifacts caused implementation failures
- **The type-aware gates just shipped** (PR #1890) — evaluate their impact before adding another layer
- **Staleness risk** — artifacts written weeks before implementation may create false confidence

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 9/10 (Comprehensive gate infrastructure, 40+ gates, database-driven rules, type-aware scoring) |
| Coverage | 7/10 (Strong validation but no unified pre-EXEC readiness check, EVA registration optional) |
| Edge Cases | 4 identified |

**Edge Cases**:
1. **Quick-fix and bugfix SDs** (Common) — Should not require brainstorm/vision/architecture docs. Type-awareness must exempt Tier 1/2 work items.
2. **Retrospective auto-generation quality** (Known) — Auto-generated artifacts always fail quality gates (MEMORY.md documented pattern). Same risk for auto-generated brainstorm/vision docs.
3. **Stale artifacts** (Moderate) — Architecture doc written 3 weeks before implementation may no longer reflect current codebase. No recency enforcement mechanism.
4. **EVA intake redesign dependency** (Moderate) — Making EVA registration a gate couples development lifecycle to a system still under construction.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Problem may be misdiagnosed — existing gates should already catch missing artifacts; if they don't, the issue is enforcement not coverage (2) Small work items suffer disproportionately — 15-line fixes don't need full artifact chains (3) EVA registration as gate is premature — coupling to a system under construction (4) Artifact existence ≠ artifact utility — compliance theater risk (5) Gate count already high — 8+ checkpoints, adding more risks fatigue
- **Assumptions at Risk**: (1) "More validation = better outcomes" — inverted U-curve in process research (2) "All SD types need same artifacts" — type-aware gates just shipped, evaluate first (3) "Automation prevents skipping" — emergency bypass and workaround culture (4) "Missing artifacts cause failures" — may be poor scoping, changing requirements instead (5) "Checklist will be maintained" — process debt accumulates faster than code debt
- **Worst Case**: Compliance theater — developers create minimum-viable artifacts to pass gates (2-sentence brainstorms, restated titles as visions). Gate pass rates look great (95%). Development velocity drops 15-20%. Quality doesn't measurably improve. System becomes a ratchet — gates only get added, never removed.

### Visionary
- **Opportunities**: (1) Quality compounding — each SD builds on validated foundations, exponential improvement (2) Institutional knowledge as living asset — every decision becomes searchable (3) AI performance flywheel — well-structured artifacts are training data that makes LEO smarter (4) Predictability for chairman — work is legible before code is written (5) Rework elimination at source — 10-100x cheaper to catch at requirements vs production (6) Team scaling readiness — artifact chain IS the onboarding for new contributors (7) Audit trail for enterprise trust
- **Synergies**: LEO Phase Transitions (natural enforcement point), EVA Registration Pipeline (mandatory not optional), Heal Command (verify against full artifact chain not just PRD), Learn Command (correlate artifact quality with outcomes), SD Type-Aware Gates (type-specific artifact requirements), Progressive Preflight (artifact completeness as fast-fail), Brainstorm Pipeline (formalize informal intake-to-SD chain)
- **Upside Scenario**: 6-12 months — artifact coverage 95%+, rework rate drops from ~25% to ~8%, LEO auto-generates draft artifacts with 70% acceptance rate by month 9, estimation accuracy within 20%, Genesis ships artifact pipeline as customer-facing feature.

### Pragmatist
- **Feasibility**: 8/10 — Gate infrastructure is mature, modular, extensible. 40+ gates already implemented. Database-driven rules allow dynamic configuration. Missing pieces are ~400-500 LOC across 5 small additions.
- **Resource Requirements**: 1-2 SDs, estimated 2-3 weeks total. Unified PRE-EXEC-READINESS gate (150 LOC), EVA registration gate (120 LOC), PRD exec_checklist validation (60 LOC), exploration audit elevation (20 LOC), orchestrator coherence gate (150 LOC).
- **Constraints**: (1) Must be type-aware — no artifact burden on Tier 1/2 work (2) EVA registration gate should be advisory until EVA intake redesign is built (3) Quality checks needed alongside existence checks (4) Must not slow down quick fixes
- **Recommended Path**: Start with the unified PRE-EXEC-READINESS gate — it's the most impactful single addition. Make it type-aware from day 1. EVA registration starts advisory, graduates to blocking after EVA intake redesign ships. Evaluate impact of type-aware gates (PR #1890) before adding blocking artifact gates.

### Synthesis
- **Consensus Points**: (1) Infrastructure is 90% built — this is small incremental work (all 3 agree); (2) Must be type-aware — no artifact burden on small fixes (Challenger + Pragmatist); (3) Artifact quality matters more than artifact existence (Challenger + Visionary agree)
- **Tension Points**: (1) Challenger warns about gate fatigue and compliance theater vs Visionary sees quality compounding and AI training data; (2) Challenger recommends waiting for type-aware gate data vs Pragmatist wants to build now; (3) Challenger prefers soft warnings vs Pragmatist recommends blocking gates with type-awareness
- **Composite Risk**: Low — the work is small (~500 LOC), highly incremental, and builds on mature infrastructure. The strategic risk is compliance theater (artifacts created to pass gates without providing value), mitigated by quality checks and type-awareness.

## Open Questions
- Should the artifact checklist be blocking or advisory for the first 30 days? (Proposed: advisory first, blocking after calibration)
- Which artifacts are required for which SD types? (Proposed: feature/infrastructure require all 5; fix/bugfix require only PRD; documentation requires nothing)
- Should artifact recency be enforced? (e.g., architecture doc must be <30 days old)
- How do we measure whether artifact gates actually reduce rework? (Proposed: learn command correlation analysis)
- Should EVA registration be required before or after the EVA intake redesign ships?

## Suggested Next Steps
1. Create a single SD from this brainstorm — the work is ~500 LOC across 5 small gate additions
2. Start with unified PRE-EXEC-READINESS gate as the primary deliverable
3. Make type-aware from day 1 — no artifact burden on quick fixes
4. EVA registration starts advisory, graduates to blocking post-EVA-intake-redesign
5. Include quality checks (not just existence checks) for brainstorm and vision artifacts
