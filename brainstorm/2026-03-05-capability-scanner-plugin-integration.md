# Brainstorm: Capability-Aware Scanners + Agent Skill Registry + Anthropic Plugin Integration

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: PortraitPro AI (only active venture)

---

## Problem Statement
EHG's four Stage 0 opportunity scanners (Trend Scanner, Democratization Finder, Capability Overhang, Nursery Re-Eval) do not query internal capabilities when generating venture suggestions. The `venture_capabilities` table exists but is empty. Three separate agent skill systems (agent_skills, skills_inventory, agent_registry) track different aspects of agent abilities but are siloed. Additionally, 53 Anthropic-authored plugins across three repositories represent free leverage that EHG doesn't currently consume.

The result: opportunity scanners suggest ventures without knowing what EHG can already do, missing the most defensible angle — "we already have X capability that gives us a head start in Y market."

## Discovery Summary

### Current Architecture
- **Trend Scanner**: Queries `app_rankings` (external market data) — no internal capability awareness
- **Democratization Finder**: LLM-only analysis — no database queries at all
- **Capability Overhang**: LLM-only — ironically, the scanner designed for capability reuse doesn't query capabilities
- **Nursery Re-Eval**: Queries `venture_nursery` — internal but not capability-aware

### Existing Data Infrastructure
- `venture_capabilities` — Schema ready (name, origin_venture_id, capability_type, reusability_score, maturity_level, consumers) but 0 rows
- `venture_capability_scores` — CCS system for per-stage dimension scoring
- `agent_skills` — Trigger-based skill injection (context_keywords, required_tools, agent_scope)
- `skills_inventory` — Team proficiency tracking (skill_code, current_proficiency 0-5, bus_factor)
- `agent_registry` — Hierarchical agent system with capabilities[] and tool_access[]
- 17 specialized agent types in `.claude/agents/*.partial` files

### Anthropic Plugin Ecosystem
- **financial-services-plugins** (7 plugins): Investment banking, equity research, private equity
- **knowledge-work-plugins** (11 plugins): HR, marketing, sales, operations, productivity
- **claude-plugins-official** (29 internal + 13 external): Central plugin hub
- Installation: `/plugin marketplace add anthropics/skills`, `/plugin install [name]@claude-plugin-directory`
- Skills Cookbook available for financial applications

### User Requirements
- Weekly automated scanning cadence
- No budget constraints
- Single unified capabilities view (federated, not migrated)
- Cross-venture capability reuse detection ("EHG has X from PortraitPro that could power Y")
- Auto-fork Anthropic-only plugins into EHG-specific versions
- Rubric/testing method for evaluating plugin fitness

## Analysis

### Arguments For
1. **Closes a real gap** — Capability Overhang scanner is designed for internal capability reuse but has zero access to internal data
2. **Schema already exists** — `venture_capabilities` table is ready, just needs population
3. **Compounds over time** — Every completed SD and new venture adds to the capability graph
4. **Plugin ecosystem is free leverage** — 53 Anthropic plugins represent capabilities EHG doesn't have to build

### Arguments Against (with Mitigations)
1. **Cold-start problem** — Only 1 venture, 0 capability rows
   - *Mitigation*: Retroactive capability harvester mines completed SDs and agent_registry for immediate population
2. **Three skill systems have different semantics** — proficiency ≠ capability ≠ skill
   - *Mitigation*: Typed capability categories with `capability_source` discriminator, not false unification
3. **Plugin API stability unknown** — Auto-forking depends on stable format
   - *Mitigation*: Snapshot-and-adapt pattern. Version-pin to commit hash. Format check as first gate.

## Team Perspectives

### Challenger
- **Blind Spots**: Empty data pipeline, plugin format stability, cross-venture reuse is theoretical with 1 venture
- **Assumptions at Risk**: Three skill systems have compatible semantics; weekly scanning matches Anthropic's release cadence
- **Worst Case**: Complex unified system producing empty/low-quality recommendations that erode trust in Stage 0

### Visionary
- **Opportunities**: Capability-aware venture discovery with built-in competitive moats; plugin "skill marketplace" for agents; strategic asset inventory for investor reporting
- **Synergies**: Connects to EVA architecture planning, Chairman portfolio view, HEAL capability delivery verification
- **Upside Scenario**: Every new venture inherits full capability graph — reducing time-to-MVP from weeks to days

### Pragmatist
- **Feasibility**: 6/10 — moderate complexity, sequenceable into manageable phases
- **Resource Requirements**: 3-4 SDs, ~2-3 weeks of execution
- **Constraints**: Must populate data before integration is useful; plugin forking requires format understanding; federated view must handle semantic differences
- **Recommended Path**: Start with capability harvester → wire Capability Overhang scanner → plugin scanning in phase 2

### Synthesis
- **Consensus Points**: Cold-start problem must be solved first. Architecture is secondary to data population.
- **Tension Points**: Visionary sees transformative plugin ecosystem potential; Challenger warns it's premature with 1 venture. Pragmatist says sequencing resolves tension.
- **Composite Risk**: Medium — feasible but requires disciplined phasing

## Open Questions
- What is the exact plugin JSON schema across the three Anthropic repos? (Needs verification before scanner design)
- Should the capability harvester run once (backfill) or continuously (on SD completion)?
- How should capabilities be scored for relevance to a new venture opportunity? (LLM evaluation vs algorithmic matching)

## Suggested Next Steps
1. Create Vision + Architecture Plan documents
2. Register in EVA for HEAL scoring
3. Create orchestrator SD with phased children (harvester → scanner integration → plugin pipeline)
