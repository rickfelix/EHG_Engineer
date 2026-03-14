# Brainstorm: Orchestrator Scope Governance Corrective Actions

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal protocol improvement)
- **Related Brainstorms**:
  - "Vision & Architecture Pipeline Chairman Review" (2026-03-13, sd_created)
  - "Autonomous Skunkworks R&D Department" (2026-03-13, sd_created) — the incident that surfaced these issues
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement

The LEO Protocol's brainstorm → vision → architecture → orchestrator creation pipeline has governance gaps that allow scope decisions made during upstream planning to be lost or overridden during execution. This was discovered when the R&D Orchestrator (SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001) was created with 5 children matching the brainstorm's phases instead of the refined 3-phase vision/architecture, and then 3 of those children were cancelled by LEAD without recorded justification.

The affected party is the Chairman (solo founder), who lost visibility into why scoped work was removed and had no mechanism to prevent it.

## Discovery Summary

### Incident Analysis
- **Brainstorm** (2026-03-13 12:38): Scoped 5 phases via Pragmatist recommended path
- **Vision** (same day): Refined to 3 phases, explicitly moved "Progressive Trust" to Out of Scope
- **Architecture** (same day): Followed vision's 3-phase structure
- **Orchestrator created** (12:45): 5 children matching brainstorm, not vision/architecture
- **Children C, D, E cancelled** (15:08): No cancellation reason recorded, scope_reduction_notes incomplete

### Root Cause Analysis (5-Whys per Issue)

**Issue 1: Orchestrator Created from Wrong Source Document**
- Root cause: No schema-level relationship between brainstorm → vision → architecture that enforces "use the most refined version"
- The pipeline treats these as independent artifacts, not a refinement chain

**Issue 2: Children Cancelled Without Recorded Justification**
- Root cause: The SD lifecycle treats cancellation as equivalent to any other status change — no special governance rules for scope reduction
- No NOT NULL constraint or trigger on cancellation_reason when status → cancelled

**Issue 3: No Reconciliation Between Source Docs and Orchestrator Children**
- Root cause: Architecture plan phases are prose in markdown — you can't validate children against unstructured text
- `phase-coverage.js` checks forward (phases → SDs) but not backward (SDs → phases)

**Issue 4: LEAD Has No Authority Bounds on Scope Changes**
- Root cause: LEAD has no concept of "upstream-scoped work" — it operates as if every SD is independently scoped
- The handoff system doesn't pass upstream scope context to LEAD

### User Decisions
- **Fix approach**: Both — quick patches (Phase 1) + structural redesign (Phase 2)
- **Authority model**: LEAD CANNOT reduce scope — only chairman or re-brainstorm can remove scoped work
- **Soft-kill detection**: Include in Phase 2 scope (deprioritize/defer patterns as effective scope reduction)

## Analysis

### Arguments For
1. **Proven failure** — Not theoretical. 3 unnecessary children created and cancelled in 2.5 hours today.
2. **Compounding cost** — Every future orchestrator runs through this same pipeline. Gap scales with frequency.
3. **Low-cost Phase 1** — Cancellation trigger + orphan detection + source validation is ~100-150 LOC across 3 patches.
4. **Enables autonomous trust** — Bounded LEAD authority is prerequisite for safe AUTO-PROCEED + Chaining.

### Arguments Against
1. **Overcorrection risk** — Too-rigid authority bounds could slow the pipeline more than the governance gap costs.
2. **Soft-kill circumvention** — LEAD can deprioritize/defer without "cancelling," routing around the constraint.
3. **Phase 1/Phase 2 tension** — Quick patches may become load-bearing walls that complicate structural redesign.

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Not all SD types need the full brainstorm→vision→architecture pipeline — enforcing document hierarchy could block SD types that legitimately skip vision docs
  2. Cancellation justification is paper trail, not prevention — LEAD can soft-kill children by deprioritizing, setting to draft, or assigning zero story points
  3. Architecture docs aren't versioned — reconciliation checks need to know which version was used at orchestrator creation time
- **Assumptions at Risk**:
  1. "LEAD cannot reduce scope" may be trivially circumvented by soft-kill patterns
  2. Structured architecture phases won't eliminate LLM interpretation errors in orchestrator creation
  3. Phase 1 patches and Phase 2 redesign may not coexist cleanly — temporary schema changes tend to become permanent
- **Worst Case**: Overcorrection freezes the pipeline. Chairman becomes bottleneck on every scope adjustment. LEAD lets misaligned children proceed through full PLAN→EXEC rather than cancel them, wasting more cycles.

### Visionary
- **Opportunities**:
  1. **Scope Provenance Chain** — Every scope decision becomes a ledger entry with actor, authority, justification. Queryable audit trail.
  2. **Pre-Creation Reconciliation Gate** — Shift validation left into orchestrator creation. Catches drift within seconds.
  3. **Authority-Bounded LEAD** — Machine-checkable authority bounds enable true autonomous operation under AUTO-PROCEED.
- **Synergies**: Architecture Phase Coverage SD, EVA Translation Fidelity Gate, Claim System (prevents cross-session scope invalidation), Semantic Validation Gates
- **Upside Scenario**: Strategic fidelity dashboard showing real-time ratio of brainstormed scope to delivered capabilities, with every delta accounted for.

### Pragmatist
- **Feasibility**: 5/10 overall (3/10 for Issue 1, 4/10 for Issue 2, 5/10 for Issue 3, 7/10 for Issue 4)
- **Resource Requirements**: Phase 1: 2-3 SD cycles, ~200-300 LOC. Phase 2: 4-6 SD cycles, significant DB migration.
- **Constraints**:
  1. PostgreSQL trigger ordering is alphabetical — new triggers must account for existing trigger ecosystem
  2. Architecture phases are prose, not structured IDs — Phase 1 reconciliation will be fuzzy
  3. LEAD authority bounds require policy design before code
- **Recommended Path**: Start with Issue 2 (cancellation trigger) → Issue 3 (orphan detection) → Issue 1 (source validation) → Issue 4 (authority model)

### Synthesis
- **Consensus Points**: Cancellation audit trail is highest-value quick win. Scope authority (Issue 4) is hardest and most consequential.
- **Tension Points**: Challenger warns "LEAD cannot reduce scope" may be too rigid and circumventable. Visionary sees it as enabling autonomous trust. Pragmatist says policy design must precede code.
- **Composite Risk**: Medium

## Key Architectural Decisions

### Phase 1: Quick Patches (Weeks 1-2)

| Issue | Fix | LOC | Type |
|-------|-----|-----|------|
| Issue 2 | DB trigger requiring `cancellation_reason` + `cancelled_by` when status→cancelled | ~40 | QF/Tier 2 |
| Issue 3 | Extend `phase-coverage.js` to detect orphan children (no matching architecture phase) | ~30-50 | QF/Tier 2 |
| Issue 1 | Add validation in `create-orchestrator-from-plan.js` to require architecture plan as source | ~15-25 | QF/Tier 2 |
| Issue 4 (partial) | Add `scope_authority` field to `strategic_directives_v2` | ~30 migration | Part of full SD |

### Phase 2: Structural Redesign (Weeks 3-6)

| Capability | Description |
|------------|-------------|
| Structured Phase IDs | Architecture phases become first-class JSONB records with IDs that children reference |
| Scope Change Ledger | `scope_change_events` table recording every addition/removal with actor, authority, justification |
| LEAD Authority Gate | Machine-enforceable authority bounds — LEAD cannot reduce scope marked `scope_authority='chairman'` |
| Soft-Kill Detection | Gate that detects deprioritization/deferral patterns as effective scope reduction |
| Document Versioning | Architecture docs snapshotted at orchestrator creation time for stable reconciliation |

## Open Questions
1. How should LEAD escalate when it encounters genuinely misaligned children under the new authority model?
2. Should the scope change ledger track all SD field changes or only scope-related ones?
3. What constitutes a "soft-kill" pattern? Specific thresholds for deprioritization detection?
4. Should architecture doc versioning be per-field or whole-document snapshots?

## Suggested Next Steps
1. Create vision document formalizing the scope governance architecture
2. Register in EVA for HEAL scoring
3. Create orchestrator SD with phased children (Phase 1 patches → Phase 2 structural redesign)
