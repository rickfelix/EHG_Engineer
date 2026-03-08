# Brainstorm: Strategic Roadmap — New Artifact Type for EVA Planning Pipeline

## Metadata
- **Date**: 2026-03-08
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ClarityStats, LocalizeAI, BrandForge AI (via cross-venture classification)

---

## Problem Statement

The EVA planning pipeline has a gap between classified intake items and the vision/architecture pipeline. Currently, after items are classified with Application/Aspects/Intent, there is no formal artifact for grouping, prioritizing, and sequencing those items before they enter the existing governance pipeline (Vision Readiness Rubric → Brainstorm → Vision → Architecture → SD creation). The Chairman lacks a structured way to:
1. See all classified items grouped by theme
2. Link groups to OKRs (existing and proposed)
3. Approve an execution sequence that becomes the baseline
4. Track progress against the approved plan

Without this artifact, classified items jump directly to the Vision Readiness Rubric (or ad-hoc SD creation), losing the strategic layer where the Chairman applies contextual judgment about grouping, sequencing, and dependencies across many items before any individual item enters the governance pipeline.

## Discovery Summary

### Gap Location
The gap exists in two places:
1. **Between classification and the vision/governance pipeline** — no formal grouping/prioritization step before items hit the Vision Readiness Rubric
2. **Within sequencing itself** — dependencies between groups need to be captured before SDs are created

### Sequencing Philosophy
- **No timeboxing** — ordering without calendar dates because duration estimates are unreliable ("we estimate a month, finish in three days")
- **Dependency-driven and priority-driven** — sequence based on what blocks what and strategic importance
- **Rough horizon cuts** (short/medium/long-term) for conceptual ordering, not scheduling

### Human-in-the-Loop Requirements
- The Chairman must provide strategic input on prioritization and sequencing
- AI proposes, Chairman decides — consistent pattern throughout
- Approved sequence becomes part of the baseline
- Changes to the baseline must be logged with rationale

### OKR Integration
- **Bidirectional relationship**: waves advance existing OKRs AND can propose new OKRs revealed by classified items
- OKR dashboard shows wave linkage
- Progress measured against OKRs via wave completion

### Vision Integration
- **Bidirectional link**: Vision sets the strategic frame for waves; intake items can trigger vision amendments
- Waves operationalize the vision's Evolution Plan — they ARE the evolution plan made concrete
- HEAL scoring incorporates wave progress alongside vision alignment

### Wave Structure
Each wave (group of related items) contains:
1. **Clustered items** with unifying theme
2. **Bidirectional OKR linkage** (existing OKRs advanced + new OKRs proposed)
3. **Dependency rationale** explaining why this wave must precede or follow others

NOT included per-wave: baseline impact assessment (belongs at the sequence level, not per-wave)

### Interaction Model
- **Inflow (clustering)**: AI proposes clusters from classified items → Chairman reviews
- **Outflow (SD creation + sequencing)**: AI proposes SD decomposition → Chairman approves wave SEQUENCING → Approved sequence becomes new baseline
- The critical Chairman approval point is the **sequencing of all waves**, not individual wave composition

### Chairman UI
Third tab on the Vision route showing:
1. **Wave sequence with progress** — ordered list of waves with completion status
2. **OKR dashboard with wave linkage** — bidirectional OKR-to-wave mapping
3. **Baseline change log** — history of approved sequences with change rationale

NOT shown: intake pipeline funnel (belongs in EVA pipeline monitoring, not strategic planning)

### Artifact Name
**Strategic Roadmap** — chosen over "Execution Plan", "Wave Planner", and "Priority Map"

## Analysis

### Arguments For
- **Fills a real gap**: The jump from classified intake items to SD creation loses strategic context — the Chairman's vision for HOW and WHY things should be sequenced
- **Builds on existing infrastructure**: Baseline system, OKR tracking, and vision documents already exist — this artifact connects them into a cohesive planning layer
- **Consistent interaction model**: "AI proposes, Chairman decides" pattern is already proven in intake classification — extending it to sequencing is natural
- **Enables progress tracking**: Without a roadmap artifact, there's no way to measure "are we executing the plan?" — only "are individual SDs complete?"

### Arguments Against
- **Adds ceremony**: Every new artifact type adds process overhead — the solo entrepreneur must maintain yet another planning document
- **Risk of over-planning**: 50 intake items don't necessarily need a formal roadmap — some might be simple enough to go straight to SDs
- **Sequencing is speculative**: Dependencies between waves may not be knowable until earlier waves are in progress — the roadmap may need constant revision
- **Competing with existing tools**: The orchestrator SD pattern already captures parent-child sequencing — the roadmap may duplicate this at a higher level

## Integration: Protocol Friction/Value/Risk Analysis

| Dimension | Score |
|-----------|-------|
| Friction Reduction | 8/10 |
| Value Addition | 9/10 |
| Risk Profile | 4/10 |

**Friction Reduction (8/10):**
- Current friction: 4/5 — Today's jump from classified items to SDs requires the Chairman to hold sequencing logic in memory
- Friction breadth: 4/5 — Affects every planning session where multiple SDs need ordering

**Value Addition (9/10):**
- Direct value: 4/5 — Captures Chairman's strategic sequencing decisions persistently
- Compound value: 5/5 — Enables baseline tracking, OKR alignment, progress measurement, and vision operationalization

**Risk Profile (4/10):**
- Breaking change risk: 2/5 — Additive artifact; existing pipeline continues to work without it
- Regression risk: 2/5 — No existing workflows are modified; this is a new layer

**Decision Rule**: (8 + 9) = 17 > (4 * 2) = 8 → **IMPLEMENT**

## Team Perspectives

### Challenger
- **Blind Spots**: (1) The gap is an *authority model* problem, not just a missing artifact — the existing `sd_execution_baselines` enforces single-active-baseline semantics via UNIQUE INDEX WHERE is_active = TRUE; how a "wave sequence baseline" coexists with SD execution baselines is undefined. (2) The initial bolus problem — 199 items must pass through five serial human decision points (classify → cluster → assign waves → approve sequence → decompose to SDs) before code ships; this pipeline depth is unquantified. (3) No degradation path — once waves link to OKRs, baselines, and HEAL scoring, the Chairman *cannot* skip the roadmap without breaking downstream dashboards, but solo entrepreneurs under pressure will do exactly that.
- **Assumptions at Risk**: (1) AI-proposed clusters will be stable — the current taxonomy (App/Aspect/Intent) is per-item, not inter-item affinity; low cluster quality collapses the value proposition. (2) Dependency ordering without timeboxing produces actionable sequences — partial orders need tiebreakers, and priority is subjective and volatile. (3) Bidirectional OKR linkage adds value — waves proposing OKRs outside the monthly generation cadence creates competing creation paths that undermine governance.
- **Worst Case**: "Protocol stratification" — the roadmap gets built, integrated with HEAL/OKRs/baselines, then falls out of date within two weeks. OKR dashboards show stale wave linkage, HEAL scores incorporate abandoned wave progress, two competing baseline notions exist (SD execution vs. wave sequence), and the Chairman must either invest significant time to catch up or surgically remove the integrations. Both options cost more than if the artifact had never been built. The 4/10 risk score is underweighted because it evaluates schema risk, not maintenance cost risk or governance coupling risk.

### Visionary
- **Opportunities**: (1) Closed-loop intake-to-execution pipeline — a `--from-wave` flag on `leo-create-sd.js` mirrors existing `--from-feedback`/`--from-learn` patterns, converting the path from Todoist task to executing SD into a continuous Chairman-gated pipeline with zero manual data entry. (2) Forward-looking dependency engine — wave-level dependencies pre-populate `venture_dependencies` and SD dependency metadata before SDs exist, turning `sd:next` from reactive constraint-checker to proactive scheduling engine. (3) Vision HEAL loop shifts left — score proposed waves against vision alignment before Chairman review, catching misaligned work before any SD is created.
- **Synergies**: EVA pipeline stages 0-25 (ventures arrive with pre-validated context); baseline system (roadmap drift tracking via existing `baseline-debt.js`); sd:next track view (wave membership as grouping dimension); cross-venture learning (completed wave patterns improve future clustering); Chairman preference store (wave size, parallelism limits, OKR thresholds as queryable preferences).
- **Upside Scenario**: Chairman opens the UI, sees 3 waves of clustered intake items with OKR projections, vision alignment scores, and dependency arrows. Drags one cluster to resequence, system recalculates impact, and upon approval auto-generates 8 SDs across 3 orchestrators with pre-populated baselines and OKR alignments. What today takes a multi-hour manual planning session collapses to a 5-minute review-and-approve. As completed waves feed learning back, clustering quality improves. The gap between "idea while watching YouTube" and "code shipping" shrinks to one Chairman approval.

### Pragmatist
- **Feasibility**: 6/10 — mid-high complexity but landing in well-trodden territory. DB infrastructure (OKR hierarchy, baselines, vision documents) already exists as extension points. AI clustering step is genuinely new algorithmic work. Bidirectional OKR write-paths add governance complexity. Chairman UI tab requires cross-repo work in `rickfelix/ehg`.
- **Resource Requirements**: 5-7 SDs, 10-15 working sessions, 3-5 weeks calendar. Schema SD can start immediately. Clustering algorithm after intake classification ships. UI tab must sequence after pipeline redesign Phase 5 GUI work. LLM cost negligible ($2-5 per clustering run).
- **Constraints**: (1) Hard blocker on Intake Redesign Phase 1 — classified items must exist before clustering. (2) OKR write-path governance gap — no existing approval workflow for AI-proposed OKRs; `key_results` table has read-oriented patterns. (3) GUI surface contention with 25-stage pipeline redesign Phase 5 claiming the same chairman-v2/v3 component tree.
- **Recommended Path**: Schema-first SD — design `strategic_roadmaps`, `roadmap_waves`, `roadmap_wave_items`, `roadmap_baseline_snapshots` tables as Supabase migration. Validates data model against existing FK constraints, surfaces schema conflicts early, can start before intake classification ships. Then: intake Phase 1 → clustering algorithm → OKR proposal workflow → Chairman UI tab → vision amendment feedback loop (riskiest, last).

### Synthesis
- **Consensus Points**: All three perspectives agree the gap is real and worth filling. All agree on sequential dependency on intake classification (cannot cluster unclassified items). All agree schema-first is the right starting point. All note the OKR write-path as a design challenge requiring explicit governance decisions.
- **Tension Points**: Challenger sees maintenance cost as the primary risk vector (solo entrepreneur will abandon the roadmap under pressure); Visionary sees the roadmap as the lever that makes the solo entrepreneur 10x more effective (eliminating manual planning). Challenger warns bidirectional OKR linkage undermines governance; Visionary sees it as the key that connects strategic intent to execution. Pragmatist mediates: start with read-only OKR linkage, add write-path later with Chairman approval workflow.
- **Composite Risk**: Medium — the concept is sound and fills a genuine gap, but the integration surface area (baselines, OKRs, HEAL, vision amendments) creates coupling that a solo operator may not sustain. Mitigation: build incrementally, starting with standalone schema and clustering, deferring deep integrations until the simpler layers are proven.

## Open Questions
- How does the Strategic Roadmap interact with the existing `sd_baselines` table — extend it or create a new table?
- Should waves be a database entity or a JSONB array within the roadmap record?
- How granular should baseline change logging be — every field change or only sequence changes?
- When a wave's items are converted to SDs, how is the wave-to-SD linkage maintained?
- Should the Chairman UI planning tab be built as part of this effort or as a separate SD?

## Suggested Next Steps
- Create Vision Document and Architecture Plan (Step 9.5 — mandatory)
- Register in EVA for HEAL scoring
- Determine relationship to EVA Intake Redesign orchestrator (prerequisite? parallel? child?)
- Create orchestrator SD with children for phased implementation
