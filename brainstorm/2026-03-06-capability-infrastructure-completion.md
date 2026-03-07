# Brainstorm: Capability Infrastructure Completion

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Execute
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: PortraitPro AI (active)

---

## Problem Statement
The Capability-Aware Scanners and Anthropic Plugin Integration orchestrator (SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001) was marked completed, but critical activation steps were never performed. The result is a fully-built but dormant capability infrastructure: migrations not applied, scanners never run, the unified view missing its largest data source, and a frontend page showing the wrong data entirely.

## Discovery Summary

### Current State Inventory
| Component | What Exists | What's Missing |
|-----------|-------------|----------------|
| `anthropic_plugin_registry` table | Migration SQL + full code pipeline (scanner, adapter, rubric) | Migration never applied to live DB |
| `agent_skills` population | Table schema exists + `plugin-adapter.js` populator | Scanner never run; adapter is the only populator |
| `sd_capabilities` in unified view | 142 rows of SD-delivered capabilities in table | Not included in `v_unified_capabilities` UNION |
| Capabilities frontend page | Page exists at `/chairman/capabilities` | Queries `venture_stage_work` instead of `v_unified_capabilities` |
| `taxonomy_domain` column | Referenced in `capability_ledger_v2` migration | Column not created (migration partially failed) |
| Periodic scanning | N/A | No automation exists |

### Data Source Sizes
- `venture_capabilities`: 29 rows (source='venture')
- `agent_skills`: 0 rows (empty — never populated)
- `agent_registry` (unnested): 15 rows (source='agent_registry')
- `sd_capabilities`: 142 rows (NOT in unified view)
- **Total potential unified**: ~186+ rows across 4 sources

### User Decisions
- **Scan Frequency**: Weekly (via GitHub Actions, not node-cron)
- **Frontend Scope**: All unified capabilities, grouped by source type

## Analysis

### Arguments For
1. **All code already exists** — activation, not development
2. **142 rows of sd_capabilities are invisible** — largest capability dataset excluded from unified view
3. **agent_skills is empty solely because scanner was never run** — one command populates it
4. **Capabilities page shows irrelevant data** — pipeline stage health instead of actual capabilities
5. **Weekly scanning via GitHub Actions is low operational cost**

### Arguments Against
1. **Semantic mixing** — unified view combines business, technical, and agent capabilities. Grouped display mitigates but doesn't eliminate conceptual confusion
2. **Plugin fitness rubric is heuristic-only** — auto-adaptation quality depends on rule quality
3. **delivers_capabilities on older SDs may be sparse** — capability harvester depends on historically uncollected data

## Team Perspectives

### Challenger
- **Blind Spots**:
  - Unified view aggregates incompatible semantic models (business capabilities vs agent skills vs SD deliverables)
  - Plugin fitness rubric has no failure criterion for API incompatibility or version drift
  - Cold-start problem deferred — `delivers_capabilities` may be empty on many SDs
- **Assumptions at Risk**:
  - Weekly scanning may not match Anthropic's irregular release cadence
  - `sd_capabilities` and `venture_capabilities` may diverge (deprecation tracking gap)
  - Frontend can't simply swap `venture_stage_work` for `v_unified_capabilities` (schema mismatch)
- **Worst Case**: Scanners receive incoherent capability context → bad recommendations → trust loss in Stage 0 discovery system

### Visionary
- **Opportunities**:
  - Unified Capability Graph becomes "operating system" for AI orchestration — single source of truth
  - Anthropic plugin ecosystem as venture value unlock — battle-tested patterns at zero cost
  - Capability-driven frontend enables portfolio intelligence dashboard
- **Synergies**: Feeds into Mental Models Repository, Situational Modeling Engine, Hierarchical Agent Architecture
- **Upside Scenario**: Month 6, capability reuse reduces venture setup time 20%, auto-adaptation becomes 90%+ autonomous

### Pragmatist
- **Feasibility**: 7/10 (moderately feasible — all code exists, execution is deterministic)
- **Resource Requirements**: 5-8 hours total, single developer + AI assistance sufficient
- **Constraints**:
  1. `taxonomy_domain` column status must be diagnosed first (blocker)
  2. 4 data sources = 4 different schemas for frontend mapping
  3. Scanner needs GitHub API backoff (use p-retry, already in deps)
- **Recommended Path**: Diagnose taxonomy_domain → Apply migrations → Alter unified view → Run scanner → Rewire frontend → GitHub Action for weekly scan

### Synthesis
- **Consensus**: taxonomy_domain is prerequisite; code is ready; unified view is high-value; GitHub Actions > node-cron
- **Tension**: Semantic mixing in unified view (Challenger concern) vs single queryable API (Visionary value). Resolution: grouped-by-source display handles this naturally.
- **Composite Risk**: Low-Medium

## Open Questions
- Should `sd_capabilities` deprecation status cascade to `venture_capabilities`?
- Should the unified view include a `deprecated_at` filter?
- What happens to adapted plugins when Anthropic repos change breaking format?

## Suggested Next Steps
1. Create an SD to execute all 6 gaps as a single coordinated effort
2. Start with taxonomy_domain diagnosis (15 min) to unblock everything
3. Use database sub-agent for migration work (per user preference)
4. Execution order: DB migrations → View alteration → Scanner run → Frontend rewire → GitHub Action
