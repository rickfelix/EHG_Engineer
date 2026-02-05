# Ollama Model Benchmark History

This file tracks benchmark results over time to inform model selection decisions.

## Latest Results

**Date**: 2026-02-05
**Hardware**: 96 GB RAM, 12 GB VRAM (RTX 5070 Ti)
**Ollama Version**: 0.15.4
**Benchmark Tool Version**: 1.0.0

### Summary Table

| Model | Speed (tok/s) | Classify % | JSON % | Instruct % | Recommendation |
|-------|---------------|------------|--------|------------|----------------|
| qwen3-coder:30b | 33.3 | **100%** | **100%** | **100%** | **BEST FOR HAIKU REPLACEMENT** |
| llama3.2:3b | **119.5** | 50% | 100% | 100% | Fastest, weak classification |
| gpt-oss:20b | 24.9 | 0% | 100% | 66.7% | Failed classification |
| deepseek-r1:14b | 41.0 | 0% | 0% | 0% | Thinking tokens corrupt output |

### Decision

**Selected Model**: `qwen3-coder:30b`
**Rationale**: 100% accuracy on all quality metrics. 33 tok/s is acceptable for non-realtime Haiku replacement tasks.

### Triangulation Notes

External AI predictions vs actual results:

| Model | AntiGravity Predicted | OpenAI Predicted | Actual |
|-------|----------------------|------------------|--------|
| gpt-oss:20b | 9/10 "WINNER" | 7/10 | ❌ 0% classification |
| llama3.2:3b | 3/10 "TOO WEAK" | 8/10 | ⚠️ Fast but 50% classify |
| qwen3-coder:30b | 4/10 "TOO SLOW" | 5/10 | ✅ **33 tok/s + 100% accuracy** |
| deepseek-r1:14b | 6/10 "DANGEROUS" | 6/10 | ❌ Confirmed thinking leakage |

**Lesson**: External AI predictions can be misleading. Always benchmark on actual hardware.

---

## Benchmark Archive

### 2026-02-05 (Initial Benchmark)

**Purpose**: Evaluate local models as Claude Haiku replacements
**File**: `benchmark-2026-02-05T14-11-43-868Z.json`

**Key Findings**:
1. `qwen3-coder:30b` is the best Haiku replacement despite being a "coding" model
2. `gpt-oss:20b` (OpenAI's open model) failed classification tasks unexpectedly
3. `deepseek-r1:14b` is unsuitable due to thinking token leakage
4. Speed varied significantly from external predictions (actual testing required)

**Implementation**:
- Added `OllamaAdapter` to `lib/sub-agents/vetting/provider-adapters.js`
- Default model: `qwen3-coder:30b`
- Fallback to Claude Haiku if Ollama unavailable

**Integration (2026-02-05)**:
- ✅ `USE_LOCAL_LLM=true` added to `.env`
- ✅ `lib/intelligent-impact-analyzer.js` updated to use OllamaAdapter
- ✅ End-to-end tested: Successfully analyzed SD with 7 sub-agents identified
- ✅ No ANTHROPIC_API_KEY required when local LLM enabled

---

## How to Add New Results

1. Run benchmark: `node scripts/benchmarks/ollama-model-benchmark.mjs`
2. Copy summary to this file with date header
3. Note any decisions or configuration changes
4. Reference the JSON file for detailed metrics

## Related Files

- `ollama-model-benchmark.mjs` - Benchmark tool
- `test-ollama-adapter.mjs` - Adapter verification test
- `../../../lib/sub-agents/vetting/provider-adapters.js` - OllamaAdapter implementation
- `../../../lib/config/model-config.js` - Model configuration
