# Stage 24: Canonical Definition

## Source Reference

**Source File**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1057-1102
**Commit**: 6ef8cf4
**Last Modified**: 2025-11-05

## Full YAML Specification

```yaml
- id: 20
  title: MVP Engine: Automated Feedback Iteration
  description: Load and optimize all context for AI agents and system components.
  depends_on:
    - 19
  inputs:
    - System context
    - Historical data
    - Knowledge base
  outputs:
    - Context models
    - Embeddings
    - Knowledge graphs
  metrics:
    - Iteration velocity
    - Improvement rate
    - User satisfaction
  gates:
    entry:
      - Data prepared
      - Models trained
    exit:
      - Context loaded
      - Performance optimized
      - Validation complete
  substages:
    - id: '20.1'
      title: Context Preparation
      done_when:
        - Data collected
        - Context structured
        - Embeddings created
    - id: '20.2'
      title: Loading Optimization
      done_when:
        - Caching configured
        - Indexes created
        - Memory optimized
    - id: '20.3'
      title: Validation & Testing
      done_when:
        - Context validated
        - Performance tested
        - Accuracy verified
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

## Field-by-Field Analysis

### Basic Identification

**ID**: 20
**Type**: Integer (stage identifier in sequential workflow)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:873 "- id: 20"

**Title**: "MVP Engine: Automated Feedback Iteration"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:874 "title: MVP Engine: Automated Feedback Iteration"
**Interpretation**: "Enhanced" indicates advanced context loading beyond basic data fetching (includes embeddings, knowledge graphs, optimization)

**Description**: "Load and optimize all context for AI agents and system components."
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:875 "description: Load and optimize all context"
**Key Terms**:
- "Load": Fetch data from sources (databases, APIs, files)
- "Optimize": Apply caching, indexing, compression
- "All context": Comprehensive (system context + historical data + knowledge base)
- "AI agents": Target audience (agents need context for decision-making)

### Dependencies

**Depends On**: Stage 19 (Tri-Party Integration Verification)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:876-877 "depends_on: - 19"
**Rationale**: Context loading requires working API integrations (embeddings API, data APIs) verified in Stage 19

### Inputs (3 categories)

#### Input 1: System Context
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:879 "- System context"
**Definition**: Configuration, architecture docs, system state (e.g., database schemas, API endpoints, environment variables)
**Source**: Stage 18 (Documentation and GitHub Synchronization)
**Format**: Markdown files, JSON configs, YAML schemas

#### Input 2: Historical Data
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:880 "- Historical data"
**Definition**: Past user interactions, transaction logs, event streams (e.g., chat history, order history, analytics)
**Source**: Venture database (production or staging)
**Format**: SQL query results, CSV exports, JSON event logs
**Volume**: 10k-10M records (varies by venture maturity)

#### Input 3: Knowledge Base
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:881 "- Knowledge base"
**Definition**: Domain knowledge, FAQs, documentation, training data (e.g., product manuals, support tickets, help docs)
**Source**: Confluence, Notion, Google Docs, or database tables
**Format**: Markdown, HTML, plain text
**Volume**: 100-10k documents (varies by venture complexity)

### Outputs (3 artifacts)

#### Output 1: Context Models
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:883 "- Context models"
**Definition**: Structured representations of context (e.g., agent memory, conversation state, user profiles)
**Storage**: Database tables (context_models, agent_memory), Redis cache
**Format**: JSON objects, relational tables
**Usage**: AI agents query context models for decision-making

#### Output 2: Embeddings
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:884 "- Embeddings"
**Definition**: Vector representations of text (embeddings from OpenAI, Cohere, Anthropic)
**Storage**: Vector database (Pinecone, Weaviate, Chroma)
**Format**: Float arrays (1536-dimensional for OpenAI, 768-dimensional for Cohere)
**Volume**: 10k-1M vectors (matches knowledge base document count)
**Usage**: Semantic search (find similar documents, answer questions)

#### Output 3: Knowledge Graphs
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:885 "- Knowledge graphs"
**Definition**: Graph-based relationships between entities (e.g., User → Order → Product)
**Storage**: Graph database (Neo4j, Amazon Neptune) or relational adjacency lists
**Format**: Nodes (entities) + Edges (relationships)
**Usage**: AI agents traverse graph for complex reasoning (e.g., "Find all orders by users who bought X")

### Metrics (3 KPIs)

#### Metric 1: Context Completeness
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:887 "- Iteration velocity"
**Definition**: Percentage of expected context data successfully loaded
**Calculation**: (Loaded documents / Expected documents) × 100%
**Target**: ≥90% (proposed in 09_metrics-monitoring.md)
**Measurement**: Post-Substage 20.1 (Context Preparation)

#### Metric 2: Loading Performance
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:888 "- Improvement rate"
**Definition**: Time to load context from cold start (no cache)
**Calculation**: Elapsed time from Stage 24 start to context available
**Target**: <500ms (proposed in 09_metrics-monitoring.md)
**Measurement**: Post-Substage 20.2 (Loading Optimization)

#### Metric 3: Memory Efficiency
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:889 "- User satisfaction"
**Definition**: RAM usage for loaded context (in-memory embeddings, cache)
**Calculation**: Memory profiler (process.memoryUsage() in Node.js, tracemalloc in Python)
**Target**: <2GB RAM (proposed in 09_metrics-monitoring.md)
**Measurement**: Post-Substage 20.2 (Loading Optimization)

### Entry Gates (2 conditions)

#### Gate 1: Data Prepared
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:892 "- Data prepared"
**Definition**: All input data sources accessible (APIs working, database queries succeed)
**Validation**: Test data fetch from each source (system context, historical data, knowledge base)
**Blocker If False**: Cannot start Stage 24 (no data to load)

#### Gate 2: Models Trained
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:893 "- Models trained"
**Definition**: Embeddings models available (OpenAI API key valid, model accessible)
**Validation**: Test embeddings API call (create embedding for "test")
**Blocker If False**: Cannot create embeddings (Substage 20.1 will fail)

### Exit Gates (3 conditions)

#### Gate 1: Context Loaded
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:895 "- Context loaded"
**Definition**: All 3 outputs created (context models, embeddings, knowledge graphs)
**Validation**: Check output existence (query vector database, verify context models table)
**Blocker If False**: Stage 24 cannot validate readiness (incomplete context)

#### Gate 2: Performance Optimized
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:896 "- Performance optimized"
**Definition**: Improvement rate meets <500ms target
**Validation**: Benchmark context loading (cold start test)
**Blocker If False**: Context loading too slow (degrades AI agent responsiveness)

#### Gate 3: Validation Complete
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:897 "- Validation complete"
**Definition**: Iteration velocity ≥90%, accuracy verified (spot-check embeddings)
**Validation**: Run validation query (check context_completeness metric)
**Blocker If False**: Incomplete context (AI agents will lack critical information)

### Substages (3 sequential phases)

#### Substage 20.1: Context Preparation

**Title**: "Context Preparation"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:899-903 "id: '20.1', title: Context Preparation"

**Done When**:
1. **Data collected**: All inputs fetched (system context, historical data, knowledge base)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:902 "- Data collected"
2. **Context structured**: Data transformed into structured format (JSON, relational tables)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:903 "- Context structured"
3. **Embeddings created**: All documents embedded (OpenAI API calls complete)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:904 "- Embeddings created"

**Expected Duration**: 30-60 minutes (depends on document count, API rate limits)

#### Substage 20.2: Loading Optimization

**Title**: "Loading Optimization"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:905-910 "id: '20.2', title: Loading Optimization"

**Done When**:
1. **Caching configured**: Redis cache setup for context models (LRU eviction)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:908 "- Caching configured"
2. **Indexes created**: Vector database indexes built (HNSW algorithm for Pinecone)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:909 "- Indexes created"
3. **Memory optimized**: Context loading memory footprint <2GB RAM
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:910 "- Memory optimized"

**Expected Duration**: 15-30 minutes (index creation, cache warmup)

#### Substage 20.3: Validation & Testing

**Title**: "Validation & Testing"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:911-916 "id: '20.3', title: Validation & Testing"

**Done When**:
1. **Context validated**: Completeness ≥90%, all expected documents present
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:914 "- Context validated"
2. **Performance tested**: Loading time <500ms (benchmark)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:915 "- Performance tested"
3. **Accuracy verified**: Spot-check embeddings (semantic search returns correct results)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:916 "- Accuracy verified"

**Expected Duration**: 15-30 minutes (run validation suite)

### Notes

**Progression Mode**: "Manual → Assisted → Auto (suggested)"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:917-918 "progression_mode: Manual → Assisted → Auto (suggested)"

**Interpretation**:
- **Manual**: EXEC runs Stage 24 step-by-step (6-12 hours, current state for new ventures)
- **Assisted**: Semi-automated (EXEC triggers Stage 24, automation handles substages, 2-4 hours)
- **Auto**: Fully automated (EVA triggers Stage 24 on Stage 19 completion, 1-2 hours, target state)

**Current Automation Level**: 5/5 (per critique, EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-24.md:11 "Automation Leverage | 5 | Fully automatable")

## Interpretation Notes

### Owner Assignment (Not Specified in YAML)

**Owner**: EXEC (inferred from critique)
**Evidence**: Stages 1-19 pattern (EXEC owns implementation stages, EVA owns fully automated stages)
**Counter-Evidence**: Automation Leverage 5/5 suggests EVA ownership (like Stage 16)
**Resolution**: Stage 24 likely EVA-owned (fully automated, no human judgment required)

### Risk Level (Not Specified in YAML)

**Risk Level**: 2/5 (moderate, from critique)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-24.md:10 "Risk Exposure | 2 | Moderate risk level"
**Rationale**: Context loading failures impact AI agents but don't block development (can use degraded mode)

### Critical Path Status (Disputed)

**Critique Assessment**: "Critical Path: No" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-24.md:60)
**Dossier Assessment**: "Critical Path: YES" (per 02_stage-map.md analysis)
**Rationale for Override**: Stage 24 blocks Stage 24 (pre-flight check), which blocks Stage 22 (dev loop), making it critical

## Ambiguities and Open Questions

### Ambiguity 1: Metrics Thresholds
**Issue**: YAML defines metrics but not thresholds
**Example**: "Iteration velocity" metric exists, but is 90% the target? 95%? 100%?
**Resolution**: Proposed thresholds in 09_metrics-monitoring.md (context completeness ≥90%, loading performance <500ms, memory efficiency <2GB)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-24.md:38 "Missing: Threshold values"

### Ambiguity 2: Embeddings Provider
**Issue**: YAML mentions "Embeddings" output but not provider
**Example**: OpenAI? Cohere? Anthropic? Custom model?
**Resolution**: Venture-specific (configured in 08_configurability-matrix.md)
**Default**: OpenAI text-embedding-ada-002 (1536-dimensional, $0.0001/1k tokens)

### Ambiguity 3: Knowledge Graph Technology
**Issue**: YAML mentions "Knowledge graphs" but not implementation
**Example**: Neo4j? Amazon Neptune? Relational adjacency lists?
**Resolution**: Venture-specific (depends on scale, budget)
**Default**: Relational adjacency lists (low cost, sufficient for <10k entities)

### Ambiguity 4: Rollback Mechanism
**Issue**: No rollback procedure if context loading corrupts data
**Example**: If Substage 20.1 creates broken embeddings, how to revert?
**Resolution**: Proposed in 10_gaps-backlog.md (Gap 5: No Rollback Procedures)
**Implementation**: Context version snapshots (store embeddings with version tags)

## Changelog (If YAML Updated)

**Current Version**: v1.0 (as of commit 6ef8cf4)
**No changes since initial definition**

**Proposed Changes** (for future updates):
1. Add `owner: EVA` field (clarify automation ownership)
2. Add `thresholds` field under metrics (context_completeness: >=90, loading_performance: <500ms, memory_efficiency: <2GB)
3. Add `rollback` field under gates (define context snapshot strategy)
4. Add `tools` field (recommend embeddings provider, vector database, caching layer)

---

**Canonical Status**: This YAML is the single source of truth for Stage 24 definition. All dossier files derive from this specification.

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
