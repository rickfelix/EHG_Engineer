# LLM Client Factory


## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Routing Rules](#routing-rules)
  - [Tier Mapping](#tier-mapping)
  - [Purpose to Tier](#purpose-to-tier)
  - [Sub-Agent Routing](#sub-agent-routing)
- [Configuration](#configuration)
  - [Enable Local LLM](#enable-local-llm)
  - [Ollama Configuration (Optional)](#ollama-configuration-optional)
- [Database-Driven Model Registry](#database-driven-model-registry)
  - [How It Works](#how-it-works)
  - [Database Schema](#database-schema)
  - [Managing Models via Database](#managing-models-via-database)
  - [Initialization (Recommended)](#initialization-recommended)
  - [Refresh Registry](#refresh-registry)
  - [New API Functions](#new-api-functions)
  - [Related Files](#related-files)
- [Canary Routing (Phase III)](#canary-routing-phase-iii)
  - [Architecture](#architecture)
  - [Canary Stages](#canary-stages)
  - [Quick Start](#quick-start)
  - [CLI Control](#cli-control)
  - [Quality Gates](#quality-gates)
  - [Deterministic Routing](#deterministic-routing)
  - [Database Tables](#database-tables)
  - [Canary API Functions](#canary-api-functions)
  - [Related Files](#related-files)
- [API Reference](#api-reference)
  - [getLLMClient(options)](#getllmclientoptions)
  - [Helper Functions](#helper-functions)
- [Adapter Interface](#adapter-interface)
- [Files](#files)
- [Benchmarks](#benchmarks)
  - [Benchmark-Driven Selection](#benchmark-driven-selection)
  - [Running Your Own Benchmarks](#running-your-own-benchmarks)
- [Migration Guide](#migration-guide)
  - [Converting Direct Anthropic Calls to Factory Pattern](#converting-direct-anthropic-calls-to-factory-pattern)
  - [Migration Checklist](#migration-checklist)
  - [Adapter Response Differences](#adapter-response-differences)
- [Codebase Migration Audit](#codebase-migration-audit)
  - [Summary](#summary)
  - [Top Migration Candidates](#top-migration-candidates)
  - [Migration Priority Matrix](#migration-priority-matrix)
  - [Token Savings Breakdown](#token-savings-breakdown)
- [Operational Runbook](#operational-runbook)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Troubleshooting](#troubleshooting)
  - [Monitoring](#monitoring)
  - [Adding a New Model](#adding-a-new-model)
  - [Lessons Learned](#lessons-learned)
- [Related Documentation](#related-documentation)

Centralized LLM client management for EHG_Engineer. This module provides a single entry point for all LLM operations, with automatic routing based on task tier and local LLM configuration.

**SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B**: Now supports database-driven model registry via `v_llm_model_registry` view.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    getLLMClient(options)                        │
│                    (Central Entry Point)                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
            ▼             ▼             ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │  Haiku    │  │  Sonnet   │  │   Opus    │
    │   Tier    │  │   Tier    │  │   Tier    │
    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
          │              │              │
    ┌─────┴─────┐        │              │
    │           │        │              │
    ▼           ▼        ▼              ▼
┌────────┐ ┌────────┐ ┌────────┐   ┌────────┐
│ Ollama │ │ Haiku  │ │ Sonnet │   │  Opus  │
│ (local)│ │(cloud) │ │(cloud) │   │(cloud) │
└────────┘ └────────┘ └────────┘   └────────┘
     ↑
     │ USE_LOCAL_LLM=true
```

## Quick Start

```javascript
import { getLLMClient, getClassificationClient } from '../llm/index.js';

// Get client for a specific sub-agent (uses routing config)
const client = getLLMClient({ subAgent: 'DATABASE', phase: 'EXEC' });
const result = await client.complete(systemPrompt, userPrompt);

// Quick helpers for common use cases
const classifier = getClassificationClient();  // Haiku tier
const validator = getValidationClient();       // Sonnet tier
const security = getSecurityClient();          // Opus tier (never local)
```

## Routing Rules

### Tier Mapping

| Tier | Cloud Model | Local Model (if enabled) |
|------|-------------|--------------------------|
| haiku | claude-haiku-3-5-20241022 | qwen3-coder:30b |
| sonnet | claude-sonnet-4-20250514 | (cloud only) |
| opus | claude-opus-4-5-20251101 | (cloud only) |

### Purpose to Tier

| Purpose | Tier | Local Eligible? |
|---------|------|-----------------|
| classification | haiku | ✅ Yes |
| fast | haiku | ✅ Yes |
| screening | haiku | ✅ Yes |
| triage | haiku | ✅ Yes |
| validation | sonnet | ❌ No |
| generation | sonnet | ❌ No |
| analysis | sonnet | ❌ No |
| design | sonnet | ❌ No |
| security | opus | ❌ Never |
| critical | opus | ❌ Never |

### Sub-Agent Routing

Sub-agent routing respects `config/phase-model-routing.json`:

```javascript
// Example: GITHUB agent in EXEC phase → haiku → local (if enabled)
const client = getLLMClient({ subAgent: 'GITHUB', phase: 'EXEC' });

// Example: SECURITY agent → opus → always cloud
const client = getLLMClient({ subAgent: 'SECURITY', phase: 'EXEC' });
```

## Configuration

### Enable Local LLM

Add to `.env`:
```bash
USE_LOCAL_LLM=true
```

### Ollama Configuration (Optional)

```bash
OLLAMA_BASE_URL=http://localhost:11434  # Default
OLLAMA_MODEL=qwen3-coder:30b            # Default
OLLAMA_FALLBACK_ENABLED=true            # Auto-fallback to cloud
OLLAMA_TIMEOUT_MS=30000                 # Request timeout
```

## Database-Driven Model Registry

**SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B** introduced database-driven model configuration:

### How It Works

1. **On first call**: Factory loads model registry from `v_llm_model_registry` database view
2. **Caching**: Registry is cached for 5 minutes to minimize database calls
3. **Fallback**: If database unavailable, hardcoded constants are used
4. **Hot reload**: Call `refreshModelRegistry()` to reload without restart

### Database Schema

The factory reads from the `v_llm_model_registry` view which joins:
- `llm_providers` - Provider config (Anthropic, Ollama, OpenAI, Google)
- `llm_models` - Model config with `leo_tier` (haiku/sonnet/opus) and `is_local` flag

### Managing Models via Database

```sql
-- Add a new local model for haiku tier
INSERT INTO llm_models (
  provider_id, model_key, model_name, leo_tier, is_local, status
) VALUES (
  (SELECT id FROM llm_providers WHERE provider_key = 'ollama'),
  'llama3.2:3b', 'Llama 3.2 3B', 'haiku', TRUE, 'active'
);

-- Change the default sonnet model
UPDATE llm_models
SET leo_tier = 'sonnet'
WHERE model_key = 'claude-sonnet-4-20250514';

-- Deactivate a model
UPDATE llm_models SET status = 'inactive' WHERE model_key = 'old-model';
```

### Initialization (Recommended)

For optimal performance, initialize the factory at application startup:

```javascript
import { initializeLLMFactory } from '../llm/index.js';

// In your app init
await initializeLLMFactory();  // Pre-loads registry from database

// Later calls use cached registry
const client = getLLMClient({ purpose: 'classification' });
```

### Refresh Registry

After database changes, refresh without restarting:

```javascript
import { refreshModelRegistry } from '../llm/index.js';

// After updating llm_models table
await refreshModelRegistry();
```

### New API Functions

```javascript
initializeLLMFactory()   // Pre-load registry at startup
refreshModelRegistry()   // Force reload from database
getModelRegistry()       // Get full registry object (async)
getRoutingStatus()       // Get current routing config with cache info
```

### Related Files

- **Migration**: `database/migrations/20260205_llm_registry_ollama_integration.sql`
- **View**: `v_llm_model_registry` (joins providers + models)
- **Tables**: `llm_providers`, `llm_models`, `model_usage_log`

## Canary Routing (Phase III)

**SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C** introduces gradual traffic shifting with quality-gate protection.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              getCanaryRoutedClient(options)                      │
│                   (Canary Entry Point)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Bucket Hash     │
                    │   (Deterministic) │
                    └─────────┬─────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────┴─────────┐         ┌──────────┴──────────┐
    │  Local (Ollama)   │         │   Cloud (Haiku)     │
    │  % = canary stage │         │   % = 100 - stage   │
    └─────────┬─────────┘         └─────────────────────┘
              │
    ┌─────────┴─────────┐
    │  Quality Gates    │
    │  - Error rate <5% │
    │  - Latency <2x    │
    └─────────┬─────────┘
              │
     [FAIL]───┴───[PASS]
        │           │
        ▼           ▼
   Auto-Rollback  Continue
```

### Canary Stages

| Stage | Local % | Cloud % | Description |
|-------|---------|---------|-------------|
| 0% | 0% | 100% | All cloud (starting state) |
| 5% | 5% | 95% | Initial canary |
| 25% | 25% | 75% | Expanded testing |
| 50% | 50% | 50% | Full validation |
| 100% | 100% | 0% | Complete rollout |

### Quick Start

```javascript
import { getCanaryRoutedClient, getCanaryStatus } from '../llm/index.js';

// Get client with canary traffic splitting
const { client, routing } = await getCanaryRoutedClient({ purpose: 'classification' });
console.log(`Routed to: ${routing.routedTo} (${routing.model})`);

// Check canary status
const status = await getCanaryStatus();
console.log(`Stage: ${status.state.stage}%, Status: ${status.state.status}`);
```

### CLI Control

```bash
# View current status
npm run llm:canary:status

# Advance to next stage (requires passing quality gates)
npm run llm:canary:advance

# Pause/Resume rollout
npm run llm:canary:pause
npm run llm:canary:resume

# Emergency rollback to 0%
npm run llm:canary:rollback

# Check quality gates
npm run llm:canary:quality

# View transition history
npm run llm:canary:history
```

Or use the CLI directly:

```bash
node scripts/llm-canary-control.js status
node scripts/llm-canary-control.js set 5      # Jump to 5%
node scripts/llm-canary-control.js advance    # Move to next stage
node scripts/llm-canary-control.js rollback   # Emergency: back to cloud
```

### Quality Gates

Before advancing stages, these gates must pass:

| Gate | Threshold | Action on Fail |
|------|-----------|----------------|
| Error Rate | ≤5% | Block advance |
| Latency (P95) | ≤2x baseline | Block advance |
| Consecutive Failures | <3 | Auto-rollback |

Quality gates are evaluated over a 5-minute rolling window with at least 10 requests.

### Deterministic Routing

Routing decisions are **deterministic** based on request context:

```javascript
// Same request always routes to same target
const bucketId = getBucketId({ sessionId: 'user-123', subAgent: 'DATABASE' });
const routesToLocal = shouldRouteToLocal(bucketId, currentStage);
```

This ensures consistent behavior for retries and debugging.

### Database Tables

| Table | Purpose |
|-------|---------|
| `llm_canary_state` | Singleton state (stage, thresholds, status) |
| `llm_canary_transitions` | Audit trail of stage changes |
| `llm_canary_metrics` | Per-request metrics for quality evaluation |

### Canary API Functions

```javascript
// State management
getCanaryState()           // Get current state (cached 30s)
refreshCanaryState()       // Force refresh from database

// Stage control
advanceCanaryStage()       // Progress to next stage
setCanaryStage(stage)      // Jump to specific stage
pauseCanary()              // Pause rollout
resumeCanary()             // Resume rollout
rollbackCanary()           // Emergency rollback to 0%

// Quality gates
evaluateQualityGates()     // Check if gates pass
checkAndRollbackIfNeeded() // Auto-rollback if gates fail

// Status
getCanaryStatus()          // Full diagnostic status
```

### Related Files

- **Migration**: `database/migrations/20260206_llm_canary_routing.sql`
- **Router**: `lib/llm/canary-router.js`
- **CLI**: `scripts/llm-canary-control.js`

## API Reference

### getLLMClient(options)

Main entry point for getting an LLM client.

```javascript
const client = getLLMClient({
  purpose: 'classification',  // Purpose category
  subAgent: 'DATABASE',       // Sub-agent code (uses routing config)
  phase: 'EXEC',              // SD phase for sub-agent routing
  provider: 'anthropic',      // Force specific provider
  model: 'claude-sonnet-4',   // Force specific model
  allowLocal: true            // Allow local LLM (default: true)
});
```

### Helper Functions

```javascript
getClassificationClient()  // Haiku tier, local eligible
getFastClient()            // Haiku tier, local eligible
getValidationClient()      // Sonnet tier
getSecurityClient()        // Opus tier, never local
getSubAgentClient(code, phase)  // Route by sub-agent config
isLocalLLMEnabled()        // Check if local LLM is enabled
getRoutingStatus()         // Get current routing config
```

## Adapter Interface

All adapters implement the same interface:

```javascript
const result = await client.complete(systemPrompt, userPrompt, {
  maxTokens: 2000,
  temperature: 0.1
});

// Result structure
{
  content: string,      // Response text
  provider: string,     // 'ollama', 'anthropic', 'openai', 'google'
  model: string,        // Model identifier
  durationMs: number,   // Request duration
  usage: {
    inputTokens: number,
    outputTokens: number
  },
  local: boolean,       // True if local inference
  fallback: boolean     // True if fell back to cloud
}
```

## Files

| File | Purpose |
|------|---------|
| `client-factory.js` | Main factory and routing logic |
| `canary-router.js` | Canary traffic splitting and quality gates |
| `index.js` | Public exports |
| `../sub-agents/vetting/provider-adapters.js` | Adapter implementations |
| `../../config/phase-model-routing.json` | Sub-agent routing config |
| `../../scripts/llm-canary-control.js` | CLI for canary operations |
| `../../database/migrations/20260206_llm_canary_routing.sql` | Canary DB schema |

## Benchmarks

**Model Selection**: This factory uses `qwen3-coder:30b` for haiku-tier tasks based on rigorous benchmarking.

See full benchmark methodology and results:
- **[Benchmark Tool README](../../scripts/benchmarks/README.md)** - How to run benchmarks, test categories, extending
- **[Benchmark History](../../scripts/benchmarks/results/BENCHMARK_HISTORY.md)** - Historical results, triangulation notes, lessons learned

### Benchmark-Driven Selection

| Model | Speed | Classify | JSON | Instruct | Status |
|-------|-------|----------|------|----------|--------|
| **qwen3-coder:30b** | 33 tok/s | 100% | 100% | 100% | ✅ **SELECTED** |
| llama3.2:3b | 119 tok/s | 50% | 100% | 100% | Fast but weak classify |
| gpt-oss:20b | 25 tok/s | 0% | 100% | 67% | Failed classification |
| deepseek-r1:14b | 41 tok/s | 0% | 0% | 0% | Thinking token leak |

**Key Lesson**: External AI recommendations (AntiGravity, OpenAI) predicted gpt-oss:20b as best performer, but actual benchmarking revealed 0% classification accuracy. Always benchmark on your hardware.

### Running Your Own Benchmarks

To evaluate new models or validate on different hardware:

```bash
# Benchmark all installed models
node scripts/benchmarks/ollama-model-benchmark.mjs

# Test specific models
node scripts/benchmarks/ollama-model-benchmark.mjs --models <model1>,<model2>

# Include agent-specific workload tests
node scripts/benchmarks/ollama-model-benchmark.mjs --agents --verbose
```

Results inform model selection in the `llm_models` database table (`is_local=true` + `leo_tier='haiku'`).

## Migration Guide

### Converting Direct Anthropic Calls to Factory Pattern

Before the factory, modules created their own Anthropic clients:

```javascript
// OLD PATTERN (deprecated)
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
const response = await anthropic.messages.create({
  model: 'claude-haiku-3-5-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }]
});
const text = response.content[0].text;
```

Replace with the factory pattern:

```javascript
// NEW PATTERN (use this)
import { getClassificationClient } from '../llm/index.js';
const client = getClassificationClient();
const result = await client.complete(systemPrompt, userPrompt, {
  maxTokens: 1024
});
const text = result.content;
```

### Migration Checklist

1. **Identify the tier**: Is this a classification/fast task (haiku), validation/generation (sonnet), or security (opus)?
2. **Choose the helper**: Use `getClassificationClient()`, `getValidationClient()`, or `getSecurityClient()`
3. **Replace the call**: Swap `anthropic.messages.create()` for `client.complete()`
4. **Remove imports**: Remove `@anthropic-ai/sdk` import if no longer needed in the file
5. **Check env vars**: Ensure `USE_LOCAL_LLM=true` is set if you want local routing

### Adapter Response Differences

| Property | Old (Anthropic SDK) | New (Factory) |
|----------|--------------------|----|
| Response text | `response.content[0].text` | `result.content` |
| Model used | (hardcoded) | `result.model` |
| Provider | Always Anthropic | `result.provider` |
| Local? | No | `result.local` |
| Duration | Not tracked | `result.durationMs` |
| Token usage | `response.usage` | `result.usage` |

## Codebase Migration Audit

**SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001E** conducted a full audit of all LLM call sites.

### Summary

| Metric | Value |
|--------|-------|
| Total LLM call sites | 166 |
| Haiku-eligible (local routing candidates) | 45 |
| Sonnet-tier (cloud only) | 38 |
| Already migrated to factory | 1 |
| Archived/legacy (not active) | 80 |
| Estimated monthly token savings | ~61,500 |

### Top Migration Candidates

These modules are haiku-tier and would benefit most from local routing:

| Module | Purpose | Migration Complexity |
|--------|---------|---------------------|
| `scripts/modules/sd-type-classifier.js` | SD type classification | Low |
| `lib/sub-agents/api-relevance-classifier.js` | API relevance scoring | Low |
| `lib/governance/semantic-diff-validator.js` | Semantic diff validation | Medium |
| `lib/context-aware-sub-agent-selector.js` | Sub-agent selection | Medium |
| `lib/agents/context-monitor.js` | Context monitoring | Low |

### Migration Priority Matrix

| Priority | Criteria | Candidate Count |
|----------|----------|----------------|
| Quick wins | Classification/fast tasks, <50 LOC change | ~15 |
| Medium effort | Structured output, some refactoring | ~20 |
| Complex | Multi-step prompts, custom error handling | ~10 |

### Token Savings Breakdown

- **Already saved** (factory + `intelligent-impact-analyzer.js`): ~159,000 tokens/week
- **Additional potential** (45 haiku-eligible modules): ~61,500 tokens/month
- **Total monthly savings** at full migration: ~695,500 tokens/month

## Operational Runbook

### Prerequisites

- **Ollama**: v0.15.4+ installed and running
- **Hardware**: 12 GB VRAM minimum for `qwen3-coder:30b`
  - Tested on: RTX 5070 Ti (12 GB VRAM), 96 GB RAM
  - Throughput: ~33 tokens/second

### Installation

```bash
# Install Ollama (see https://ollama.com)
# Pull the selected model
ollama pull qwen3-coder:30b

# Verify
ollama list
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_LOCAL_LLM` | `false` | Enable local LLM routing for haiku tier |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `qwen3-coder:30b` | Default local model |
| `OLLAMA_FALLBACK_ENABLED` | `true` | Fall back to cloud if Ollama unavailable |
| `OLLAMA_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ECONNREFUSED` on port 11434 | Ollama not running | Start Ollama: `ollama serve` |
| Slow responses (>60s) | Model too large for VRAM | Use smaller model or check GPU memory |
| Garbled output | Model incompatibility | Benchmark the model with `ollama-model-benchmark.mjs` |
| Fallback messages in logs | Ollama temporarily unavailable | Check Ollama process, restart if needed |
| `USE_LOCAL_LLM` not working | Env var checked at wrong time | Ensure `dotenv.config()` runs before factory calls |

### Monitoring

Check routing status at runtime:

```javascript
import { getRoutingStatus, getCanaryStatus } from '../llm/index.js';

// Basic routing info
const status = getRoutingStatus();
console.log(status);
// { localEnabled: true, localModel: 'qwen3-coder:30b', cacheAge: '2m 30s' }

// Canary status (if using gradual rollout)
const canary = await getCanaryStatus();
console.log(canary);
// { stage: 100, status: 'active', quality: { errorRate: 0.01, latencyRatio: 1.2 } }
```

### Adding a New Model

1. Pull the model: `ollama pull <model-name>`
2. Benchmark it: `node scripts/benchmarks/ollama-model-benchmark.mjs --models <model-name>`
3. If benchmarks pass, add to database:

```sql
INSERT INTO llm_models (provider_id, model_key, model_name, leo_tier, is_local, status)
VALUES (
  (SELECT id FROM llm_providers WHERE provider_key = 'ollama'),
  '<model-name>', '<Display Name>', 'haiku', TRUE, 'active'
);
```

4. Refresh the factory: `await refreshModelRegistry()`

### Lessons Learned

1. **Always benchmark on actual hardware** - External AI predictions about model performance were wrong
2. **Thinking token leakage** - `deepseek-r1:14b` leaked `<think>` tags into output, corrupting JSON
3. **Classification is the hardest task** - Models that pass JSON/instruct tests can still fail classification
4. **Env var timing** - Check `USE_LOCAL_LLM` at call time, not module load time (dotenv timing issue)
5. **Centralize all LLM calls** - Don't let modules create their own clients; route through the factory

## Related Documentation

- **[Benchmark Tool](../../scripts/benchmarks/README.md)** - Run benchmarks, test categories, agent routing
- **[Benchmark History](../../scripts/benchmarks/results/BENCHMARK_HISTORY.md)** - Full results and triangulation analysis
- **[Phase Model Routing](../../config/phase-model-routing.json)** - Sub-agent to tier mapping
- **[Provider Adapters](../sub-agents/vetting/provider-adapters.js)** - Adapter implementations
- **[Migration SQL](../../database/migrations/20260205_llm_registry_ollama_integration.sql)** - Database schema for model registry
- **[Canary SQL](../../database/migrations/20260206_llm_canary_routing.sql)** - Database schema for canary routing
