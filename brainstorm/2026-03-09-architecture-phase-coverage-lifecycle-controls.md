# Brainstorm: Architecture Phase Coverage — Lifecycle Controls for Preventing Silent Phase Drops

## Metadata
- **Date**: 2026-03-09
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (user-directed)
- **Related Ventures**: None (protocol-wide)

---

## Problem Statement

Architecture plans define implementation phases (e.g., Phase 1: Schema, Phase 2: CLI, Phase 3: UI). When orchestrator SDs are created, they sometimes only create children for a subset of phases. The remaining phases — especially those marked "separate orchestrator" — are never turned into SDs and silently disappear from the work queue.

**Proven incident**: Strategic Roadmap (`SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001`) architecture plan defined 3 phases. The orchestrator created children for Phases 1-2 (database + CLI). Phase 3 (Planning tab UI on the Vision route) was marked "Separate Orchestrator — EHG Frontend" but no SD was ever created. The orchestrator completed, Phase 3 vanished, and the gap was only discovered when the Chairman asked "where's the third tab?"

**Recurrence**: This is not the first instance. The user has seen planned phases disappear after orchestrator completion before. Gaps resurface randomly when something looks wrong in the UI or during reviews.

**Existing control**: An `ARCHITECTURE_PHASE_COVERAGE` gate exists at LEAD-TO-PLAN, but it was built _after_ the Strategic Roadmap orchestrator had already passed that point. It also only fires at entry — nothing checks phase coverage at orchestrator exit.

## Discovery Summary

### Evidence
- Strategic Roadmap Phase 3 (Planning tab) defined in `docs/plans/strategic-roadmap-artifact-architecture.md` lines 253-260
- Architecture plan explicitly states "Separate Orchestrator — EHG Frontend" and "Must sequence after pipeline redesign Phase 5 GUI work"
- The `SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001` SD (completed 2026-03-08) added the LEAD-TO-PLAN gate but does NOT cover orchestrator completion
- HEAL scoring checks vision/architecture quality dimensions (V01-V11, A01-A07) but NOT phase delivery completeness
- Orchestrators skip `/heal` entirely — they don't produce code directly
- The `VISION_COMPLETION_SCORE` gate at PLAN-TO-LEAD is advisory-only (always passes) and only checks for score drift, not phase coverage

### Root Cause Chain
1. Architecture plan defines 3 phases → ✅ Correct
2. Orchestrator creates children for Phases 1-2 → ✅ Correct (Phase 3 was "separate orchestrator")
3. Phase 3 has no mechanism to persist as a work item → ❌ **Gap**
4. Orchestrator completes after Phases 1-2 finish → ❌ **No exit gate checks phase coverage**
5. Phase 3 exists only in a markdown doc that nobody re-reads → ❌ **No visibility**
6. sd:next shows the SD queue, which has no concept of "planned but unscheduled" work → ❌ **No surfacing**

### User Requirements
- **Hard blocks**: Orchestrator cannot complete if architecture phases are unaccounted for
- **Both entry and exit**: Gate at LEAD-TO-PLAN (already exists) AND gate at LEAD-FINAL-APPROVAL (new)
- **Visibility**: Remaining work must be visible in the Chairman UI and in sd:next output
- **Automatic**: Controls must not depend on human memory — uncovered phases must auto-surface

## Analysis

### Arguments For

1. **Eliminates a proven failure mode** — This isn't theoretical; Phase 3 of Strategic Roadmap was already lost
2. **Four-layer defense** — Proactive (auto-generate phase SDs at creation) + Preventative (hard block at completion) + Detective (roadmap auto-promote) + Actionable (sd:next awareness) means redundant safety
3. **Leverages existing infrastructure** — Roadmap tables already exist (strategic_roadmaps, roadmap_waves, roadmap_wave_items), sd:next already reads from multiple sources, phase-coverage-validator.js already has the comparison logic
4. **Aligns with user's "line of sight" principle** — No work should exist only in a markdown document; everything planned must be visible somewhere in the system

### Arguments Against

1. **Chicken-and-egg for the Roadmap tab** — The Roadmap tab itself is the Phase 3 that was dropped. Must build it before it can catch future gaps. However, the hard block and sd:next integration work without the tab.
2. **Architecture plans with intentionally deferred phases** — Some phases are legitimately "not now" (e.g., "Phase 3 after pipeline redesign Phase 5"). The hard block needs an escape hatch — perhaps marking a phase as "deferred" with a reason, which auto-promotes it to the roadmap rather than blocking.
3. **Retroactive coverage** — Existing completed orchestrators won't be re-validated. Need a one-time backfill to scan for uncovered phases in all existing architecture plans and promote them to roadmap items.

## Proposed Solution: Four-Layer Phase Coverage Controls

### Layer 0: Proactive — Auto-Generate Phase SDs at Orchestrator Creation

**When**: An orchestrator SD is created via `leo-create-sd.js` with a linked architecture plan (`--arch-key`)
**What**: Parse all implementation phases from the architecture plan and auto-generate a draft SD for every phase — including those marked "separate orchestrator"
**Behavior**:
- Read `eva_architecture_plans.sections.implementation_phases` for the linked arch plan
- For each phase, create a draft SD with:
  - `title`: Phase title from the architecture plan
  - `status`: `draft`
  - `parent_sd_id`: The orchestrator's ID (for child phases) or `null` (for "separate orchestrator" phases)
  - `metadata.arch_key`: Link back to the architecture plan
  - `metadata.phase_number`: The phase number from the plan
  - `metadata.auto_generated`: `true` (distinguishes from manually created SDs)
- Update `covered_by_sd_key` on each phase in the architecture plan

**Why this matters**: The moment the orchestrator is created, ALL phases exist as draft SDs in the system. They show up in `sd:next`. They can't be forgotten. "Separate orchestrator" phases sit in draft until someone picks them up, but they're **visible from day one**.

**Edge cases**:
- If a phase says "must sequence after X," set a dependency on X in the draft SD's metadata
- If some children already exist (e.g., manual creation before this feature), skip those phases (match by phase number or title)
- Draft SDs can be cancelled if a phase is deliberately dropped — but that requires an explicit action, not silent omission

**Implementation**: Extend `scripts/leo-create-sd.js` to call a new `autoGeneratePhaseChildren(supabase, orchestratorId, archKey)` function after orchestrator creation.

### Layer 1: Preventative — Hard Block at LEAD-FINAL-APPROVAL

**When**: Orchestrator SD attempts LEAD-FINAL-APPROVAL (completion handoff)
**What**: Re-run `phase-coverage-validator.js` against the architecture plan
**Behavior**:
- If all phases have completed SDs → PASS
- If uncovered phases exist AND are not marked "deferred" → **BLOCK**
- If uncovered phases are marked "deferred" → PASS with advisory, auto-promote to roadmap (Layer 2)

**Resolution options for blocked orchestrators**:
1. Create the missing SD(s) for uncovered phases
2. Mark uncovered phase as "deferred" with rationale → phase auto-promotes to roadmap
3. Both options preserve the architectural intent — nothing is silently lost

**Implementation**: New gate in `scripts/modules/handoff/executors/lead-final-approval/gates/phase-coverage-exit.js`, reusing the existing `phase-coverage-validator.js` logic.

### Layer 2: Detective — Auto-Promote to Roadmap

**When**: A phase is marked "deferred" at the exit gate, OR a retroactive scan finds uncovered phases
**What**: Create a roadmap wave item with status "unscheduled" for the uncovered phase
**Data flow**:
```
eva_architecture_plans.sections.implementation_phases
  → uncovered phase detected
    → INSERT INTO roadmap_wave_items (
         wave_id: <default "unscheduled" wave>,
         source_type: 'architecture_phase',
         source_id: <phase reference>,
         metadata: { arch_key, phase_number, phase_title, deferred_rationale }
       )
```

**Note**: The `roadmap_wave_items.source_type` check constraint currently only allows `('todoist', 'youtube')`. This needs to be expanded to include `'architecture_phase'` as a valid source type.

**Roadmap tab on Vision page** (Phase 3 of Strategic Roadmap — must be built):
- Third tab alongside Alignment and Capabilities
- Shows roadmap waves with items, including auto-promoted architecture phases
- Unscheduled items are visually distinct (e.g., warning badge, "No SD assigned")
- Components: `PlanningTab.tsx`, `WaveSequenceView.tsx`, `WaveCard.tsx` (as designed in the original architecture plan)

### Layer 3: Actionable — sd:next Roadmap Awareness

**When**: Every time `npm run sd:next` runs
**What**: Query roadmap for unscheduled items and display them alongside the SD queue
**Display**:
```
📋 ROADMAP: 2 items unscheduled
   ❌ Strategic Roadmap Phase 3: Planning Tab UI (deferred 2026-03-09)
   ❌ EVA Pipeline Phase 4: Dashboard Integration (deferred 2026-03-08)

   Run: npm run roadmap:status for details
```

**Placement**: After the track view and before the recommendations section, so it's always visible but doesn't bury the immediate work queue.

**Implementation**: Add a `loadUnscheduledRoadmapItems()` function to `scripts/modules/sd-next/` that queries `roadmap_wave_items` where `promoted_to_sd_key IS NULL`.

## Implementation Sequence

Given the chicken-and-egg problem (Roadmap tab is itself a dropped phase), the implementation should be:

### Step 1: Auto-Generate Phase SDs (Layer 0)
- Extend `leo-create-sd.js` to parse architecture plan phases and auto-generate draft SDs
- Update `covered_by_sd_key` on each phase automatically
- **This prevents new gaps at the source — all phases become visible the moment an orchestrator is created**

### Step 2: Hard Block Gate (Layer 1)
- Add `phase-coverage-exit.js` gate to LEAD-FINAL-APPROVAL
- Add "deferred" marking capability to phase-coverage-validator
- Expand `roadmap_wave_items.source_type` constraint to include `'architecture_phase'`
- Auto-promote deferred phases to roadmap items
- **This catches anything Layer 0 missed and prevents completion with gaps**

### Step 3: sd:next Integration (Layer 3)
- Add unscheduled roadmap item query to sd:next output
- **This gives visibility even without the UI tab**

### Step 4: Retroactive Backfill
- Scan all existing architecture plans for uncovered phases
- Auto-promote discovered gaps to roadmap items
- **This catches the Strategic Roadmap Phase 3 and any other historical gaps**

### Step 5: Roadmap Tab (Layer 2 UI)
- Build the Planning tab on `/chairman/vision`
- Components from original architecture plan: PlanningTab, WaveSequenceView, WaveCard, etc.
- **This provides the Chairman UI visibility**

Steps 1-4 can proceed without Step 5. The auto-generation, hard block, and sd:next integration provide the critical controls. The Roadmap tab adds visual richness but isn't gating.

### Control Point Summary

```
ORCHESTRATOR LIFECYCLE
═══════════════════════════════════════════════════════════════

  Creation              Entry Gate           Exit Gate
  ┌──────────┐          ┌──────────┐         ┌──────────┐
  │ Layer 0  │          │ Existing │         │ Layer 1  │
  │ Auto-gen │─────────▶│ LEAD-TO- │────────▶│ LEAD-    │
  │ phase    │          │ PLAN     │         │ FINAL-   │
  │ SDs      │          │ coverage │         │ APPROVAL │
  └──────────┘          │ gate     │         │ coverage │
       │                └──────────┘         │ gate     │
       │                                     └────┬─────┘
       ▼                                          │
  All phases exist                          Uncovered phases
  as draft SDs                              either:
  from day one                              a) Block completion
                                            b) Auto-promote to
                                               roadmap (Layer 2)
                                                  │
                                                  ▼
                                     ┌────────────────────────┐
                                     │ Layer 2: Roadmap       │
                                     │ Vision → Planning tab  │
                                     │ Persistent visibility  │
                                     └────────────┬───────────┘
                                                  │
                                                  ▼
                                     ┌────────────────────────┐
                                     │ Layer 3: sd:next       │
                                     │ "2 items unscheduled"  │
                                     │ Every session sees it  │
                                     └────────────────────────┘
```

## Open Questions

1. **Deferred phase expiry**: Should deferred phases have an expiry date? After N days, escalate from advisory to blocking?
2. **Retroactive scope**: How many existing architecture plans should the backfill scan? All historical, or only plans from the last N months?
3. **Roadmap wave assignment**: Should auto-promoted phases go into an existing wave or create a new "Uncovered Phases" wave?
4. **Auto-generated SD naming**: Should auto-generated phase SDs follow a naming convention (e.g., `SD-<PARENT-KEY>-PHASE-N`) or use the phase title to derive a standard sd_key?
5. **Cancellation audit trail**: When someone cancels an auto-generated phase SD, should the system require a rationale (preventing casual dismissal of planned work)?

## Suggested Next Steps

1. Create vision and architecture documents for this solution
2. Create SD(s) — likely an orchestrator with children for each layer
3. Prioritize Layer 0 (auto-generate phase SDs) as the first child — it prevents gaps at the source
4. Layer 1 (hard block at exit) as second — catches anything Layer 0 missed
5. Layer 3 (sd:next awareness) as third — gives visibility without UI work
6. Layer 2 UI (Roadmap tab) can be sequenced after or in parallel with the Strategic Roadmap Phase 3 SD
