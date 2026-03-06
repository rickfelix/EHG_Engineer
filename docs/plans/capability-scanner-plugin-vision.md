# Vision: Capability-Aware Scanners + Agent Skill Registry + Anthropic Plugin Integration

## Executive Summary
EHG's Stage 0 opportunity scanners identify new venture possibilities but operate blind to EHG's internal capabilities. The Capability Overhang scanner — designed specifically to find ventures where existing capabilities provide a head start — makes zero database queries. Meanwhile, three separate agent skill systems (agent_skills, skills_inventory, agent_registry) and 53 Anthropic-authored plugins represent untapped capability data that could power smarter venture suggestions.

This vision establishes a unified capability intelligence layer: a federated view across all capability sources, a retroactive harvester that populates capability data from completed work, scanner integration that makes internal capabilities first-class inputs to venture discovery, and an automated Anthropic plugin pipeline that continuously expands EHG's agent skill catalog.

The goal is to transform Stage 0 from "what's trending in the market" to "what's trending AND where EHG already has a head start."

## Problem Statement
**What problem this addresses:** EHG's four opportunity scanners (Trend Scanner, Democratization Finder, Capability Overhang, Nursery Re-Eval) suggest ventures without awareness of EHG's internal capabilities. The Capability Overhang scanner should identify reuse opportunities but uses LLM-only analysis with no data access.

**Who this affects:**
- **EVA/Stage 0** — Generates venture suggestions without internal context, leading to recommendations that ignore existing strengths
- **Chairman** — Cannot see "what capabilities do we already have" when evaluating opportunities
- **LEO Protocol** — Completed SDs produce capabilities that are never cataloged or surfaced for reuse
- **Agent system** — 17 specialized agents have capabilities that aren't visible to the venture discovery pipeline

**Current impact:** Every venture suggestion starts from scratch. Cross-venture capability reuse is accidental, not systematic. Agent skills accumulated across 100+ completed SDs are invisible to the system that decides what to build next.

## Personas

### EVA Stage 0 Operator (Primary)
- **Goals**: Generate high-quality venture suggestions that use EHG's existing strengths
- **Mindset**: Wants the system to say "you already have AI image processing from PortraitPro — this new venture would reuse 60% of that capability"
- **Key Activities**: Running opportunity scanners, evaluating suggestions, feeding promising ideas to Chairman

### Chairman (Decision Maker)
- **Goals**: Evaluate venture opportunities with awareness of internal capabilities and shared infrastructure
- **Mindset**: Wants portfolio-level capability visibility — "what can EHG do today, and where are the gaps?"
- **Key Activities**: Reviewing Stage 0 suggestions, approving venture exploration, portfolio capability assessment

### LEO Orchestrator (Capability Producer)
- **Goals**: Ensure the system catalogs completed work as reusable capabilities
- **Mindset**: Expects that building "AI image classification" in one venture automatically registers it for cross-venture reuse
- **Key Activities**: Completing SDs, harvesting capabilities from deliverables, maintaining capability metadata

### Agent Skill Manager (Plugin Curator)
- **Goals**: Keep EHG's agent skill catalog current with Anthropic's latest plugins, adapted for EHG context
- **Mindset**: Wants automated discovery and evaluation — not manual plugin shopping
- **Key Activities**: Weekly scanning of Anthropic repos, evaluating plugin fitness, adapting and registering new skills

## Information Architecture

### Data Layer Structure
```
Unified Capability View (v_unified_capabilities)
├── venture_capabilities (tech capabilities from ventures/SDs)
│   ├── name, capability_type, maturity_level
│   ├── origin_venture_id, origin_sd_key
│   ├── reusability_score (0-10)
│   └── consumers[] (ventures using this capability)
├── agent_skills (trigger-based skill injection)
│   ├── skill_name, category_scope
│   ├── context_keywords[], required_tools[]
│   └── agent_scope, dependencies
├── agent_registry (hierarchical agent capabilities)
│   ├── agent_type, capabilities[]
│   ├── tool_access[], delegation_authority
│   └── parent_agent_path (LTREE)
└── skills_inventory (team proficiency)
    ├── skill_code, current_proficiency (0-5)
    ├── target_proficiency, bus_factor
    └── criticality_score
```

### View Layer
- `v_unified_capabilities` — Federated view across all four sources with `capability_source` discriminator
- `v_scanner_capabilities` — Filtered view for scanner consumption (tech + agent_skill only, excludes team proficiency)
- `v_capability_gaps` — Capabilities referenced by ventures but not yet built (derived from Stage 0 suggestions vs existing capabilities)

### Scanner Integration Points
- **Capability Overhang Scanner**: Queries `v_scanner_capabilities` + market opportunity → finds ventures where EHG has existing capability advantage
- **Democratization Finder**: Enhanced with capability context → "EHG has X capability that could democratize Y"
- **Trend Scanner**: Cross-references trends with `v_scanner_capabilities` → "trending category X aligns with existing capability Y"
- **Nursery Re-Eval**: Queries capability additions since last evaluation → "new capability Z may unblock nursery venture W"

### Plugin Pipeline
```
Weekly Cron / Manual Trigger
├── Anthropic Repo Scanner
│   ├── financial-services-plugins (7 plugins)
│   ├── knowledge-work-plugins (11 plugins)
│   └── claude-plugins-official (42 plugins)
├── Fitness Rubric Evaluation
│   ├── EHG relevance score (0-10)
│   ├── Venture applicability (which ventures benefit)
│   ├── Format compatibility check
│   └── Security/dependency review
├── Auto-Fork & Adapt
│   ├── Clone plugin to EHG namespace
│   ├── Customize prompts for EHG context
│   ├── Version-pin to source commit hash
│   └── Register in agent_skills table
└── Plugin Registry (new table: anthropic_plugin_registry)
    ├── source_repo, source_commit, plugin_name
    ├── ehg_adapted_version, adaptation_date
    ├── fitness_score, last_scanned_at
    └── status (discovered/evaluating/adapted/rejected)
```

## Key Decision Points

1. **Federated view vs single table** — Using a federated view (`v_unified_capabilities`) that joins across four source tables. This preserves each system's independence while providing a unified query surface. The alternative (migrating all data to one table) would break existing agent_skills and agent_registry consumers.

2. **Capability harvester timing** — Should run both retroactively (one-time backfill from completed SDs) AND continuously (on SD completion via LEAD-FINAL-APPROVAL hook). The backfill provides immediate value; the continuous hook ensures ongoing population.

3. **Plugin evaluation rubric** — Automated vs LLM-evaluated fitness scoring. Recommend hybrid: automated format/security checks first (pass/fail gate), then LLM evaluation for EHG relevance scoring (0-10).

4. **Scanner query strategy** — Scanners should query capabilities BEFORE generating LLM prompts, injecting capability context into the prompt rather than making capabilities a post-filter. This ensures the LLM reasons about internal strengths from the start.

## Integration Patterns

### EVA Integration
- Stage 0 scanners receive capability context as part of their prompt assembly
- `eva_vision_documents` can reference capabilities from `v_unified_capabilities` as "existing assets"
- HEAL scoring verifies capability delivery claims match actual `venture_capabilities` entries

### LEO Protocol Integration
- LEAD-FINAL-APPROVAL hook calls capability harvester to extract and register new capabilities
- SD `delivers_capabilities` field cross-referenced with `venture_capabilities` entries for consistency
- `sd_phase_handoffs` enriched with capability metadata for traceability

### Chairman Dashboard Integration
- New "Capabilities" tab showing portfolio-wide capability inventory
- Opportunity suggestions annotated with "reuses N existing capabilities"
- Capability gap analysis: what the portfolio needs but doesn't have

### Anthropic Plugin Integration
- Weekly scanner job (cron or LEO scheduled task)
- Plugin registry table tracks discovery → evaluation → adaptation lifecycle
- Adapted plugins registered in `agent_skills` with `source: 'anthropic_plugin'` tag
- Version tracking enables "Anthropic updated plugin X — review EHG adaptation" alerts

## Evolution Plan

### Phase 1: Capability Harvester (Foundation)
- Build retroactive harvester that mines completed SDs for capabilities
- Populate `venture_capabilities` from `strategic_directives_v2` (key_changes, delivers_capabilities)
- Add LEAD-FINAL-APPROVAL hook for continuous capability extraction
- Populate from `agent_registry.capabilities[]` for agent-type capabilities
- **Deliverable**: `venture_capabilities` populated with 50+ entries from historical data

### Phase 2: Scanner Integration
- Wire `v_unified_capabilities` view creation (federated across 4 sources)
- Modify Capability Overhang scanner to query `v_scanner_capabilities`
- Enhance Democratization Finder with capability context injection
- Add capability cross-reference to Trend Scanner and Nursery Re-Eval
- **Deliverable**: All four scanners are capability-aware; suggestions include "reuses X capability"

### Phase 3: Anthropic Plugin Pipeline
- Create `anthropic_plugin_registry` table
- Build weekly scanner that checks three Anthropic repos for new/updated plugins
- Implement fitness rubric (automated + LLM evaluation)
- Build auto-fork pipeline (clone → adapt → register in agent_skills)
- **Deliverable**: Automated plugin discovery with `npm run plugins:scan` and `npm run plugins:adapt`

### Phase 4: Chairman Capability Dashboard
- Add capability inventory view to Chairman UI
- Annotate opportunity suggestions with capability reuse indicators
- Build capability gap analysis (what ventures need vs what exists)
- **Deliverable**: Chairman can see portfolio capabilities and their venture applications

## Out of Scope
- Manual plugin curation UI (automated pipeline only for now)
- Partner/community Anthropic plugins (Anthropic-authored only per user requirement)
- Real-time capability scoring during SD execution (post-completion only)
- Cross-organization capability sharing (single EHG instance only)
- Team proficiency development recommendations (skills_inventory is read-only for this vision)

## UI/UX Wireframes
N/A for Phases 1-3 (backend infrastructure). Phase 4 Chairman integration would be a separate SD building on this foundation.

## Success Criteria
1. `venture_capabilities` contains 50+ entries after Phase 1 harvester runs
2. Capability Overhang scanner produces suggestions that reference specific internal capabilities
3. All four scanners include capability context in their LLM prompts
4. Weekly plugin scanner discovers and evaluates Anthropic plugins automatically
5. At least 10 Anthropic plugins adapted and registered in agent_skills within first month
6. Plugin adaptation includes EHG-specific prompt customization (not raw copies)
7. `v_unified_capabilities` view returns results from all four source tables
8. Capability harvester triggers automatically on SD completion (LEAD-FINAL-APPROVAL hook)
9. Chairman can query "what capabilities does EHG have in category X" via API
10. Zero manual intervention required for plugin discovery → evaluation pipeline
