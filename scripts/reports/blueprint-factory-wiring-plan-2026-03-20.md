# Blueprint Factory Wiring — Stages 14-16 Redesign + Wireframe Agent

> **Date**: 2026-03-20
> **Source**: Venture pipeline triangulation session — brainstorm + plan mode
> **Prior Vision**: VISION-BLUEPRINT-FACTORY-L2-001 (Multi-Agent Blueprint Factory)
> **Prior Architecture**: ARCH-BLUEPRINT-FACTORY-001
> **Prior SDs (completed)**: SD-LEO-FIX-FIX-BLUEPRINT-STAGE-001, SD-LEO-INFRA-BLUEPRINT-TEMPLATE-SYSTEM-001, SD-LEO-INFRA-BLUEPRINT-AGENT-FACTORY-001, SD-LEO-INFRA-BLUEPRINT-QUALITY-SCORING-001, SD-LEO-INFRA-BLUEPRINT-PROMOTION-GATE-001
> **SRIP Integration (completed)**: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001, SD-LEO-FEAT-WIRE-SRIP-INTO-001

## Context

The Blueprint Factory infrastructure was fully built (5 completed SDs) but never wired into the stage pipeline. Stages 14-16 still use old single-agent `analyzeStageNN()` functions. The DB `lifecycle_stage_config` has wrong artifact names. A wireframe agent was specified in the vision (`VISION-BLUEPRINT-FACTORY-L2-001`) but never created.

SRIP (brand genome, design DNA) is fully integrated into Stages 10-11 and feeds downstream — wireframes depend on this plus the technical architecture from S14.

**Existing infrastructure (reuse, don't rebuild):**
- 11 blueprint agents: `lib/eva/blueprint-agents/` with registry + coordinator
- Blueprint Coordinator: `lib/eva/blueprint-coordinator.js` — topological sort + `orchestrate()`
- Blueprint templates DB table: 11 rows with quality rubrics
- Blueprint scoring: `lib/eva/blueprint-scoring/`

**Target BLUEPRINT phase:**
| Stage | Name | Artifacts | Gate |
|-------|------|-----------|------|
| S13 | Product Roadmap | `product_roadmap` | Kill |
| S14 | Technical Architecture | `data_model`, `erd_diagram`, `technical_architecture`, `api_contract`, `schema_spec` | None |
| S15 | Risk Register & UX Design | `risk_register`, `user_story_pack`, `wireframes` | None |
| S16 | Financial Projections | `financial_projection` | Promotion (always manual) |

---

## Changes

### 1. Create Wireframe Agent (~50 LOC)

**Create** `lib/eva/blueprint-agents/wireframes.js`
- `artifactType = 'wireframes'`
- `dependencies = ['technical_architecture', 'user_story_pack']`
- System prompt generates: `screens` array (name, purpose, ASCII layout, key_components, persona_mapping), `navigation_flows` array (from, to, trigger), `screen_count`, `persona_coverage`
- Each screen represents a page/view of the venture's product with ASCII wireframe showing component layout

**Modify** `lib/eva/blueprint-agents/index.js` — import + register

**DB** — Insert `wireframes` row into `blueprint_templates` with quality rubric (screen_coverage 0.3, layout_clarity 0.25, navigation_completeness 0.25, persona_alignment 0.2)

**Modify** `lib/eva/blueprint-scoring/rubric-definitions.js` — add `wireframes` entry

### 2. Fix lifecycle_stage_config (DB migration)

**Create** migration in `supabase/migrations/`:
```sql
UPDATE lifecycle_stage_config SET required_artifacts = ARRAY['data_model','erd_diagram','technical_architecture','api_contract','schema_spec'] WHERE stage_number = 14;
UPDATE lifecycle_stage_config SET required_artifacts = ARRAY['risk_register','user_story_pack','wireframes'], stage_name = 'Risk Register & UX Design' WHERE stage_number = 15;
UPDATE lifecycle_stage_config SET required_artifacts = ARRAY['financial_projection'] WHERE stage_number = 16;
```

### 3. Wire Coordinator into Stage Pipeline (~100-150 LOC)

**Modify** `lib/eva/eva-orchestrator-helpers.js` — `loadStageTemplate()` (lines 93-164)

When a stage template has a `blueprintAgents` array, build multi-step `analysisSteps` instead of wrapping a single `analysisStep`:

- Use `resolveExecutionOrder()` to get dependency-sorted order, filter to the stage's subset
- Create shared `blueprintResults` Map in closure for intra-stage dependency passing
- Each step: call LLM with agent's `systemPrompt` + venture context + upstream results, store result in Map
- Falls back to existing `analysisStep` path if `blueprintAgents` not present

Key: the orchestrator already iterates steps sequentially (line 306), and topological sort guarantees dependencies satisfied. Cross-stage dependencies (e.g., S15's `risk_register` depends on `technical_architecture` from S14) are provided via `fetchUpstreamArtifacts()`.

### 4. Update Stage Templates (~50 LOC)

**Modify** `lib/eva/stage-templates/stage-14.js`
- Add `blueprintAgents: ['data_model', 'erd_diagram', 'technical_architecture', 'api_contract', 'schema_spec']`
- Keep existing `analysisStep` as fallback

**Modify** `lib/eva/stage-templates/stage-15.js`
- Fix title: `'Resource Planning'` → `'Risk Register & UX Design'`
- Add `blueprintAgents: ['risk_register', 'user_story_pack', 'wireframes']`

**S16 stays on old path** — single agent with integrated promotion gate. No benefit routing through coordinator.

**Modify** `lib/eva/contracts/stage-contracts.js`
- Update S14/S15 `produces` specs for new artifact types (required: false for backward compat)

### 5. Promotion Gate Update (~50 LOC)

**Modify** `lib/eva/stage-templates/stage-16.js` — `evaluatePromotionGateLegacy()`
- Add checks for new S14 artifacts (api_contract, schema_spec) and S15 artifacts (user_story_pack, wireframes) — warn-only for new artifacts

**Modify** `lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js`
- Before calling `evaluatePromotionGate()`, attempt to load Blueprint Readiness Score from DB
- Pass `readinessScore` — the score-based path already exists and takes priority

### 6. Frontend (~100 LOC, ehg repo)

**Modify** `ehg/src/components/artifacts/ArtifactPanel.tsx`
- Add icon mappings: `wireframes: Layout`, `risk_register: AlertTriangle`, `financial_projection: DollarSign`

**Optional** — `WireframeViewer.tsx` for visual rendering of ASCII screen layouts (can defer)

---

## Execution Order

```
1. Wireframe Agent (no deps)        ──┐
2. DB Migration (no deps)           ──┼──> 4. Stage Templates ──> 3. Wire Coordinator
5. Promotion Gate (parallel)        ──┘
6. Frontend (parallel, different repo)
```

## Verification

1. Reset BrandVoice AI to Stage 14, restart worker
2. S14 produces 5 artifacts (data_model, erd_diagram, technical_architecture, api_contract, schema_spec)
3. S15 produces 3 artifacts (risk_register, user_story_pack, wireframes)
4. Wireframes artifact contains screens with ASCII layouts and navigation flows
5. S16 produces financial_projection and blocks at promotion gate (always manual)
6. Frontend shows correct icons for new artifact types

## Critical Files

- `lib/eva/blueprint-agents/wireframes.js` — NEW: wireframe agent
- `lib/eva/blueprint-agents/index.js` — register wireframe agent
- `lib/eva/eva-orchestrator-helpers.js` — wire coordinator into loadStageTemplate()
- `lib/eva/stage-templates/stage-14.js` — add blueprintAgents array
- `lib/eva/stage-templates/stage-15.js` — fix title + add blueprintAgents
- `lib/eva/stage-templates/stage-16.js` — promotion gate checks for new artifacts
- `lib/eva/blueprint-scoring/rubric-definitions.js` — wireframes rubric
- `lib/eva/contracts/stage-contracts.js` — update produces specs
- `ehg/src/components/artifacts/ArtifactPanel.tsx` — icon mappings
