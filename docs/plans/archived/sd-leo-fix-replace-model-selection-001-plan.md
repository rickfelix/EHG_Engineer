<!-- Archived from: C:/Users/rickf/.claude/plans/valiant-coalescing-dusk.md -->
<!-- SD Key: SD-LEO-FIX-REPLACE-MODEL-SELECTION-001 -->
<!-- Archived at: 2026-02-13T20:10:57.677Z -->

# Plan: Replace Model Selection with Thinking Effort Routing

## Context

Currently, LEO routes sub-agents to different models (haiku/sonnet/opus) based on task complexity. The user observed that Opus supports configurable thinking effort levels, making it possible to use a single model (Opus) with varying reasoning depth instead of switching between models. This simplifies the mental model: "how hard should this think?" instead of "which model?"

Two layers are affected:
1. **Layer 1** — Agent `.partial` files (Claude Code sub-agents spawned via Task tool)
2. **Layer 2** — LLM Client Factory (programmatic API calls within scripts)

## Changes

### 1. Database Migration

**New file:** `database/migrations/YYYYMMDD_thinking_effort_routing.sql`

- Add `thinking_effort` column to `leo_sub_agents`: `VARCHAR(20) CHECK (thinking_effort IN ('low', 'medium', 'high'))` with default `'medium'`
- Populate from existing `model_tier`: haiku→low, sonnet→medium, opus→high
- Keep `model_tier` column temporarily (set all to `'opus'`) for backward compat during rollout
- Update `llm_models` table: add `thinking_budget_tokens` column (integer, nullable)

### 2. AnthropicAdapter — Add Thinking Support

**File:** `lib/sub-agents/vetting/provider-adapters.js` (lines 121-177)

In `AnthropicAdapter.complete()`:
- Accept new option: `options.thinkingBudget` (integer or null)
- When `thinkingBudget` is set, add `thinking: { type: 'enabled', budget_tokens: thinkingBudget }` to `messages.create()`
- Ensure `max_tokens > budget_tokens` (auto-adjust if needed)
- Strip `temperature` when thinking is enabled (API requirement)
- Extract thinking text from response (content blocks include `type: 'thinking'`)
- Add `thinkingTokens` to usage in return value

### 3. Config — Replace Tiers with Effort Levels

**File:** `config/phase-model-routing.json`

Replace tier values with effort levels:
```
"GITHUB": "low"      (was "sonnet")
"DOCMON": "low"      (was "sonnet")
"RETRO": "low"       (was "sonnet")
"QUICKFIX": "low"    (was "sonnet")
"DESIGN": "high"     (was "opus")
"DATABASE": "high"   (was "opus")
"SECURITY": "high"   (was "opus")
"RCA": "high"        (was "opus")
... etc
```

Update `tierDocumentation` to `effortDocumentation`:
- **low**: budget_tokens ~1024 — CI/CD, docs, pattern extraction, quick fixes
- **medium**: budget_tokens ~4096 — design, testing, API, risk, dependencies
- **high**: budget_tokens ~16384 — RCA, security, database schema, regression

**File:** `config/phase-model-config.json`

Same change — replace `{ "model": "sonnet", "reason": "..." }` with `{ "effort": "medium", "reason": "..." }`

### 4. Client Factory — Route Effort to Thinking Config

**File:** `lib/llm/client-factory.js`

- Replace `FALLBACK_TIER_TO_MODEL` with `EFFORT_CONFIG`:
  ```js
  const EFFORT_CONFIG = {
    low:    { model: 'claude-opus-4-5-20251101', budgetTokens: 1024 },
    medium: { model: 'claude-opus-4-5-20251101', budgetTokens: 4096 },
    high:   { model: 'claude-opus-4-5-20251101', budgetTokens: 16384 }
  };
  ```
- `getLLMClient()` returns adapter with thinking config based on effort level
- `getPurposeTier()` → `getPurposeEffort()` (classification→low, validation→medium, security→high)
- Keep local Ollama path unchanged (haiku tier → local LLM, no thinking params)
- Helper functions rename: `getClassificationClient()` stays, internally routes to low effort

### 5. Phase-Model Config Loader

**File:** `lib/sub-agent-executor/phase-model-config.js`

- `convertPhase()`: read `.effort` instead of `.model` from JSON entries
- Exports still work the same way (Proxy-based), but values are `'low'`/`'medium'`/`'high'` instead of `'haiku'`/`'sonnet'`/`'opus'`

### 6. Model Routing Module

**File:** `lib/sub-agent-executor/model-routing.js`

- Rename `getModelForAgentAndPhase()` → `getEffortForAgentAndPhase()` (keep old name as alias for backward compat)
- Returns effort level string instead of model name

### 7. Agent Compiler + Database

**File:** `scripts/generate-agent-md-from-db.js`

- Read `thinking_effort` from DB alongside `model_tier`
- Set all agents to `model: opus` in generated frontmatter
- `MODEL_TIER_MAP` becomes `{ low: 'opus', medium: 'opus', high: 'opus' }` (all opus)

**Database updates** for `leo_sub_agents`:
| Agent | Current model_tier | New thinking_effort |
|-------|-------------------|-------------------|
| docmon-agent | sonnet | low |
| retro-agent | sonnet | low |
| github-agent | sonnet | low |
| design-agent | sonnet | medium |
| api-agent | sonnet | medium |
| dependency-agent | sonnet | medium |
| validation-agent | sonnet | medium |
| testing-agent | sonnet | medium |
| regression-agent | sonnet | medium |
| uat-agent | sonnet | medium |
| stories-agent | sonnet | medium |
| risk-agent | sonnet | medium |
| performance-agent | sonnet | medium |
| rca-agent | opus | high |
| security-agent | opus | high |
| database-agent | opus | high |
| orchestrator-child-agent | opus | high |

### 8. Recompile Agents

Run `npm run agents:compile` to regenerate all `.md` files with `model: opus`.

## Files Modified (Summary)

| File | Change |
|------|--------|
| `database/migrations/YYYYMMDD_thinking_effort_routing.sql` | NEW — schema + data migration |
| `lib/sub-agents/vetting/provider-adapters.js` | Add thinking support to AnthropicAdapter |
| `config/phase-model-routing.json` | Replace tier names with effort levels |
| `config/phase-model-config.json` | Replace `"model":` with `"effort":` |
| `lib/llm/client-factory.js` | Route effort→thinking config instead of tier→model |
| `lib/sub-agent-executor/phase-model-config.js` | Read `.effort` field |
| `lib/sub-agent-executor/model-routing.js` | Return effort level |
| `scripts/generate-agent-md-from-db.js` | All agents → opus, read thinking_effort |

## What Stays Unchanged

- **Local Ollama path** — haiku-tier classification/screening still routes to local LLM
- **Canary router** (`lib/llm/canary-router.js`) — only affects local LLM rollout
- **OpenAI/Google adapters** — no thinking support needed (not used for primary routing)
- **Routing structure** — phase + agent code → effort level (same shape, different values)

## Verification

1. Run `npm run agents:compile` — all 17 agents should generate with `model: opus`
2. Run existing tests to confirm no regressions in adapter/factory
3. Manually test a sub-agent call (e.g., GITHUB with low effort) to verify thinking params reach the API
4. Check `getRoutingStatus()` returns effort config instead of tier mapping
