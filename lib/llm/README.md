# LLM Client Factory

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
| `index.js` | Public exports |
| `../sub-agents/vetting/provider-adapters.js` | Adapter implementations |
| `../../config/phase-model-routing.json` | Sub-agent routing config |

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

## Related Documentation

- **[Benchmark Tool](../../scripts/benchmarks/README.md)** - Run benchmarks, test categories, agent routing
- **[Benchmark History](../../scripts/benchmarks/results/BENCHMARK_HISTORY.md)** - Full results and triangulation analysis
- **[Phase Model Routing](../../config/phase-model-routing.json)** - Sub-agent to tier mapping
- **[Provider Adapters](../sub-agents/vetting/provider-adapters.js)** - Adapter implementations
