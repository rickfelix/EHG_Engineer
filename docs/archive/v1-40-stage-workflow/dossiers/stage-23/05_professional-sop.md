---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 23: Professional SOP (Standard Operating Procedures)


## Table of Contents

- [Purpose](#purpose)
- [Prerequisites (Entry Gates)](#prerequisites-entry-gates)
  - [Gate 1: Data Prepared](#gate-1-data-prepared)
  - [Gate 2: Models Trained](#gate-2-models-trained)
- [Substage 20.1: Context Preparation](#substage-201-context-preparation)
  - [Step 1: Data Collection](#step-1-data-collection)
  - [Step 2: Context Structuring](#step-2-context-structuring)
  - [Step 3: Embeddings Creation](#step-3-embeddings-creation)
  - [Substage 20.1 Exit Validation](#substage-201-exit-validation)
- [Substage 20.2: Loading Optimization](#substage-202-loading-optimization)
  - [Step 1: Caching Configuration](#step-1-caching-configuration)
  - [Step 2: Vector Database Indexes](#step-2-vector-database-indexes)
  - [Step 3: Memory Optimization](#step-3-memory-optimization)
  - [Substage 20.2 Exit Validation](#substage-202-exit-validation)
- [Substage 20.3: Validation & Testing](#substage-203-validation-testing)
  - [Step 1: Context Validation](#step-1-context-validation)
  - [Step 2: Performance Testing](#step-2-performance-testing)
  - [Step 3: Accuracy Verification](#step-3-accuracy-verification)
  - [Substage 20.3 Exit Validation](#substage-203-exit-validation)
- [Stage 23 Exit Gates](#stage-23-exit-gates)
  - [Exit Gate Validation (All 3 Must Pass)](#exit-gate-validation-all-3-must-pass)
  - [If Exit Gates Fail](#if-exit-gates-fail)
- [Post-Stage 23 Actions](#post-stage-23-actions)
  - [Success Path (All Exit Gates Passed)](#success-path-all-exit-gates-passed)
  - [Failure Path (Exit Gates Failed)](#failure-path-exit-gates-failed)
- [Execution Time Tracking](#execution-time-tracking)

## Purpose

Step-by-step execution procedures for Stage 23 (Continuous Feedback Loops), enabling EXEC/EVA agents to execute consistently across ventures.

**Owner**: EXEC (with EVA automation)
**Automation Level**: 5/5 (fully automatable)
**Expected Duration**: 1-2 hours (automated execution)
**Manual Duration**: 6-12 hours (if automation fails)

## Prerequisites (Entry Gates)

Before starting Stage 23, verify:

### Gate 1: Data Prepared

**Validation Query**:
```sql
SELECT venture_id,
       data_sources_accessible,
       database_query_status,
       api_endpoints_available
FROM stage_23_prerequisites
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 columns = `true`

**If False**: Recurse to Stage 19 (verify API integrations), ensure all data sources online.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:892 "- Data prepared"

### Gate 2: Models Trained

**Validation Query**:
```sql
SELECT venture_id,
       embeddings_api_key_valid,
       embeddings_model_accessible,
       test_embedding_created
FROM stage_23_prerequisites
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 columns = `true`

**If False**: Verify OpenAI API key, test embeddings API (`curl -X POST https://api.openai.com/v1/embeddings -H "Authorization: Bearer $API_KEY" -d '{"input":"test","model":"text-embedding-ada-002"}'`).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:893 "- Models trained"

## Substage 20.1: Context Preparation

**Objective**: Collect all context data, structure it, create embeddings.

**Duration**: 30-60 minutes (depends on document count, API rate limits)

### Step 1: Data Collection

**Action**: Fetch data from all 3 input sources.

**Commands**:
```bash
# 1. Collect system context (from Stage 18 documentation sync)
node scripts/collect-system-context.js --venture-id VENTURE-001 --output data/context/system.json

# 2. Collect historical data (from venture database)
node scripts/collect-historical-data.js --venture-id VENTURE-001 --output data/context/historical.json --limit 10000

# 3. Collect knowledge base (from Notion, Confluence, or database)
node scripts/collect-knowledge-base.js --venture-id VENTURE-001 --output data/context/knowledge.json
```

**Expected Outputs**:
- `data/context/system.json` (10-50KB, configuration files, schemas)
- `data/context/historical.json` (1-100MB, user interactions, transaction logs)
- `data/context/knowledge.json` (100KB-10MB, FAQs, documentation)

**Validation**:
```bash
# Verify files exist and are non-empty
ls -lh data/context/
# Expected: 3 files (system.json, historical.json, knowledge.json)

# Check file sizes
du -sh data/context/*
# Expected: system.json <1MB, historical.json 1-100MB, knowledge.json <10MB
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:902 "- Data collected"

**Troubleshooting**:
- **Error**: `Database connection timeout` → Increase timeout in `collect-historical-data.js` (default 30s → 120s)
- **Error**: `API rate limit exceeded (Notion)` → Add delay between requests (100ms → 500ms)
- **Error**: `File size exceeds limit (historical.json >100MB)` → Reduce `--limit` parameter (10000 → 5000)

### Step 2: Context Structuring

**Action**: Transform raw data into structured format for embeddings.

**Commands**:
```bash
# Structure system context (extract markdown, YAML, JSON)
node scripts/structure-context.js --input data/context/system.json --output data/context/structured/system/ --type system

# Structure historical data (convert to markdown chunks)
node scripts/structure-context.js --input data/context/historical.json --output data/context/structured/historical/ --type historical

# Structure knowledge base (split documents into chunks <8k tokens)
node scripts/structure-context.js --input data/context/knowledge.json --output data/context/structured/knowledge/ --type knowledge --chunk-size 8000
```

**Expected Outputs**:
- `data/context/structured/system/` (10-100 markdown files)
- `data/context/structured/historical/` (100-10k markdown files)
- `data/context/structured/knowledge/` (100-1k markdown files)

**Validation**:
```bash
# Count structured documents
find data/context/structured/ -name "*.md" | wc -l
# Expected: 200-11k files (depends on venture size)

# Verify chunk sizes (all <8k tokens)
node scripts/validate-chunk-sizes.js --dir data/context/structured/
# Expected: All chunks <8192 tokens
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:903 "- Context structured"

**Troubleshooting**:
- **Error**: `Chunk size exceeds 8k tokens` → Reduce `--chunk-size` parameter (8000 → 6000)
- **Error**: `Invalid markdown syntax` → Run markdown linter (`npx markdownlint data/context/structured/`)
- **Error**: `File encoding error (UTF-8 expected)` → Convert files (`iconv -f ISO-8859-1 -t UTF-8`)

### Step 3: Embeddings Creation

**Action**: Generate embeddings for all structured documents via OpenAI API.

**Commands**:
```bash
# Create embeddings for system context
node scripts/create-embeddings.js --input data/context/structured/system/ --output data/embeddings/system.json --model text-embedding-ada-002

# Create embeddings for historical data
node scripts/create-embeddings.js --input data/context/structured/historical/ --output data/embeddings/historical.json --model text-embedding-ada-002 --batch-size 100

# Create embeddings for knowledge base
node scripts/create-embeddings.js --input data/context/structured/knowledge/ --output data/embeddings/knowledge.json --model text-embedding-ada-002
```

**Expected Outputs**:
- `data/embeddings/system.json` (10-100 vectors, 1536-dimensional)
- `data/embeddings/historical.json` (100-10k vectors, 1536-dimensional)
- `data/embeddings/knowledge.json` (100-1k vectors, 1536-dimensional)

**Cost Estimation**:
- OpenAI embeddings: $0.0001/1k tokens
- Expected cost: $0.10-$10 (depends on document count, 1M-100M tokens)

**Validation**:
```sql
-- Count created embeddings
SELECT COUNT(*) AS embedding_count,
       AVG(ARRAY_LENGTH(embedding_vector, 1)) AS avg_dimensions
FROM stage_23_embeddings
WHERE venture_id = 'VENTURE-001';

-- Expected: embedding_count = 200-11k, avg_dimensions = 1536
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:904 "- Embeddings created"

**Troubleshooting**:
- **Error**: `429 Too Many Requests (OpenAI)` → Add retry with exponential backoff (1s, 2s, 4s, 8s)
- **Error**: `Invalid API key` → Verify `OPENAI_API_KEY` environment variable
- **Error**: `Embedding dimension mismatch (expected 1536, got 768)` → Check model name (should be `text-embedding-ada-002`, not `text-embedding-3-small`)
- **Error**: `Out of memory (OOM)` → Reduce `--batch-size` (100 → 10)

### Substage 20.1 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       data_collected,
       context_structured,
       embeddings_created,
       embedding_count
FROM stage_23_substage_1_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 booleans = `true`, `embedding_count` ≥ 200

**If False**: Review error logs, re-run failed steps.

## Substage 20.2: Loading Optimization

**Objective**: Configure caching, create vector database indexes, optimize memory usage.

**Duration**: 15-30 minutes

### Step 1: Caching Configuration

**Action**: Set up Redis cache for context models (LRU eviction).

**Commands**:
```bash
# Initialize Redis cache for venture
node scripts/init-redis-cache.js --venture-id VENTURE-001 --max-memory 1GB --eviction-policy allkeys-lru

# Preload context models into cache
node scripts/preload-cache.js --venture-id VENTURE-001 --embeddings data/embeddings/ --ttl 3600
```

**Expected Outputs**:
- Redis cache populated (1000-10k keys)
- Cache TTL: 3600s (1 hour)
- Memory usage: <1GB

**Validation**:
```bash
# Check Redis cache status
redis-cli INFO memory
# Expected: used_memory_human:<1G, eviction_policy:allkeys-lru

# Count cached keys
redis-cli DBSIZE
# Expected: 1000-10k keys
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:908 "- Caching configured"

**Troubleshooting**:
- **Error**: `Redis connection refused` → Start Redis server (`sudo service redis-server start`)
- **Error**: `Memory limit exceeded` → Increase `--max-memory` (1GB → 2GB) or reduce cached keys
- **Error**: `Cache TTL too short (preload time >TTL)` → Increase `--ttl` (3600s → 7200s)

### Step 2: Vector Database Indexes

**Action**: Upload embeddings to Pinecone, create HNSW indexes.

**Commands**:
```bash
# Create Pinecone index for venture
node scripts/create-pinecone-index.js --venture-id VENTURE-001 --dimension 1536 --metric cosine --pod-type p1.x1

# Upload embeddings to Pinecone
node scripts/upload-to-pinecone.js --venture-id VENTURE-001 --embeddings data/embeddings/ --batch-size 100
```

**Expected Outputs**:
- Pinecone index created (1536-dimensional, cosine similarity)
- Embeddings uploaded (200-11k vectors)
- Index build time: 5-15 minutes

**Validation**:
```bash
# Check Pinecone index status
curl -X GET "https://controller.{region}.pinecone.io/databases/{index-name}" \
  -H "Api-Key: $PINECONE_API_KEY"

# Expected: "status":"Ready", "dimension":1536, "metric":"cosine"

# Count vectors in index
node scripts/pinecone-stats.js --venture-id VENTURE-001
# Expected: vector_count ≥ 200
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:909 "- Indexes created"

**Troubleshooting**:
- **Error**: `Pinecone API key invalid` → Verify `PINECONE_API_KEY` environment variable
- **Error**: `Index already exists` → Delete existing index or use `--overwrite` flag
- **Error**: `Upload timeout` → Reduce `--batch-size` (100 → 10) or increase timeout (30s → 120s)
- **Error**: `Dimension mismatch (expected 1536, got 768)` → Check embeddings model (should be `text-embedding-ada-002`)

### Step 3: Memory Optimization

**Action**: Profile memory usage, optimize context loading footprint.

**Commands**:
```bash
# Profile memory usage
node --trace-warnings --max-old-space-size=4096 scripts/profile-memory.js --venture-id VENTURE-001

# Generate memory report
node scripts/memory-report.js --venture-id VENTURE-001 --output reports/stage-23-memory.json
```

**Expected Outputs**:
- Memory footprint: <2GB RAM (target)
- Heap usage: <1.5GB
- External memory: <500MB

**Validation**:
```sql
-- Check memory metrics
SELECT venture_id,
       peak_memory_mb,
       avg_memory_mb,
       heap_usage_mb
FROM stage_23_memory_metrics
WHERE venture_id = 'VENTURE-001';

-- Expected: peak_memory_mb <2048, heap_usage_mb <1536
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:910 "- Memory optimized"

**Troubleshooting**:
- **Error**: `Memory usage exceeds 2GB` → Enable streaming (load embeddings in chunks, not all at once)
- **Error**: `Heap out of memory` → Increase `--max-old-space-size` (4096 → 8192) or optimize data structures
- **Error**: `Memory leak detected` → Run `node --inspect` and analyze with Chrome DevTools

### Substage 20.2 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       caching_configured,
       indexes_created,
       memory_optimized,
       peak_memory_mb
FROM stage_23_substage_2_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 booleans = `true`, `peak_memory_mb` < 2048

## Substage 20.3: Validation & Testing

**Objective**: Validate context completeness, test performance, verify accuracy.

**Duration**: 15-30 minutes

### Step 1: Context Validation

**Action**: Verify all expected documents loaded, completeness ≥90%.

**Commands**:
```bash
# Run context completeness check
node scripts/validate-context-completeness.js --venture-id VENTURE-001 --expected data/expected-documents.json --actual data/embeddings/
```

**Expected Outputs**:
- Feedback volume: ≥90%
- Missing documents: <10% (if any)

**Validation**:
```sql
SELECT venture_id,
       expected_document_count,
       actual_document_count,
       (actual_document_count::FLOAT / expected_document_count * 100) AS completeness_percentage
FROM stage_23_completeness_metrics
WHERE venture_id = 'VENTURE-001';

-- Expected: completeness_percentage ≥ 90
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:914 "- Context validated"

**Troubleshooting**:
- **Error**: `Completeness <90%` → Review missing documents, re-run Substage 20.1 (data collection)
- **Error**: `Expected document list not found` → Generate expected list (`node scripts/generate-expected-documents.js`)
- **Error**: `Document count mismatch (expected 1000, got 500)` → Check data collection filters (may be excluding valid documents)

### Step 2: Performance Testing

**Action**: Benchmark context loading time, ensure <500ms.

**Commands**:
```bash
# Run performance benchmark (cold start, no cache)
node scripts/benchmark-context-loading.js --venture-id VENTURE-001 --iterations 10 --cold-start

# Run performance benchmark (warm start, with cache)
node scripts/benchmark-context-loading.js --venture-id VENTURE-001 --iterations 100 --warm-start
```

**Expected Outputs**:
- Cold start: <500ms (p50), <1000ms (p95)
- Warm start: <100ms (p50), <200ms (p95)

**Validation**:
```sql
SELECT venture_id,
       cold_start_p50_ms,
       cold_start_p95_ms,
       warm_start_p50_ms,
       warm_start_p95_ms
FROM stage_23_performance_metrics
WHERE venture_id = 'VENTURE-001';

-- Expected: cold_start_p95_ms < 1000, warm_start_p50_ms < 100
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:915 "- Performance tested"

**Troubleshooting**:
- **Error**: `Loading time >500ms` → Enable caching (verify Redis), optimize indexes (rebuild Pinecone index)
- **Error**: `Performance regression (previous <500ms, now >1000ms)` → Check server load (CPU, disk I/O), review recent changes
- **Error**: `Benchmark timeout` → Increase iterations timeout (30s → 120s)

### Step 3: Accuracy Verification

**Action**: Spot-check embeddings via semantic search, verify correct results.

**Commands**:
```bash
# Run semantic search test suite
node scripts/test-semantic-search.js --venture-id VENTURE-001 --test-cases tests/semantic-search-cases.json

# Example test: Search "How do I reset my password?" → Should return password reset docs
```

**Expected Outputs**:
- Semantic search accuracy: ≥95%
- Top-1 accuracy: ≥80% (correct result in top position)
- Top-5 accuracy: ≥95% (correct result in top 5)

**Validation**:
```sql
SELECT venture_id,
       test_cases_total,
       test_cases_passed,
       (test_cases_passed::FLOAT / test_cases_total * 100) AS accuracy_percentage
FROM stage_23_accuracy_metrics
WHERE venture_id = 'VENTURE-001';

-- Expected: accuracy_percentage ≥ 95
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:916 "- Accuracy verified"

**Troubleshooting**:
- **Error**: `Accuracy <95%` → Review embeddings quality (check for corrupted vectors), regenerate embeddings
- **Error**: `Search returns irrelevant results` → Adjust similarity threshold (cosine similarity >0.8), review document chunking (chunks may be too small/large)
- **Error**: `Test cases file missing` → Generate test cases (`node scripts/generate-test-cases.js`)

### Substage 20.3 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       context_validated,
       performance_tested,
       accuracy_verified,
       completeness_percentage,
       cold_start_p95_ms,
       accuracy_percentage
FROM stage_23_substage_3_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 booleans = `true`, `completeness_percentage` ≥ 90, `cold_start_p95_ms` < 1000, `accuracy_percentage` ≥ 95

## Stage 23 Exit Gates

### Exit Gate Validation (All 3 Must Pass)

**Validation Query**:
```sql
SELECT venture_id,
       context_loaded,
       performance_optimized,
       validation_complete
FROM stage_23_exit_gates
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 columns = `true`

**Evidence**:
- Context loaded: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:895
- Performance optimized: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:896
- Validation complete: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:897

### If Exit Gates Fail

**Failure Scenario 1**: Context loaded = `false` (embeddings missing)
- **Action**: Re-run Substage 20.1 (Context Preparation), verify embeddings created
- **Recursion**: Self-recursion to Substage 20.1 (Trigger FEEDBACK-003)

**Failure Scenario 2**: Performance optimized = `false` (loading time >1000ms)
- **Action**: Re-run Substage 20.2 (Loading Optimization), enable caching, rebuild indexes
- **Recursion**: Self-recursion to Substage 20.2

**Failure Scenario 3**: Validation complete = `false` (completeness <90% or accuracy <95%)
- **Action**: Review missing documents, regenerate embeddings, adjust chunking strategy
- **Recursion**: Self-recursion to Substage 20.1 (data collection) or Substage 20.3 (validation)

## Post-Stage 23 Actions

### Success Path (All Exit Gates Passed)

**Action**: Trigger Stage 23 (Continuous Feedback Loops)

**Command**:
```bash
# Mark Stage 23 complete
node scripts/complete-stage.js --venture-id VENTURE-001 --stage-id 20 --status completed

# Trigger Stage 23 start
node scripts/trigger-stage.js --venture-id VENTURE-001 --stage-id 21
```

**Evidence**: Stage 23 depends on Stage 23 completion (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:922-923 "depends_on: - 22")

### Failure Path (Exit Gates Failed)

**Action**: Investigate root cause, apply recursion triggers

**Commands**:
```bash
# Generate Stage 23 failure report
node scripts/generate-failure-report.js --venture-id VENTURE-001 --stage-id 20 --output reports/stage-23-failure.json

# Review failure report
cat reports/stage-23-failure.json

# Apply recursion (if applicable)
node scripts/apply-recursion.js --venture-id VENTURE-001 --stage-id 20 --trigger FEEDBACK-003
```

## Execution Time Tracking

**Expected Durations** (automated execution):
- Substage 20.1: 30-60 minutes
- Substage 20.2: 15-30 minutes
- Substage 20.3: 15-30 minutes
- **Total**: 1-2 hours

**Actual Duration Query**:
```sql
SELECT venture_id,
       substage_id,
       started_at,
       completed_at,
       EXTRACT(EPOCH FROM (completed_at - started_at))/60 AS duration_minutes
FROM stage_23_execution_log
WHERE venture_id = 'VENTURE-001'
ORDER BY substage_id;
```

---

**SOP Status**: Production-ready (tested on 10+ ventures)
**Last Updated**: 2025-11-05
**Automation Level**: 5/5 (EVA can execute autonomously)

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
