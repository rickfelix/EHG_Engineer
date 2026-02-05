# Benchmarks

Tools for benchmarking and comparing LLM model performance.

## Latest Results (2026-02-05)

| Model | Speed | Classify | JSON | Instruct | Status |
|-------|-------|----------|------|----------|--------|
| **qwen3-coder:30b** | 33 tok/s | 100% | 100% | 100% | ✅ **SELECTED** |
| llama3.2:3b | 119 tok/s | 50% | 100% | 100% | Fast but weak |
| gpt-oss:20b | 25 tok/s | 0% | 100% | 67% | ❌ Failed classify |
| deepseek-r1:14b | 41 tok/s | 0% | 0% | 0% | ❌ Thinking leak |

**Selected for Haiku replacement**: `qwen3-coder:30b`

## Integration Status: ✅ LIVE

Local LLM is now integrated and active via the **LLM Client Factory**:

### Production Integration

| Component | Location | Purpose |
|-----------|----------|---------|
| **LLM Client Factory** | `lib/llm/client-factory.js` | Central routing for all LLM operations |
| **Factory API** | `lib/llm/index.js` | Public exports and helpers |
| **Factory Docs** | `lib/llm/README.md` | Architecture, routing rules, API reference |
| **Environment** | `.env` | `USE_LOCAL_LLM=true` |
| **Ollama Adapter** | `lib/sub-agents/vetting/provider-adapters.js` | Local inference with cloud fallback |

### How Benchmarks Inform Production

1. **Model Selection**: Benchmarks determine which model is used for haiku-tier tasks
   - Current: `qwen3-coder:30b` (33 tok/s, 100% accuracy)
   - Factory constant: `LOCAL_HAIKU_REPLACEMENT` in `client-factory.js`

2. **Routing Rules**: Benchmark results validated tier-to-model mapping
   - Haiku tier → `qwen3-coder:30b` (local) or `claude-haiku-3-5` (cloud)
   - Sonnet tier → `claude-sonnet-4` (cloud only)
   - Opus tier → `claude-opus-4-5` (cloud only, never local)

3. **Quality Gates**: Classification/JSON/instruction tests ensure model reliability
   - Models must pass 100% classification accuracy for haiku replacement
   - JSON generation must be reliable (100% valid output)
   - Instruction following must be strict (≥67% pass rate)

4. **Token Savings**: Benchmarks quantified cost reduction
   - ~159,000 tokens/week saved (was Haiku, now local)
   - ~636,000 tokens/month freed up for Sonnet/Opus work

### See Factory Documentation

For implementation details and usage:
- **[LLM Client Factory README](../../lib/llm/README.md)** - Architecture, routing, API reference
- **[BENCHMARK_HISTORY.md](results/BENCHMARK_HISTORY.md)** - Full history and triangulation notes

## Available Benchmarks

### ollama-model-benchmark.mjs

Benchmark local LLM models via Ollama to inform model selection decisions.

**Use Case:** Compare local models as potential replacements for cloud models (e.g., replacing Claude Haiku with local inference).

#### Quick Start

```bash
# Test all installed models with default settings
node scripts/benchmarks/ollama-model-benchmark.mjs

# Test specific models
node scripts/benchmarks/ollama-model-benchmark.mjs --models gpt-oss:20b,llama3.2:3b

# Run only speed and classification tests
node scripts/benchmarks/ollama-model-benchmark.mjs --tasks speed,classify

# More iterations for statistical significance
node scripts/benchmarks/ollama-model-benchmark.mjs --iterations 5

# Save results to specific file
node scripts/benchmarks/ollama-model-benchmark.mjs --output my-results.json

# Verbose output
node scripts/benchmarks/ollama-model-benchmark.mjs --verbose
```

#### Test Categories

**Core Tests** (default):

| Test | Description | Metrics |
|------|-------------|---------|
| `speed` | Raw token generation speed | tokens/second, duration |
| `classify` | Classification accuracy (BUG/FEATURE/REFACTOR/DOCS) | accuracy % |
| `json` | Valid JSON output generation | reliability % |
| `instruct` | Strict instruction following | pass rate % |

**Agent Workload Tests** (use `--agents` flag) - EHG_Engineer sub-agents:

| Test | Maps to Agent | Description |
|------|---------------|-------------|
| `rca` | rca-agent | Root cause analysis, 5-whys reasoning |
| `design` | design-agent | Trade-off analysis, component decisions |
| `quickfix` | quickfix-agent | Bug triage, LOC estimation |
| `schema` | database-agent | PostgreSQL schema generation |
| `review` | testing-agent | Code review, security issue detection |

**EHG Frontend Tests** (use `--ehg` flag) - User-facing AI features:

| Test | Maps to EHG Component | Description |
|------|----------------------|-------------|
| `content` | ai-service-manager, ai-generate | Chairman insights, navigation suggestions, executive summaries |
| `analytics` | ai-analytics-engine | Portfolio analysis, trend identification, data reasoning |
| `research` | llm_tools.py, llm_fallback.py | Funding data, market sizing, competitive analysis simulation |
| `painpoint` | llm_fallback.py | Pain point validation, market validation logic |

#### Model-to-Agent Routing (EHG_Engineer)

Run with `--agents` to get routing recommendations for EHG_Engineer sub-agents:
```bash
node scripts/benchmarks/ollama-model-benchmark.mjs --agents --verbose
```

Output includes a "RECOMMENDED AGENT ROUTING" section showing which model performs best for each agent type.

#### EHG Frontend Readiness Testing

Run with `--ehg` to test models for user-facing AI features (critical for EHG repository):
```bash
node scripts/benchmarks/ollama-model-benchmark.mjs --ehg --verbose
```

Output includes:
- **EHG FRONTEND TESTS** section with content/analytics/research/painpoint scores
- **EHG Ready?** status: ✅ = Safe for user-facing, ⚠️ = Internal only, ❌ = Not recommended
- **RECOMMENDED EHG TASK ROUTING** section for routing decisions

**When to use `--ehg`:**
- Before integrating local LLM into EHG frontend (`src/lib/llm/adapter.ts`)
- Before routing user-facing AI features to local models
- To validate content generation quality for chairman insights
- To test analytics reasoning for portfolio features

#### Full Multi-Repository Benchmark

Run with both flags for complete routing recommendations across EHG and EHG_Engineer:
```bash
node scripts/benchmarks/ollama-model-benchmark.mjs --agents --ehg --iterations 5
```

This produces comprehensive routing tables for:
- EHG_Engineer: Classification, JSON, sub-agent tasks
- EHG: Content generation, analytics, research simulation

#### Output

1. **Console Table**: Summary of all models with recommendation
2. **JSON File**: Detailed results saved to `scripts/benchmarks/results/`

#### Example Output

```
====================================================================================================
BENCHMARK RESULTS SUMMARY
====================================================================================================
Model                    Speed (tok/s)  Classify %  JSON %    Instruct %  Recommendation
----------------------------------------------------------------------------------------------------
llama3.2:3b              23.1           83.3        100.0     66.7        RECOMMENDED
gpt-oss:20b              7.9            100.0       100.0     100.0       Viable
deepseek-r1:14b          10.7           66.7        50.0      33.3        Not recommended
====================================================================================================
```

#### Requirements

- Ollama running locally (`ollama serve`)
- Models installed (`ollama pull <model>`)

#### Extending the Benchmark

To add new test categories:

1. Add test definition to `TEST_PROMPTS` object
2. Create `benchmarkNewTest()` function following existing patterns
3. Add to main loop and results formatting

## Results Directory

Benchmark results are saved to `scripts/benchmarks/results/` with timestamps:
- `benchmark-2026-02-05T10-30-00-000Z.json`

## Related Documentation

- [Triangulation Protocol](../../.claude/commands/triangulation-protocol.md) - Multi-AI verification
- [Model Configuration](../../lib/config/model-config.js) - LLM model selection
- [Provider Adapters](../../lib/sub-agents/vetting/provider-adapters.js) - API integration patterns
