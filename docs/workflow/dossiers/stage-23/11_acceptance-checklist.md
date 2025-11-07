# Stage 23: Acceptance Checklist

## Purpose

This checklist provides objective criteria for validating Stage 23 completion, targeting **≥90/100 points** (production-ready threshold).

**Evidence**: Phase 9 contract requirement - sustain ≥90/100 scores from Phase 5-8 baseline.

## Scoring System

- **Total Points**: 100
- **Pass Threshold**: 85/100 (minimum)
- **Target Score**: 90/100 (production-ready)
- **Excellence**: 95/100 (reference quality)

## 8-Criterion Rubric

### Criterion 1: Evidence Citation Density (15 points)

**Definition**: Percentage of claims supported by EHG_Engineer repository evidence.

**Scoring**:
- 15 points: ≥95% of claims cited (≥50 citations in dossier)
- 12 points: 85-94% of claims cited (40-49 citations)
- 9 points: 75-84% of claims cited (30-39 citations)
- 6 points: 65-74% of claims cited (20-29 citations)
- 0 points: <65% of claims cited (<20 citations)

**Measurement**:
```bash
# Count evidence citations in dossier
grep -r "EHG_Engineer@6ef8cf4" docs/workflow/dossiers/stage-23/ | wc -l
```

**Target**: ≥50 citations across 11 files (avg 4-5 citations per file)

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract requirement "Evidence Format: EHG_Engineer@6ef8cf4:{path}:{lines}"

---

### Criterion 2: Recursion Blueprint Quality (15 points)

**Definition**: Comprehensiveness of recursion triggers and automation logic.

**Scoring**:
- 15 points: ≥3 triggers defined, SQL queries provided, automation logic complete
- 12 points: 2-3 triggers defined, partial automation logic
- 9 points: 1-2 triggers defined, no automation logic
- 6 points: Triggers mentioned but not defined
- 0 points: No recursion analysis

**Requirements**:
1. **Trigger FEEDBACK-001**: Context loading API failures (recursion to Stage 19)
2. **Trigger FEEDBACK-002**: Missing AI framework (recursion to Stage 16)
3. **Trigger FEEDBACK-003**: Incomplete context (self-recursion to Substage 20.1)
4. SQL queries for each trigger (threshold detection)
5. Automation logic (SD-RECURSION-ENGINE-001 integration)

**Validation**:
```bash
# Check recursion blueprint completeness
cat docs/workflow/dossiers/stage-23/07_recursion-blueprint.md | grep -E "Trigger FEEDBACK-[0-9]+" | wc -l
```

**Target**: 3 triggers

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "Recursion: NO recursion in critiques (71 lines) - acknowledge gap, propose triggers"

---

### Criterion 3: SD Cross-Reference Accuracy (10 points)

**Definition**: Correct mapping of gaps to existing/proposed Strategic Directives.

**Scoring**:
- 10 points: All 5 gaps mapped to SDs, SD statuses verified
- 8 points: 4 gaps mapped, SD statuses verified
- 6 points: 3 gaps mapped, SD statuses not verified
- 4 points: 1-2 gaps mapped
- 0 points: No SD cross-references

**Required SD References**:
1. SD-FEEDBACK-OPTIMIZATION-001 (proposed, Gap 1: automation optimization)
2. SD-METRICS-FRAMEWORK-001 (existing, Gap 2: metrics thresholds)
3. SD-TOOL-INTEGRATION-PATTERNS-001 (existing, Gap 3: tool recommendations)
4. SD-ERROR-HANDLING-FRAMEWORK-001 (existing, Gap 4: error handling)
5. SD-ROLLBACK-PROCEDURES-001 (existing, Gap 5: rollback)
6. SD-RECURSION-ENGINE-001 (existing, recursion infrastructure)
7. SD-CREWAI-ARCHITECTURE-001 (existing, agent orchestration)

**Validation**:
```bash
# Count SD references in gaps-backlog file
cat docs/workflow/dossiers/stage-23/10_gaps-backlog.md | grep -E "SD-[A-Z-]+-[0-9]+" | sort -u | wc -l
```

**Target**: ≥7 unique SDs referenced

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "SD Cross-References: Reference existing SDs, propose new SDs"

---

### Criterion 4: Agent Orchestration Specification (10 points)

**Definition**: Completeness of CrewAI crew architecture for Stage 23 automation.

**Scoring**:
- 10 points: ≥3 agents defined (roles, goals, tools), crew workflow specified
- 8 points: 2-3 agents defined, partial workflow
- 6 points: 1-2 agents defined, no workflow
- 4 points: Agent orchestration mentioned but not specified
- 0 points: No agent orchestration

**Required Elements**:
1. **ContextLoaderCrew** specification
2. **Agent 1**: ContextCollector (fetch data from sources)
3. **Agent 2**: EmbeddingsGenerator (create embeddings via OpenAI API)
4. **Agent 3**: VectorIndexer (insert embeddings into Pinecone)
5. **Agent 4**: ContextValidator (verify completeness, performance)
6. Crew workflow (task dependencies, execution order)

**Validation**:
```bash
# Check agent orchestration file
cat docs/workflow/dossiers/stage-23/06_agent-orchestration.md | grep -E "Agent [0-9]+:" | wc -l
```

**Target**: ≥4 agents

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "06_agent-orchestration.md (propose CrewAI crews)"

---

### Criterion 5: Metrics Monitoring Implementation (10 points)

**Definition**: SQL queries and dashboard specifications for KPI tracking.

**Scoring**:
- 10 points: SQL queries for all 3 metrics, dashboard wireframe, alert thresholds
- 8 points: SQL queries for 2-3 metrics, partial dashboard spec
- 6 points: SQL queries for 1-2 metrics, no dashboard
- 4 points: Metrics mentioned but no queries
- 0 points: No metrics monitoring

**Required Elements**:
1. SQL query for Context Completeness (≥90%)
2. SQL query for Loading Performance (<500ms)
3. SQL query for Memory Efficiency (<2GB)
4. Dashboard wireframe (3 panels: Completeness, Performance, Memory)
5. Alert thresholds (context completeness <90%, loading time >1000ms, memory >4GB)

**Validation**:
```bash
# Count SQL queries in metrics monitoring file
cat docs/workflow/dossiers/stage-23/09_metrics-monitoring.md | grep -E "SELECT|FROM|WHERE" | wc -l
```

**Target**: ≥9 SQL lines (3 queries × 3 lines avg)

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "09_metrics-monitoring.md (KPIs with SQL queries and dashboards)"

---

### Criterion 6: Gaps-to-SD Mapping (10 points)

**Definition**: Systematic mapping of 5 critique weaknesses to Strategic Directives.

**Scoring**:
- 10 points: All 5 gaps mapped with SD proposals, effort estimates, implementation roadmap
- 8 points: 4 gaps mapped, effort estimates
- 6 points: 3 gaps mapped, no effort estimates
- 4 points: 1-2 gaps mapped
- 0 points: No gaps mapped

**Required Gaps**:
1. Gap 1: Limited automation for manual processes → SD-FEEDBACK-OPTIMIZATION-001
2. Gap 2: Unclear metrics thresholds → SD-METRICS-FRAMEWORK-001
3. Gap 3: Missing specific tool integrations → SD-TOOL-INTEGRATION-PATTERNS-001
4. Gap 4: No explicit error handling → SD-ERROR-HANDLING-FRAMEWORK-001
5. Gap 5: No rollback procedures → SD-ROLLBACK-PROCEDURES-001

**Validation**:
```bash
# Count gap sections in gaps-backlog file
cat docs/workflow/dossiers/stage-23/10_gaps-backlog.md | grep -E "## Gap [0-9]+:" | wc -l
```

**Target**: 5 gaps

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "10_gaps-backlog.md (map 5 weaknesses → SDs)"

---

### Criterion 7: Professional SOP Usability (15 points)

**Definition**: Step-by-step execution procedures for EXEC/EVA agents.

**Scoring**:
- 15 points: 3 substages documented, prerequisites, commands, validation checks, troubleshooting
- 12 points: 3 substages documented, commands, validation checks
- 9 points: 2-3 substages documented, commands only
- 6 points: 1-2 substages documented
- 0 points: No SOP

**Required Elements**:
1. **Substage 20.1 SOP**: Context Preparation (data collection, structuring, embeddings)
2. **Substage 20.2 SOP**: Loading Optimization (caching, indexing, memory)
3. **Substage 20.3 SOP**: Validation & Testing (completeness, performance, accuracy)
4. Prerequisites (entry gates: data prepared, models trained)
5. Execution commands (bash/Node.js scripts)
6. Validation checks (SQL queries for exit gates)
7. Troubleshooting (common errors: API timeout, OOM)

**Validation**:
```bash
# Check SOP structure
cat docs/workflow/dossiers/stage-23/05_professional-sop.md | grep -E "### Substage 20\.[0-9]+" | wc -l
```

**Target**: 3 substages

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "05_professional-sop.md (Step-by-step execution procedures)"

---

### Criterion 8: Configurability Matrix (15 points)

**Definition**: Tunable parameters and venture-specific customization options.

**Scoring**:
- 15 points: ≥10 parameters documented (defaults, ranges, venture-specific overrides)
- 12 points: 7-9 parameters documented
- 9 points: 4-6 parameters documented
- 6 points: 1-3 parameters documented
- 0 points: No configurability matrix

**Required Parameters**:
1. **Embeddings Provider**: OpenAI (default), Cohere, Anthropic
2. **Embeddings Model**: text-embedding-ada-002 (default), text-embedding-3-small
3. **Vector Database**: Pinecone (default), Weaviate, Chroma
4. **Context Completeness Threshold**: 90% (default), 80-100% (venture-specific)
5. **Loading Performance Threshold**: 500ms (default), 200-1000ms
6. **Memory Efficiency Threshold**: 2GB (default), 1-4GB
7. **Caching Layer**: Redis (default), Memcached
8. **Cache TTL**: 3600s (default), 600-86400s
9. **Vector Index Type**: HNSW (default), IVF
10. **Batch Size**: 100 embeddings/batch (default), 10-1000

**Validation**:
```bash
# Count parameters in configurability matrix
cat docs/workflow/dossiers/stage-23/08_configurability-matrix.md | grep -E "\*\*Parameter [0-9]+\*\*" | wc -l
```

**Target**: ≥10 parameters

**Self-Assessment**: [TO BE CALCULATED POST-GENERATION]

**Evidence**: Phase 9 contract "08_configurability-matrix.md (Tunable parameters and customization)"

---

## Scoring Summary

| Criterion | Points | Self-Assessment | Evidence |
|-----------|--------|-----------------|----------|
| 1. Evidence Citation Density | 15 | [TBD] | Citation count ≥50 |
| 2. Recursion Blueprint Quality | 15 | [TBD] | 3 triggers defined |
| 3. SD Cross-Reference Accuracy | 10 | [TBD] | ≥7 SDs referenced |
| 4. Agent Orchestration Spec | 10 | [TBD] | ≥4 agents defined |
| 5. Metrics Monitoring Implementation | 10 | [TBD] | SQL queries for 3 metrics |
| 6. Gaps-to-SD Mapping | 10 | [TBD] | 5 gaps mapped |
| 7. Professional SOP Usability | 15 | [TBD] | 3 substages documented |
| 8. Configurability Matrix | 15 | [TBD] | ≥10 parameters |
| **TOTAL** | **100** | **[TBD]** | **Target: ≥90** |

## Pass/Fail Decision

**Pass Threshold**: 85/100
**Target Threshold**: 90/100
**Excellence Threshold**: 95/100

**Status**: [TO BE DETERMINED POST-GENERATION]

**Recommendations** (if score <90):
1. If Evidence Citation <15: Add more EHG_Engineer@6ef8cf4 references
2. If Recursion Blueprint <15: Define all 3 triggers with SQL queries
3. If SD Cross-References <10: Verify SD statuses, add more references
4. If Agent Orchestration <10: Specify crew workflow, agent tools
5. If Metrics Monitoring <10: Add SQL queries for all 3 metrics
6. If Gaps Mapping <10: Map all 5 weaknesses to SDs
7. If SOP Usability <15: Add troubleshooting, validation checks
8. If Configurability <15: Document more tunable parameters

## Validation Checklist (Pre-Approval)

**Run these commands before submitting dossier**:

```bash
# 1. Citation count
CITATIONS=$(grep -r "EHG_Engineer@6ef8cf4" docs/workflow/dossiers/stage-23/ | wc -l)
echo "Evidence Citations: $CITATIONS (target: ≥50)"

# 2. Recursion triggers
TRIGGERS=$(cat docs/workflow/dossiers/stage-23/07_recursion-blueprint.md | grep -E "Trigger FEEDBACK-[0-9]+" | wc -l)
echo "Recursion Triggers: $TRIGGERS (target: 3)"

# 3. SD references
SD_REFS=$(cat docs/workflow/dossiers/stage-23/10_gaps-backlog.md | grep -E "SD-[A-Z-]+-[0-9]+" | sort -u | wc -l)
echo "SD Cross-References: $SD_REFS (target: ≥7)"

# 4. Agent count
AGENTS=$(cat docs/workflow/dossiers/stage-23/06_agent-orchestration.md | grep -E "Agent [0-9]+:" | wc -l)
echo "Agents Defined: $AGENTS (target: ≥4)"

# 5. SQL queries
SQL_LINES=$(cat docs/workflow/dossiers/stage-23/09_metrics-monitoring.md | grep -E "SELECT|FROM|WHERE" | wc -l)
echo "SQL Query Lines: $SQL_LINES (target: ≥9)"

# 6. Gaps mapped
GAPS=$(cat docs/workflow/dossiers/stage-23/10_gaps-backlog.md | grep -E "## Gap [0-9]+:" | wc -l)
echo "Gaps Mapped: $GAPS (target: 5)"

# 7. Substages in SOP
SUBSTAGES=$(cat docs/workflow/dossiers/stage-23/05_professional-sop.md | grep -E "### Substage 20\.[0-9]+" | wc -l)
echo "SOP Substages: $SUBSTAGES (target: 3)"

# 8. Configurable parameters
PARAMS=$(cat docs/workflow/dossiers/stage-23/08_configurability-matrix.md | grep -E "\*\*Parameter [0-9]+\*\*" | wc -l)
echo "Configurable Parameters: $PARAMS (target: ≥10)"

echo ""
echo "Total Score Estimate: [CALCULATE MANUALLY]"
```

## Footer Compliance

**Required Footer**: `<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->`

**Validation**:
```bash
# Check all 11 files have correct footer
grep -r "Generated by Claude Code Phase 9" docs/workflow/dossiers/stage-23/ | wc -l
# Expected: 11 (one per file)
```

**Evidence**: Phase 9 contract "Footer: <!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->"

---

**Final Self-Assessment**: [TO BE COMPLETED AFTER ALL 11 FILES GENERATED]

**Approval Status**: [PENDING]

**Next Steps**:
1. Generate all 11 files for Stage 23
2. Run validation checklist
3. Calculate total score
4. If score ≥90: Mark as APPROVED
5. If score <90: Implement recommendations, regenerate

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
