# Vision: Strategic Roadmap — New Artifact Type for EVA Planning Pipeline

## Executive Summary

The EVA planning pipeline currently has a gap between classified intake items and SD creation. When Todoist tasks and YouTube videos are classified with the 3-dimension taxonomy (Application, Aspects, Intent), there is no formal artifact for grouping them into strategic clusters, linking clusters to OKRs, sequencing them by dependency and priority, and obtaining Chairman approval before creating SDs.

The Strategic Roadmap introduces a new artifact type that fills this gap. It organizes classified intake items into ordered "waves" — thematic clusters with bidirectional OKR linkage and explicit dependency rationale. The Chairman reviews AI-proposed clusters, approves wave sequencing, and the approved sequence becomes the new baseline. Approved waves then flow into the existing governance pipeline: Vision Readiness Rubric → Brainstorm → Vision → Architecture → SD creation. This creates a closed-loop pipeline from intake capture to SD execution, with the Chairman's strategic judgment embedded at the sequencing stage — upstream of the vision/architecture governance that already exists.

The key principle: the roadmap captures WHY things are sequenced the way they are — not just what comes next, but the dependency logic and OKR alignment that drives the ordering. It is dependency-driven, not calendar-driven — no timeboxing, because duration estimates are unreliable.

## Problem Statement

**Who is affected**: The Chairman (sole user/strategist) who manages strategic planning across 3 active ventures and the EHG platform.

**Current impact**:
- After intake classification, items go directly to the Vision Readiness Rubric or ad-hoc SD creation with no grouping or sequencing step
- The Chairman must hold sequencing logic, dependency awareness, and OKR alignment in memory across sessions
- There is no way to answer "are we executing the plan?" — only "are individual SDs complete?"
- No baseline exists for intake-to-execution flow; baseline system only tracks SD execution, not pre-SD planning
- No formal link between classified intake items and the OKRs they would advance
- Vision documents have Evolution Plans but no mechanism to operationalize them into concrete waves

## Personas

### Chairman (Rick Felix)
- **Goals**: Maintain strategic clarity across all ventures; sequence work by dependency and strategic importance; ensure intake items advance OKRs rather than becoming ad-hoc work; preserve sequencing rationale for future reference
- **Mindset**: Dependency-driven planning (not calendar-driven); trusts AI for clustering proposals but requires approval authority over sequencing; values seeing the whole picture — waves, OKRs, and progress — in one view
- **Key Activities**: Reviews AI-proposed wave clusters; approves or resequences waves; links waves to existing OKRs and proposes new OKRs when intake reveals untracked objectives; promotes approved waves to SD creation; tracks baseline changes over time

## Information Architecture

### Views
1. **Wave Sequence View** (Primary): Ordered list of waves with completion status, unifying theme, OKR linkage summary, and dependency arrows showing why waves are ordered as they are
2. **OKR Dashboard with Wave Linkage**: Bidirectional view showing which OKRs each wave advances, and which waves advance each OKR; includes proposed new OKRs from intake items not yet linked
3. **Baseline Change Log**: History of approved wave sequences with change rationale, date, and diff from previous baseline version

### Data Sources
- `eva_todoist_intake` — Classified Todoist tasks (requires target_application, target_aspects, chairman_intent populated)
- `eva_youtube_intake` — Classified YouTube videos (same classification columns)
- `objectives` / `key_results` — OKR hierarchy for wave linkage
- `eva_vision_documents` — Vision documents that frame wave strategic context
- `sd_execution_baselines` — Existing baseline infrastructure (pattern reference for roadmap baselines)

### Navigation
- Chairman UI → Vision route → **Planning tab** (third tab alongside existing Vision and Capabilities tabs)
- CLI: `npm run roadmap:propose` — AI proposes wave clusters from classified items
- CLI: `npm run roadmap:approve` — Interactive Chairman review and sequencing approval
- CLI: `npm run roadmap:status` — Show current roadmap progress against baseline

## Key Decision Points

1. **Baseline coexistence**: The existing `sd_execution_baselines` table enforces single-active-baseline semantics. The roadmap baseline is a different concept (pre-SD planning sequence vs. SD execution plan). Decision: create a separate `roadmap_baseline_snapshots` table rather than overloading the existing baseline system. They track different things at different lifecycle stages.

2. **Wave-to-OKR write path**: Waves can advance existing OKRs (read-only linkage) but can also propose new OKRs (write path). Decision: start with read-only OKR linkage; add OKR proposal workflow in Phase 2 with explicit Chairman approval before any `objectives` or `key_results` rows are created. This addresses the governance concern about competing OKR creation paths.

3. **Clustering algorithm**: AI proposes clusters using classified item metadata (Application, Aspects, Intent) plus title/description semantic similarity. Decision: use Claude Haiku via existing `getLLMClient({ purpose: 'triage' })` for clustering proposals; present clusters with confidence scores; Chairman can accept, merge, split, or reject clusters.

4. **Degradation path**: What happens when the Chairman skips the roadmap and creates SDs directly? Decision: the roadmap is additive, not mandatory. Direct SD creation continues to work. Roadmap-linked SDs get additional metadata (wave_id, OKR linkage), but non-roadmap SDs are not penalized. HEAL scoring treats wave alignment as a bonus, not a requirement.

5. **Wave-to-SD promotion**: When Chairman approves a wave for execution, each wave's items enter the existing governance pipeline — the Vision Readiness Rubric determines whether a brainstorm/vision/architecture pass is needed before SD creation. For items that already have vision coverage, use `leo-create-sd.js --from-wave <wave-id>` (exempt from rubric via upstream governance provenance). Wave-to-SD linkage maintained via `roadmap_wave_id` foreign key on `strategic_directives_v2`.

## Integration Patterns

### Upstream (Feeds Into Roadmap)
- EVA intake classification pipeline (SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003) produces classified items
- Vision documents provide strategic frame for wave clustering
- OKR system provides alignment targets for waves

### Downstream (Roadmap Feeds Into)
- Vision Readiness Rubric (wave promotion triggers rubric evaluation per wave/item)
- Brainstorm → Vision → Architecture pipeline (when rubric routes to VISION_FIRST)
- SD creation via `--from-wave` flag on `leo-create-sd.js` (when vision/arch already exists)
- Baseline system records approved wave sequences
- HEAL scoring incorporates wave progress as a bonus dimension
- Chairman UI displays wave progress, OKR linkage, and baseline change history

### Existing Pipeline (No Modification)
- `npm run eva:ideas:sync` — Todoist + YouTube sync continues unchanged
- `npm run eva:ideas:post-process` — Post-processing continues unchanged
- `npm run sd:next` — SD queue display continues unchanged (optionally shows wave grouping)
- Direct SD creation via `/leo create` — continues to work without roadmap

## Evolution Plan

### Phase 1: Schema + Core Clustering (This Orchestrator)
- Database migration for roadmap tables (strategic_roadmaps, roadmap_waves, roadmap_wave_items, roadmap_baseline_snapshots)
- AI clustering algorithm: group classified items into wave proposals
- CLI tooling for propose/approve/status workflow
- Read-only OKR linkage (waves reference existing OKRs, no write path)
- **Prerequisite**: EVA Intake Redesign Phase 1 must complete first (classification columns must be populated)

### Phase 2: OKR Proposal Workflow + Baseline Integration
- OKR proposal write path with Chairman approval gate
- Baseline snapshot on wave sequence approval
- Baseline change logging with rationale
- Integration with existing `baseline-debt.js` for drift tracking
- `--from-wave` flag on `leo-create-sd.js` for SD promotion

### Phase 3: Chairman UI + Vision Feedback
- Third tab on Vision route in Chairman UI (EHG frontend)
- Wave sequence visualization with dependency arrows
- OKR dashboard with bidirectional wave linkage
- Baseline change log view
- Vision amendment proposals from intake-driven discoveries
- HEAL scoring wave progress bonus dimension
- **Must sequence after** pipeline redesign Phase 5 GUI work to avoid component tree conflicts

## Out of Scope
- Calendar-based scheduling or timeboxing of waves (dependency-driven ordering only)
- Automated SD creation without Chairman approval (AI proposes, Chairman decides)
- Modification of existing Todoist/YouTube sync pipelines
- Modification of existing SD creation workflow (additive `--from-wave` flag only)
- Mobile or web UI for wave management beyond the Chairman UI tab
- Cross-venture wave dependencies (waves are within a single strategic context)
- Automated OKR creation without Chairman approval (even in Phase 2, OKR proposals require explicit confirmation)

## UI/UX Wireframes

### Chairman UI — Vision Route, Planning Tab

```
┌─────────────────────────────────────────────────────────────┐
│  Vision  │  Capabilities  │  Planning ●                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Strategic Roadmap: EHG Engineer v2.4                       │
│  Baseline v3 (approved 2026-03-15) · 4 waves · 2 active    │
│                                                             │
│  ┌─── Wave 1: Core Infrastructure ──── ✅ COMPLETE ────┐   │
│  │  ▸ 8 items · 3 SDs created · OKR: Platform Stability│   │
│  └──────────────────────────────────────────────────────┘   │
│      │ depends-on                                           │
│      ▼                                                      │
│  ┌─── Wave 2: Intake Pipeline ────────── 🔄 ACTIVE ────┐   │
│  │  ▸ 12 items · 1 SD in EXEC · OKR: Data Quality      │   │
│  │  ▸ Progress: 40% · 2 items promoted to SDs           │   │
│  └──────────────────────────────────────────────────────┘   │
│      │ depends-on                                           │
│      ▼                                                      │
│  ┌─── Wave 3: Strategic Planning ──────── ⏳ QUEUED ────┐   │
│  │  ▸ 6 items · 0 SDs · OKR: Planning Efficiency        │   │
│  │  ▸ Blocked by: Wave 2 (intake classification)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Wave 4: Venture Features ────────── ⏳ QUEUED ────┐   │
│  │  ▸ 15 items · 0 SDs · OKRs: Revenue Growth (NEW)    │   │
│  │  ▸ Independent of Wave 3                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ─── OKR Dashboard ──────────────────────────────────────   │
│  Platform Stability  ████████████ 100%  (Wave 1)           │
│  Data Quality        ████░░░░░░░  40%   (Wave 2)           │
│  Planning Efficiency ░░░░░░░░░░░   0%   (Wave 3)           │
│  Revenue Growth (NEW)░░░░░░░░░░░   0%   (Wave 4)           │
│                                                             │
│  ─── Baseline Change Log ────────────────────────────────   │
│  v3 (2026-03-15): Moved Wave 4 from position 3→4           │
│     Reason: "Venture features need intake pipeline first"   │
│  v2 (2026-03-10): Added Wave 3 (Strategic Planning)        │
│     Reason: "Roadmap artifact concept crystallized"         │
│  v1 (2026-03-08): Initial roadmap — 3 waves                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Success Criteria
- AI clustering produces wave proposals that the Chairman accepts without major rearrangement 70%+ of the time
- Wave sequencing captures dependency rationale that is still accurate when waves are executed
- Approved wave sequence becomes the baseline with versioned change log
- At least one wave successfully promotes to SD creation via `--from-wave` pattern
- OKR dashboard correctly shows bidirectional wave-to-OKR linkage
- Chairman can view roadmap progress in the Planning tab of the Vision route
- No modification to existing SD creation, sync pipelines, or HEAL scoring core logic
- Roadmap is additive — all existing workflows continue to function without it
