# EHG_Engineer Memory

## User Preferences

### Commit/Ship Workflow
- **Preference**: When changes are ready to commit, invoke `/ship` directly. Do NOT ask "should we commit?" or "ready to push?" — just run `/ship`.

### Post-Completion: No Asking When AUTO-PROCEED Active
- **When AUTO-PROCEED is ON**: Make autonomous decisions on every post-completion step. NEVER ask "shall I run /document?" or "what next?"
- **`/document`**: Decide intelligently — invoke it if new features, APIs, commands, or architecture were added. Skip silently for small bugfixes, internal refactors, or config-only changes.
- **`/learn`**: Always invoke for code-producing SDs (per existing rules).
- **General rule**: AUTO-PROCEED means autonomous. Decide and act. Don't pause for confirmation at any step in the post-completion sequence.

## Todoist API Patterns (2026-02-09)

### getTasks vs getTasksByFilter - USE THE RIGHT METHOD
- **`api.getTasks()`** - Structured filters only: `{ projectId, sectionId, parentId, label, ids }`
- **`api.getTasksByFilter()`** - Text search: `{ query, lang, cursor, limit }`
- **WRONG**: `api.getTasks({ filter: 'search: task name' })` - `filter` param is silently ignored, returns 50 fuzzy garbage results
- **CORRECT**: `api.getTasksByFilter({ query: 'task name' })` → returns `{ results: [...] }`
- **Also note**: Response is `{ results: [...] }` not a raw array. Always access `.results`.
- **Incident**: Searched for "Offering to the public", got 50 unrelated recipes/music tasks. Task existed in EVA project the whole time.
- **Best practice**: When searching within a known project, use `getTasks({ projectId })` + local filter.

## Common Query Mistakes

### strategic_directives_v2: `id` vs `sd_key` (2026-02-07)
- **`id`** = UUID (e.g., `01e466a1-a214-4845-ab01-02962aded874`)
- **`sd_key`** = human-readable identifier (e.g., `SD-FDBK-ENH-ADD-INTELLIGENT-RESOLUTION-001`)
- **ALWAYS use `.eq('sd_key', 'SD-XXX-001')` when querying by SD identifier**, never `.eq('id', 'SD-XXX-001')`
- **Incident**: Queried `.eq('id', 'SD-FDBK-...')`, got 0 rows, concluded SD didn't exist. It was there the whole time under `sd_key`.
- **Same pattern applies to**: `product_requirements_v2` (use `sd_id` which stores the sd_key string, not the UUID)

## Intentional Design Decisions

### GATE_SD_START_PROTOCOL - Soft Enforcement (2026-02-06)
- **Status**: DOWNGRADED from hard blocker to soft pass (Opus 4.6+)
- **What**: Gate no longer hard-blocks handoffs for missing digest file reads
- **Why (original)**: Opus 4.5 drifted from protocol over long sessions. Re-reading digests was a workaround.
- **Why (changed)**: Opus 4.6 has better adherence. CLAUDE.md is in system prompt every turn, making digest re-reads redundant.
- **Current behavior**: Auto-passes (score 80/100) with warnings logged. Session start gate still requires initial reads.
- **Gate location**: `scripts/modules/handoff/gates/core-protocol-gate.js`
- **RCA**: FRICTION-ANALYSIS-001

## SD Type Registration Reference Points (2026-02-06)

**CRITICAL**: When adding a new SD type, it must be registered in ALL 13 reference points. Missing even one causes validation failures or incorrect workflow defaults.

### The 13 Reference Points for New SD Types:

1. **`sd_stream_requirements` table** - Stream requirements (PRD, design, architecture)
2. **`scripts/modules/sd-type-checker.js`** - NON_CODE, SCORING_WEIGHTS, THRESHOLD_PROFILES
3. **`lib/utils/sd-type-validation.js`** - UAT requirements, exemption reasons, auto-detection
4. **`scripts/modules/handoff/validation/sd-type-applicability-policy.js`** - LIGHTWEIGHT_SD_TYPES, SD_TYPE_POLICY
5. **`lib/utils/post-completion-requirements.js`** - FULL_SEQUENCE_TYPES vs MINIMAL_SEQUENCE_TYPES
6. **`scripts/orchestrator-preflight.js`** - SD_TYPE_PROFILES (PRD, E2E, handoffs, threshold)
7. **`scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-validation.js`** - VALID_SD_TYPES list
8. **`scripts/modules/handoff/verifiers/lead-to-plan/sd-type-detection.js`** - TYPE_PATTERNS keywords
9. **`strategic_directives_v2` table** - sd_type CHECK constraint
10. **`lib/utils/sd-type-guard.js`** - Type guard functions (if applicable)
11. **`lib/utils/sd-type-detection.js`** - Detection keywords (if applicable)
12. **Handoff executors** - Any executor that branches on sd_type
13. **Documentation** - Update CLAUDE.md, protocol docs with new type description

### Lesson Learned (2026-02-06)

**Incident**: SD-UAT-CAMPAIGN-001 children had `sd_type='qa'`, but `qa` was never registered in any of the 13 reference points.

**Impact**: `orchestrator-preflight.js` defaulted to feature-level requirements (PRD required, 4 handoffs, 85% gate threshold) for UAT campaign SDs that should have had minimal requirements (no PRD, 1-2 handoffs, 70% threshold).

**Root Cause**: No validation at SD creation time to check if sd_type exists in all reference tables. The system grew organically; each reference point was added independently without a central "new type" checklist.

**CAPA**:
- **Corrective**: Migration `20260206_register_uat_sd_type.sql` registered `uat` type (renamed from `qa`) across all 13 points
- **Preventive**: This MEMORY.md section documents the 13 reference points for future types

**Verification**: When adding a new SD type, use this checklist to ensure complete registration.

## Local LLM Integration (2026-02-05)

### Haiku Replacement: LIVE
- **Model**: `qwen3-coder:30b` via Ollama
- **Enable**: `USE_LOCAL_LLM=true` in `.env`
- **Benchmark**: 100% accuracy on classify, JSON, instruct tests (33 tok/s)
- **Fallback**: Auto-falls back to cloud Haiku if Ollama unavailable

### LLM Client Factory Architecture

**Central entry point for ALL LLM operations**: `lib/llm/client-factory.js`

```
getLLMClient({ purpose, subAgent, phase })
    │
    ├── haiku tier + USE_LOCAL_LLM=true → OllamaAdapter (local)
    ├── haiku tier + USE_LOCAL_LLM=false → AnthropicAdapter (cloud)
    ├── sonnet tier → AnthropicAdapter (cloud)
    └── opus tier → AnthropicAdapter (cloud, never local)
```

**Key helpers**:
- `getClassificationClient()` - Haiku tier, local eligible
- `getFastClient()` - Haiku tier, local eligible
- `getValidationClient()` - Sonnet tier
- `getSecurityClient()` - Opus tier, never local

### Database-Driven Model Registry (SD-001B - COMPLETE)

**Phase II implemented**: Models now loaded from database instead of hardcoded constants.

**Database Tables**:
- `llm_providers` - Provider config (Ollama, Anthropic, OpenAI, Google)
- `llm_models` - Model config with `leo_tier` and `is_local` columns
- `v_llm_model_registry` - View joining providers + models (used by factory)

**Key features**:
- 5-minute cache TTL to minimize DB calls
- Fallback to hardcoded constants if DB unavailable
- `initializeLLMFactory()` for startup pre-load
- `refreshModelRegistry()` for hot reload after DB changes

**Migration**: `database/migrations/20260205_llm_registry_ollama_integration.sql`

### Canary Routing with Quality Gates (SD-001C - COMPLETE)

**Phase III implemented**: Gradual traffic shifting with auto-rollback protection.

**Stages**: 0% → 5% → 25% → 50% → 100%
**Quality Gates**: Error rate ≤5%, Latency ≤2x baseline, Auto-rollback on ≥3 consecutive failures

**Database Tables**:
- `llm_canary_state` - Singleton state (stage, thresholds, status)
- `llm_canary_transitions` - Audit trail of stage changes
- `llm_canary_metrics` - Per-request metrics for quality evaluation

**CLI Commands**:
- `npm run llm:canary:status` - View current stage
- `npm run llm:canary:advance` - Move to next stage
- `npm run llm:canary:rollback` - Emergency: back to 0% (all cloud)

**Migration**: `database/migrations/20260206_llm_canary_routing.sql`

### Orchestrator Status: COMPLETE (2026-02-06)

**All phases delivered**:
- ✅ Phase I (001A): Factory pattern, first module migrated
- ✅ Phase II (001B): Database-driven model registry
- ✅ Phase III (001C): Canary routing with quality gates
- ✅ Phase IV (001D): Architecture documentation
- ✅ Phase V (001E): Codebase migration audit (166 call sites, 45 haiku-eligible)

**Impact**: ~159,000 tokens/week saved (haiku → local), ~636,000 tokens/month

### Key Files
- `lib/llm/client-factory.js` - Central factory (routes all LLM calls)
- `lib/llm/index.js` - Public exports
- `lib/llm/README.md` - Architecture docs, API reference, benchmarks section
- `lib/sub-agents/vetting/provider-adapters.js` - Adapter implementations
- `lib/intelligent-impact-analyzer.js` - First module using factory
- `config/phase-model-routing.json` - Sub-agent to tier routing
- `scripts/benchmarks/ollama-model-benchmark.mjs` - Reusable benchmark tool
- `scripts/benchmarks/README.md` - Benchmark methodology, integration status

### Hardware Context
- 96 GB RAM, 12 GB VRAM (RTX 5070 Ti)
- Ollama v0.15.4

### Lessons Learned
1. External AI predictions can be wrong - always benchmark on actual hardware
2. gpt-oss:20b failed classification despite being recommended by external AIs
3. deepseek-r1:14b has thinking token leakage that corrupts output
4. Check env vars at CALL TIME, not module load time (dotenv timing issue)
5. Centralize LLM client creation - don't let each module create its own

### Token Savings
- ~53 SDs/week average
- ~159,000 tokens/week saved (was Haiku, now local)
- ~636,000 tokens/month freed up for Sonnet/Opus work

### Future Expansion
- Agent-specific benchmarks: `rca`, `design`, `quickfix`, `schema`, `review`
- Run with `--agents` flag to test model-to-agent routing
- Other modules (llm-story-generator, api-relevance-classifier) can be migrated
