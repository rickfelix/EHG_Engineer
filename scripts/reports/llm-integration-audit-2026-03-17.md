# LLM Integration Audit Report

**Date**: 2026-03-17
**Auditor**: Claude Opus 4.6 (automated audit)
**Scope**: All LLM callsites in EHG_Engineer codebase
**Protocol Version**: LEO 4.3.3

---

## Executive Summary

The EHG_Engineer codebase has a **well-designed centralized LLM infrastructure** (`lib/llm/`) with a client factory pattern, multi-provider support, canary routing, and database-driven model registry. However, the audit reveals **several active bypass patterns** where modules call LLM APIs directly instead of through the factory, **inconsistent error handling** across callsites, and **optimization opportunities** for token cost reduction through caching and model downtier.

### Key Findings

| Category | Status | Details |
|----------|--------|---------|
| Centralized Factory | STRONG | `lib/llm/client-factory.js` covers 4 providers, effort-based routing |
| Factory Adoption | PARTIAL | ~15 active modules bypass the factory with direct SDK calls |
| Error Handling | MIXED | Adapters have retries; many callsites swallow errors silently |
| Caching | WEAK | Only `intelligent-impact-analyzer.js` caches LLM results (30 min TTL) |
| Security | GOOD | API keys via env vars; Unicode sanitization; no hardcoded keys |
| Cost Optimization | MODERATE | Effort-based routing helps; batch operations lack caching |
| Local LLM | MATURE | Full Ollama integration with canary deployment and quality gates |

---

## 1. LLM Callsite Inventory

### 1.1 Infrastructure Layer (Central)

| File | Purpose | Provider(s) | Model Routing |
|------|---------|-------------|---------------|
| `lib/llm/client-factory.js` | Central factory, all routing logic | All 4 | Effort-based (low/medium/high) + legacy tier-based |
| `lib/llm/canary-router.js` | Gradual local LLM traffic splitting | Ollama + Anthropic | Bucket-based deterministic routing |
| `lib/llm/index.js` | Public API surface | Re-exports | N/A |
| `lib/sub-agents/vetting/provider-adapters.js` | Adapter implementations | Anthropic, OpenAI, Google, Ollama | N/A (raw adapters) |
| `lib/config/model-config.js` | Model version config | All | Purpose-based (validation/classification/generation/fast) |
| `lib/sub-agent-executor/model-routing.js` | Phase-aware effort routing | N/A (config) | Agent + Phase -> effort level |
| `config/phase-model-config.json` | Routing configuration data | N/A | Per-agent, per-phase effort assignment |

### 1.2 Active Production Callsites (Using Factory)

| File | Purpose | Factory Method | Tier/Effort | Prompt Quality |
|------|---------|----------------|-------------|----------------|
| `lib/intelligent-impact-analyzer.js` | SD impact analysis -> sub-agent selection | `getLLMClient({ purpose: 'screening' })` | Haiku | 4/5 |
| `lib/integrations/intake-classifier.js` | 3D intake classification (App/Aspects/Intent) | `getClassificationClient()` | Haiku | 5/5 |
| `lib/eva/youtube-relevance-scorer.js` | YouTube video relevance scoring | `getLLMClient({ purpose: 'classification' })` | Haiku | 4/5 |
| `scripts/eva/translation-fidelity-gate.js` | Upstream/downstream artifact fidelity | `getValidationClient()` | Medium effort | 4/5 |
| `lib/eva/stage-templates/analysis-steps/stage-01-hydration.js` | Stage 0 synthesis -> draft idea | `getLLMClient({ purpose: 'content-generation' })` | High effort | 5/5 |
| `lib/eva/stage-templates/analysis-steps/stage-02-*.js` through `stage-25-*.js` | 25-stage EVA venture analysis | `getLLMClient({ purpose: ... })` / `getValidationClient()` | Medium-High | 4/5 |
| `lib/eva/stage-zero/synthesis/*.js` (12 files) | Stage 0 synthesis components | `getValidationClient()` | Medium effort | 4/5 |
| `lib/eva/stage-zero/paths/discovery-mode.js` | Discovery path analysis | `getLLMClient(...)` | Medium | 4/5 |
| `lib/eva/stage-zero/paths/competitor-teardown.js` | Competitor analysis | `getLLMClient(...)` | Medium | 4/5 |
| `lib/eva/capability-score/score-stage.js` | Per-stage capability scoring (5 dims) | `getValidationClient()` | Medium | 5/5 |
| `scripts/modules/prd-llm-service.mjs` | PRD content generation | `getLLMClient({ subAgent: 'PRD', phase: 'PLAN' })` | Medium (via OpenAI compat) | 5/5 |
| `scripts/modules/child-sd-llm-service.mjs` | Child SD strategic field generation | `getLLMClient({ purpose: 'child-sd-strategic-fields', phase: 'LEAD' })` | Medium | 5/5 |
| `lib/sub-agents/modules/stories/llm-story-generator.js` | User story generation from criteria | `getLLMClient({ subAgent: 'STORIES', phase })` | Medium | 4/5 |
| `scripts/modules/ai-quality-judge/index.js` | AI Quality Judge for improvements | `getLLMClient({ purpose: 'validation' })` | Medium | 4/5 |
| `lib/quality/triage-engine.js` | AI triage suggestions for feedback | `getLLMClient(...)` via factory | Medium | 3/5 |
| `scripts/modules/sd-type-classifier.js` | SD type classification | Factory client | Haiku | 4/5 |
| `lib/sub-agents/api-relevance-classifier.js` | API relevance scoring | Factory client | Haiku | 4/5 |
| `lib/integrations/refine-score.js` | Score refinement | Factory client | Medium | 3/5 |
| `lib/integrations/wave-clusterer.js` | Wave clustering | Factory client | Medium | 3/5 |
| `lib/integrations/marketing-asset-generator.js` | Marketing asset generation | Factory client | Medium | 3/5 |
| `lib/integrations/idea-classifier.js` | Idea classification | Factory client | Haiku | 4/5 |
| `lib/eva/economic-lens-analysis.js` | Economic lens analysis | Factory client | Medium | 4/5 |
| `lib/eva/crews/tournament-orchestrator.js` | Multi-model tournament | Factory client | Medium | 4/5 |
| `lib/skunkworks/proposal-agent.js` | Skunkworks proposal generation | Factory client | Medium | 3/5 |
| `lib/agents/context-monitor.js` | Context monitoring | Factory client | Haiku | 3/5 |
| `scripts/validators/semantic-target-application-validator.js` | Semantic validation | Factory client | Medium | 4/5 |
| `scripts/modules/shipping/ShippingDecisionEvaluator.js` | Ship/no-ship decision | Factory client | Medium | 4/5 |
| `scripts/eva/vision-command.mjs` | Vision document commands | Factory client | High | 4/5 |
| `scripts/eva/brainstorm-to-vision.mjs` | Brainstorm -> vision conversion | Factory client | High | 4/5 |
| `scripts/eva/friday-meeting.mjs` | Friday meeting agenda generation | Factory client | Medium | 3/5 |
| `scripts/eva/recommendation-engine.mjs` | Venture recommendations | Factory client | Medium | 4/5 |
| `scripts/eva/trend-detector.mjs` | Trend detection | Factory client | Medium | 3/5 |
| `scripts/eva/srip/quality-checker.mjs` | SRIP quality checking | Factory client | Medium | 3/5 |
| `scripts/eva/srip/forensic-audit.mjs` | Forensic audit | Factory client | Medium | 4/5 |
| `scripts/eva/srip/naming-generator.mjs` | Venture naming | Factory client | Medium | 4/5 |
| `scripts/eva/seed-l1-vision.js` | L1 vision seeding | Factory client | High | 3/5 |
| `scripts/eva/archplan-command.mjs` | Architecture plan generation | Factory client | High | 4/5 |
| `scripts/eva/wave-brainstorm.js` | Wave brainstorm sessions | Factory client | High | 4/5 |
| `scripts/eva/vision-scorer.js` | Vision scoring (programmatic) | Factory client | Medium | 4/5 |
| `scripts/sd-baseline-intelligent.js` | Intelligent SD baseline | Factory client | Medium | 3/5 |
| `scripts/modules/auto-trigger-stories.mjs` | Auto-trigger story generation | Factory client | Medium | 3/5 |
| `lib/discovery/gap-analyzer.js` | Discovery gap analysis | Factory client | Medium | 3/5 |
| `lib/discovery/blueprint-generator.js` | Blueprint generation | Factory client | High | 4/5 |
| `lib/sd/type-classifier.js` | SD type classification | Factory client | Haiku | 4/5 |
| `lib/utils/validation-automation.js` | Validation automation | Factory client | Medium | 3/5 |
| `lib/service-factory.js` | Service factory LLM integration | Factory client | Medium | 3/5 |
| `scripts/modules/prd-generator/llm-generator.js` | PRD generation (alternate path) | Factory client | Medium | 4/5 |
| `scripts/modules/prd/llm-generator.js` | PRD generation (module path) | Factory client | Medium | 4/5 |
| `scripts/prd/llm-generator.js` | PRD generation (script path) | Factory client | Medium | 4/5 |
| `scripts/modules/ai-quality-evaluator.js` | AI quality evaluation | Factory client | Medium | 4/5 |

### 1.3 BYPASS CALLSITES (Direct SDK, Not Using Factory) - ISSUES

| File | Provider | Model | Issue | Severity |
|------|----------|-------|-------|----------|
| **`lib/marketing/content-generator.js`** | `new Anthropic()` direct | `claude-haiku-4-5-20251001` | Hardcoded model, bypasses factory, no canary routing, no local fallback | HIGH |
| **`lib/programmatic/tool-loop.js`** | `new Anthropic()` direct | `claude-sonnet-4-6` | Tool-use loop requires direct API; reasonable bypass but hardcoded model | MEDIUM |
| **`lib/eva/devils-advocate.js`** | `new OpenAIAdapter()` direct | OpenAI default | Intentional model isolation (different provider for adversarial review); acceptable pattern but no factory tracking | LOW |
| **`lib/ai/multimodal-client.js`** | Direct fetch to Google/OpenAI/Anthropic | Multiple | Vision-specific module; uses CJS `require()`; handles its own provider cascade | MEDIUM |
| **`lib/eva/experiments/meta-optimizer.js`** | `deps.anthropic` injected | Claude | Legacy dependency injection pattern, not using factory | LOW |
| **`supabase/functions/openai-realtime-token/index.ts`** | Direct fetch to OpenAI | `gpt-4o-realtime-preview` | Edge function, cannot use Node.js factory; appropriate for Deno runtime | N/A |
| **`supabase/functions/observer-retrospectives/index.ts`** | None (no LLM calls) | N/A | Pure pattern matching, no LLM | N/A |

### 1.4 Embedding Callsites

| File | Purpose | Provider | Dimensions |
|------|---------|----------|------------|
| `lib/llm/client-factory.js` (getEmbeddingClient) | Central embedding factory | Google (primary) -> OpenAI -> Ollama | 1536 (cloud) / 768 (local) |
| `scripts/archive/one-time/index-embeddings.js` | One-time embedding indexing | Via factory | 1536 |
| `scripts/archive/one-time/generate-sd-embeddings.js` | SD embedding generation | Via factory | 1536 |

---

## 2. Model Routing Analysis

### 2.1 Documented Rules (from CLAUDE_CORE.md)

- **ALWAYS use Sonnet** for sub-agent tasks (NEVER Haiku - not available on Max plan)
- Provider priority: Anthropic (primary) -> Google Gemini -> OpenAI -> Ollama
- Google/Gemini configured in `lib/config/model-config.js`

### 2.2 Actual Implementation (from client-factory.js)

The factory implements a **dual routing system**:

1. **Effort-based routing** (new, preferred): All agents use Opus with thinking budget
   - Low effort: 1,024 thinking tokens
   - Medium effort: 4,096 thinking tokens
   - High effort: 16,384 thinking tokens

2. **Legacy tier-based routing** (backward compatible): haiku/sonnet/opus tiers
   - Haiku tier -> local Ollama when `USE_LOCAL_LLM=true`
   - Sonnet tier -> `claude-sonnet-4-20250514`
   - Opus tier -> `claude-opus-4-5-20251101`

### 2.3 Provider Cascade

```
Effort-based path:
  Anthropic key present + LLM_PROVIDER != google -> AnthropicAdapter (Opus + thinking)
  GEMINI/GOOGLE_AI key present                    -> GoogleAdapter (Gemini 3.1 Pro / 2.5 Pro)
  No cloud keys                                   -> Inline stub (signals Claude Code should handle)

Legacy tier-based path:
  Haiku + USE_LOCAL_LLM=true  -> OllamaAdapter (qwen3-coder:30b) with cloud fallback
  Non-haiku + GEMINI key      -> GoogleAdapter
  Non-haiku + OPENAI key      -> OpenAIAdapter
  Last resort                 -> GoogleAdapter (will error if no key)
```

### 2.4 Routing Compliance Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **Canary router has stale tier mapping** | MEDIUM | `canary-router.js` line 282-298: `inferTier()` maps `validation` to `sonnet` and `generation` to `sonnet`, but `client-factory.js` now maps these to `medium` and `high` effort. The canary router's tier mapping is out of sync with the factory. |
| **child-sd-llm-service.mjs hardcodes model** | LOW | Line 32: `model: 'gpt-4o'` in config, but this is never passed to the factory (uses purpose-based routing). Dead config. |
| **content-generator.js hardcodes haiku model** | HIGH | `claude-haiku-4-5-20251001` hardcoded, bypasses all routing. Should use `getClassificationClient()`. |
| **tool-loop.js hardcodes Sonnet model** | MEDIUM | `DEFAULT_MODEL = 'claude-sonnet-4-6'` - tool-use loop requires specific Anthropic features, but model should come from config. |
| **llm-story-generator.js uses `.messages.create()`** | MEDIUM | Line 471: Calls `client.messages.create()` directly on the factory client. This relies on the OpenAI compat shim rather than the `.complete()` interface. Works but fragile. |
| **EVA stage 01 uses `content-generation` purpose** | LOW | Maps to `high` effort (Opus with 16K thinking tokens). Potentially expensive for hydration that could work with medium. |

### 2.5 Are Expensive Models Used Where Cheaper Would Suffice?

**Yes, in several cases:**

| Callsite | Current | Could Use | Monthly Savings (est.) |
|----------|---------|-----------|----------------------|
| Stage 01 Hydration | High effort (Opus 16K thinking) | Medium effort (4K) | ~$5/mo |
| Friday Meeting | Medium effort (Opus 4K) | Low effort / Haiku | ~$3/mo |
| Wave brainstorm | High effort (Opus 16K) | Medium effort | ~$4/mo |
| Seed L1 vision | High effort | Medium effort | ~$3/mo |
| YouTube relevance scorer (batch) | Haiku per-video (no batching) | Batch multiple videos in single prompt | ~$8/mo |

---

## 3. Prompt Quality Assessment

### 3.1 Scoring Methodology

Each prompt scored 1-5 on three dimensions:
- **Clarity**: Clear instructions, expected output format, examples
- **Efficiency**: Minimal tokens for the task, bounded context
- **Safety**: No injection risks, user data sanitized, output validated

### 3.2 Top-Quality Prompts (5/5)

| File | Why It's Good |
|------|---------------|
| `intake-classifier.js` | Taxonomy fully enumerated in prompt; JSON-only output; confidence scoring; well-bounded context |
| `prd-llm-service.mjs` | Quality rubric embedded; JSON schema defined; response_format: json_object; comprehensive context building |
| `child-sd-llm-service.mjs` | Quality rubric + type-specific guidance; validates output schema; sibling/pattern context enrichment |
| `capability-score/score-stage.js` | Truncated artifact (3000 chars); clear dimension rubrics; timeout protection; DI for testing |

### 3.3 Prompts Needing Improvement (3/5 or below)

| File | Score | Issues |
|------|-------|--------|
| `triage-engine.js` | 3/5 | AI suggestion prompt is generic; no JSON output format specification |
| `friday-meeting.mjs` | 3/5 | Large context window; could summarize rather than include full data |
| `agents/context-monitor.js` | 3/5 | Vague instructions; should specify exact output format |
| `discovery/gap-analyzer.js` | 3/5 | Open-ended prompt; no output schema |
| `service-factory.js` | 3/5 | Generic prompt construction; no output validation |
| `validation-automation.js` | 3/5 | Inline string concatenation; no structured output |
| `refine-score.js` | 3/5 | Simple prompt with no examples or calibration guidance |
| `wave-clusterer.js` | 3/5 | Could benefit from few-shot examples |

### 3.4 Prompt Injection Risk Assessment

| Risk | Status | Details |
|------|--------|---------|
| User-supplied data in prompts | LOW RISK | Most prompts use SD data from database (trusted source). `intake-classifier.js` uses Todoist titles which are user-supplied but confined to the user prompt (not system prompt). |
| Unicode sanitization | MITIGATED | `sanitizeUnicode()` in `provider-adapters.js` prevents lone surrogate injection. Applied in all adapter `.complete()` methods. |
| Eval of LLM output | LOW RISK | All callsites use `JSON.parse()` for structured output, never `eval()`. |
| SQL injection via LLM | NOT FOUND | No callsite constructs SQL from LLM output. |
| Command injection via LLM | NOT FOUND | No callsite executes shell commands from LLM output. |

---

## 4. Error Handling & Fallback Chains

### 4.1 Adapter-Level Error Handling (STRONG)

All four adapters in `provider-adapters.js` implement:

| Feature | Anthropic | OpenAI | Google | Ollama |
|---------|-----------|--------|--------|--------|
| Retry with backoff | 2 retries, linear backoff (1s, 2s) | 2 retries, 5x backoff on TIMEOUT | 2 retries, 3x on 503 | 2 retries, linear |
| Timeout | Race with configurable timeout (default 30s) | AbortController (30s) | AbortController (30s) | AbortController (30s) |
| Fallback to other model | No | No | Yes (429/503 -> try 3 other Gemini models) | Yes (-> cloud Haiku) |
| Streaming support | Yes (for >10min ops) | No | No | No |
| RCA trigger on failure | Yes (fire-and-forget) | Yes | Yes | Yes |
| Token usage tracking | Yes | Yes | Yes | Yes |

### 4.2 Factory-Level Fallback Chain

```
Sub-agent request -> Effort-based routing:
  Anthropic available? -> AnthropicAdapter (Opus + thinking budget)
  Google key available? -> GoogleAdapter (Gemini)
  No cloud keys?        -> Inline stub { _inline_required: true }

Purpose-based request (legacy):
  Haiku tier + USE_LOCAL_LLM? -> OllamaAdapter (local-first with cloud fallback)
  GEMINI key?                 -> GoogleAdapter
  OPENAI key?                 -> OpenAIAdapter
  No keys + USE_LOCAL_LLM?    -> OllamaAdapter (last resort)
  No keys at all?             -> GoogleAdapter (will fail with clear error)
```

### 4.3 Callsite-Level Error Handling (MIXED)

| Pattern | Count | Quality |
|---------|-------|---------|
| try/catch with fallback result | ~25 callsites | GOOD - returns safe default, logs warning |
| try/catch with null return | ~15 callsites | ACCEPTABLE - caller must handle null |
| try/catch swallow (empty catch) | ~5 callsites | POOR - silent failure, hard to debug |
| No error handling | ~3 callsites | BAD - uncaught promise rejections possible |

**Worst offenders (silent catch):**
- `lib/integrations/intake-classifier.js` line 138: `catch { return null; }` - no logging at all
- `lib/eva/experiments/meta-optimizer.js` - error handling via dependency injection but no fallback

### 4.4 Response Validation

| Pattern | Count | Notes |
|---------|-------|-------|
| `JSON.parse()` with regex extraction | ~40 callsites | Standard pattern: `text.match(/\{[\s\S]*\}/)` then parse |
| `response_format: { type: 'json_object' }` | 2 callsites | OpenAI JSON mode via compat layer (prd-llm-service, child-sd-llm-service) |
| Schema validation post-parse | 5 callsites | `child-sd-llm-service.mjs` is best example with `validateGeneratedFields()` |
| No validation | ~10 callsites | Just uses `response.content` directly |

---

## 5. Token Cost Analysis

### 5.1 Estimated Per-Call Token Usage

| Callsite Category | Input Tokens (avg) | Output Tokens (avg) | Frequency | Monthly Cost (est.) |
|-------------------|-------------------|---------------------|-----------|-------------------|
| **PRD Generation** | 8,000-15,000 | 8,000-15,000 | 5-10/week | $15-40 |
| **Child SD Strategic Fields** | 3,000-6,000 | 2,000-4,000 | 10-20/week | $10-25 |
| **EVA Stage Analysis (25 stages x N ventures)** | 2,000-4,000 per stage | 1,000-3,000 per stage | Variable | $20-100 |
| **Stage 0 Synthesis (12 components)** | 1,500-3,000 each | 1,000-2,000 each | Variable | $10-50 |
| **User Story Generation** | 2,000-5,000 | 2,000-4,000 | 5-15/week | $5-20 |
| **Intake Classification** | 500-1,000 | 200-500 | 20-50/week | $1-5 |
| **YouTube Relevance Scoring** | 300-500 per video | 100-200 per video | 10-30/week | $0.50-3 |
| **SD Impact Analysis** | 1,000-2,000 | 500-1,000 | 5-10/week | $2-5 |
| **Translation Fidelity Gates** | 3,000-6,000 | 1,000-2,000 | 3-5/week | $3-8 |
| **AI Quality Judge** | 2,000-4,000 | 1,000-2,000 | 2-5/week | $2-6 |
| **Devil's Advocate** | 1,000-2,000 | 500-1,000 | 5-10/week | $3-8 |
| **OpenAI Realtime (voice)** | N/A (audio) | N/A (audio) | Rare | $0-50 (capped at $500/mo) |

**Estimated Total Monthly LLM Cost: $70-320** (depending on venture analysis volume)

### 5.2 Most Expensive Callsites

1. **EVA 25-stage venture analysis pipeline** - Each venture runs 25+ LLM calls at medium-high effort. A single full pipeline run with Opus could cost $5-15.
2. **PRD generation** - Large context (up to 32K output tokens configured) with comprehensive context building.
3. **Stage 0 synthesis** - 12 parallel synthesis components per venture.

### 5.3 Cost Optimization Opportunities

| Opportunity | Estimated Savings | Effort |
|-------------|-------------------|--------|
| Cache EVA stage results for same venture (24h TTL) | $10-30/mo | Medium |
| Batch YouTube relevance scoring (10 videos per prompt) | $2-5/mo | Low |
| Reduce Stage 01 from high->medium effort | $3-5/mo | Trivial |
| Cache intake classifications for duplicate titles | $1-2/mo | Low |
| Use Gemini Flash for simple stage analyses (stages 00, 08, 15) | $5-10/mo | Medium |
| Reduce PRD maxTokens from 32K to 16K (rarely uses >8K) | $5-10/mo | Trivial |

### 5.4 Token Logging/Monitoring

- **Adapter level**: All adapters return `usage: { inputTokens, outputTokens }` in responses
- **Canary metrics**: `llm_canary_metrics` table records per-request latency and success
- **Database table**: `model_usage_log` exists in schema but **not actively written to by most callsites**
- **Gap**: No aggregated cost dashboard or alerting. Token usage data is returned but not systematically collected.

---

## 6. Caching Patterns

### 6.1 Current Caching

| Location | What's Cached | TTL | Implementation |
|----------|---------------|-----|----------------|
| `lib/intelligent-impact-analyzer.js` | SD impact analysis results | 30 minutes | In-memory `Map` keyed by `sdId_updatedAt` |
| `lib/llm/client-factory.js` | Model registry from database | 5 minutes | Module-level variable with timestamp |
| `lib/llm/canary-router.js` | Canary state | 30 seconds | Module-level variable with timestamp |
| Translation Fidelity Gate | **No caching** | N/A | Documented as 1-hour cache in MEMORY.md but NOT implemented in code |

### 6.2 Missing Caching Opportunities

| Callsite | Why It Should Cache | Recommended Approach |
|----------|--------------------|--------------------|
| **Intake classification** (`intake-classifier.js`) | Same item title re-classified on retry | DB-backed cache keyed by `sha256(title+description)`, 24h TTL |
| **YouTube relevance scoring** | Same video scored multiple times during pipeline reruns | DB-backed cache keyed by `video_id + interests_hash` |
| **EVA stage analysis** | Re-running pipeline for same venture re-executes all 25 stages | Store stage outputs in `venture_stage_artifacts` (already exists), skip if fresh |
| **Translation fidelity gate** | Same upstream/downstream pair evaluated on retry | DB-backed cache keyed by `upstream_id:downstream_id:gate_type`, 1h TTL |
| **SD type classification** | Same SD classified multiple times across workflows | In-memory cache keyed by `sd_key`, 5m TTL |

---

## 7. Local LLM Integration

### 7.1 Architecture

- **Model**: `qwen3-coder:30b` (selected via benchmarking on RTX 5070 Ti)
- **Server**: Ollama (v0.15.4+) running locally
- **Throughput**: ~33 tokens/second
- **API**: OpenAI-compatible endpoint (`/v1/chat/completions`)

### 7.2 Integration Points

| Feature | Status | Details |
|---------|--------|---------|
| Haiku-tier routing | ACTIVE | `USE_LOCAL_LLM=true` routes haiku-tier to Ollama |
| Automatic cloud fallback | ACTIVE | `OllamaAdapter` falls back to `claude-haiku-3-5-20241022` on failure |
| Canary deployment | IMPLEMENTED | 5-stage gradual rollout (0% -> 5% -> 25% -> 50% -> 100%) |
| Quality gates | IMPLEMENTED | Error rate < 5%, latency < 2x baseline |
| Auto-rollback | IMPLEMENTED | `checkAndRollbackIfNeeded()` runs every 60s |
| Database-driven config | ACTIVE | Models managed in `llm_models` table |
| Embedding support | ACTIVE | `nomic-embed-text` (768 dims) via Ollama |
| Benchmarking tooling | COMPLETE | `scripts/benchmarks/ollama-model-benchmark.mjs` |

### 7.3 Quality Assessment

Based on the benchmark results documented in `lib/llm/README.md`:

| Model | Speed | Classification | JSON | Instruction Following |
|-------|-------|---------------|------|----------------------|
| **qwen3-coder:30b** | 33 tok/s | 100% | 100% | 100% |
| llama3.2:3b | 119 tok/s | 50% | 100% | 100% |
| gpt-oss:20b | 25 tok/s | 0% | 100% | 67% |
| deepseek-r1:14b | 41 tok/s | 0% | 0% | 0% |

The selected model (`qwen3-coder:30b`) is well-suited for haiku-tier tasks (classification, fast operations). It would NOT be appropriate for:
- Complex reasoning (validation, security analysis)
- Long-form generation (PRD, vision documents)
- Multi-step analysis (stages that require deep reasoning)

These are correctly routed to cloud models by the factory.

---

## 8. Security Review

### 8.1 API Key Management

| Check | Status | Details |
|-------|--------|---------|
| Keys in environment variables | PASS | All keys loaded from `process.env` at runtime |
| No hardcoded keys | PASS | No API keys found in source code |
| `.env.example` has placeholders | PASS | Template values only, no real keys |
| Service role key warning | PASS | `.env.example` has security warning for `SUPABASE_SERVICE_ROLE_KEY` |
| Edge function key access | PASS | `Deno.env.get()` for edge functions |

### 8.2 Prompt Injection Mitigation

| Vector | Risk Level | Mitigation |
|--------|-----------|------------|
| User-supplied titles/descriptions in prompts | LOW | Data comes from Todoist/YouTube (user's own data), confined to user prompt |
| SD data in prompts | MINIMAL | SD data is system-generated and stored in database |
| Unicode surrogate injection | MITIGATED | `sanitizeUnicode()` applied in all adapter `.complete()` calls |
| Markdown injection in LLM output | LOW | Output parsed as JSON, not rendered as HTML |

### 8.3 LLM Output Safety

| Risk | Status | Details |
|------|--------|---------|
| `eval()` of LLM output | NOT FOUND | All structured output uses `JSON.parse()` |
| SQL injection from LLM output | NOT FOUND | No SQL construction from LLM responses |
| Command injection from LLM output | NOT FOUND | No shell execution from LLM responses |
| XSS from LLM output | LOW | Output goes to database, not directly to HTML |
| Path traversal from LLM output | NOT FOUND | No file operations based on LLM responses |

### 8.4 API Key in URL (Google Gemini)

**Concern**: `GoogleAdapter` passes the API key as a URL query parameter:
```
`${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`
```

This is the standard Google AI API pattern, but the key appears in:
- Server logs if URL logging is enabled
- Network monitoring tools
- Error messages that include the URL

**Recommendation**: This is Google's documented approach and cannot be avoided without using their SDK. Ensure server-side logs do not capture full URLs.

### 8.5 OpenAI Realtime Token Edge Function

The `openai-realtime-token` edge function:
- Properly validates JWT auth before issuing tokens
- Enforces $500/month cost cap
- Does NOT expose the OpenAI API key to the client (returns ephemeral session token)
- Records usage in `voice_conversations` table

**One concern**: The `instructions` field in the session config can be user-supplied (`sessionConfig.instructions`), which could potentially be used for prompt injection against the voice model. However, the function has a default instruction set and this is a low-risk vector since it only affects the user's own session.

---

## 9. Architectural Recommendations

### 9.1 High Priority

1. **Migrate `content-generator.js` to factory pattern**
   - File: `lib/marketing/content-generator.js`
   - Replace `new Anthropic()` with `getClassificationClient()` or `getLLMClient({ purpose: 'generation' })`
   - Removes hardcoded model, gains local LLM routing and canary support

2. **Implement token usage logging**
   - The `model_usage_log` table exists but is not populated
   - Add a `logUsage()` call to the adapter response path in `provider-adapters.js`
   - Enables cost monitoring dashboard

3. **Add caching to translation-fidelity-gate.js**
   - MEMORY.md documents a 1-hour cache that does not exist in code
   - Cache by `upstream_id:downstream_id:gate_type` with 1h TTL

4. **Sync canary-router.js tier mapping with factory**
   - `inferTier()` in canary-router.js is stale (maps validation->sonnet, but factory maps to medium effort)
   - Either remove the canary router's tier inference or update it

### 9.2 Medium Priority

5. **Batch YouTube relevance scoring**
   - Currently scores one video at a time in a loop
   - Batch 5-10 videos per prompt to reduce API calls by 80%

6. **Reduce PRD generation maxTokens**
   - Configured at 32,000 but typical output is 4,000-8,000 tokens
   - Reduce to 16,000 to avoid unnecessary token reservation overhead

7. **Add structured output validation to more callsites**
   - `child-sd-llm-service.mjs` has excellent `validateGeneratedFields()` as a pattern
   - Apply to stage analysis outputs, triage suggestions, and score refinement

8. **Downgrade Stage 01 from high to medium effort**
   - Hydration from synthesis data is a transformation, not deep reasoning
   - Medium effort (4K thinking tokens) is sufficient

### 9.3 Low Priority

9. **Consolidate three PRD generator paths**
   - `scripts/prd/llm-generator.js`, `scripts/modules/prd/llm-generator.js`, `scripts/modules/prd-generator/llm-generator.js` appear to be duplicates or evolution stages
   - Verify which is active and remove dead code

10. **Add few-shot examples to low-scoring prompts**
    - `triage-engine.js`, `refine-score.js`, `wave-clusterer.js` would benefit from 1-2 examples in prompt

11. **Remove dead config in child-sd-llm-service.mjs**
    - `model: 'gpt-4o'` in CHILD_SD_LLM_CONFIG is never used (factory handles model selection)

---

## 10. Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 9/10 | Excellent centralized factory with multi-provider support, canary routing, database registry |
| **Factory Adoption** | 7/10 | ~85% of callsites use factory; 5-6 active bypasses remain |
| **Prompt Quality** | 7/10 | Best prompts are excellent (5/5); ~10 callsites need improvement |
| **Error Handling** | 7/10 | Adapter layer is strong; callsite layer is inconsistent |
| **Response Validation** | 6/10 | JSON parsing is standard; schema validation is rare |
| **Caching** | 4/10 | Only 1 callsite caches LLM results; major optimization missed |
| **Cost Optimization** | 6/10 | Effort-based routing helps; batch and cache opportunities untapped |
| **Security** | 9/10 | No hardcoded keys; Unicode sanitization; no dangerous output patterns |
| **Local LLM** | 10/10 | Complete implementation with canary, quality gates, benchmarking |
| **Monitoring** | 5/10 | Token usage returned but not systematically collected or alerted on |

**Overall Grade: B+ (78/100)**

The LLM infrastructure is architecturally sound and well-documented. The main gaps are in caching (could save 15-25% on monthly costs), monitoring (no cost dashboard), and completing the migration of bypass callsites to the factory pattern.

---

*Report generated by automated audit. All file paths are relative to repository root (`C:\Users\rickf\Projects\_EHG\EHG_Engineer\`).*
