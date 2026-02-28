---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# Post-Completion Integration Gap Detector


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Key Features](#key-features)
  - [1. Automatic Gap Detection (Post-Completion Hook)](#1-automatic-gap-detection-post-completion-hook)
  - [2. Retroactive Analysis (CLI Tool)](#2-retroactive-analysis-cli-tool)
  - [3. Multi-Strategy Git Analysis](#3-multi-strategy-git-analysis)
  - [4. Keyword-Based Requirement Matching](#4-keyword-based-requirement-matching)
  - [5. Root Cause Classification](#5-root-cause-classification)
  - [6. Automatic Corrective SD Creation](#6-automatic-corrective-sd-creation)
- [Architecture](#architecture)
  - [Pipeline Flow](#pipeline-flow)
  - [Module Responsibilities](#module-responsibilities)
  - [Database Schema](#database-schema)
- [Usage Examples](#usage-examples)
  - [1. Single SD Analysis](#1-single-sd-analysis)
  - [2. Batch Analysis](#2-batch-analysis)
  - [3. JSON Output (for automation)](#3-json-output-for-automation)
  - [4. Automatic Post-Completion](#4-automatic-post-completion)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [CLI Options](#cli-options)
  - [Analysis Options (Programmatic)](#analysis-options-programmatic)
- [Coverage Score Calculation](#coverage-score-calculation)
- [Integration Points](#integration-points)
  - [1. Orchestrator Completion Hook](#1-orchestrator-completion-hook)
  - [2. Database Tables](#2-database-tables)
  - [3. Git Analysis](#3-git-analysis)
- [Limitations & Known Issues](#limitations-known-issues)
  - [1. Keyword Matching Only](#1-keyword-matching-only)
  - [2. No Semantic Analysis](#2-no-semantic-analysis)
  - [3. Requires PRD](#3-requires-prd)
  - [4. Merged Branch Detection](#4-merged-branch-detection)
- [Success Metrics](#success-metrics)
- [Troubleshooting](#troubleshooting)
  - [Issue: 0 files analyzed](#issue-0-files-analyzed)
  - [Issue: Null coverage score](#issue-null-coverage-score)
  - [Issue: High false positive rate](#issue-high-false-positive-rate)
- [Future Enhancements](#future-enhancements)
  - [1. Semantic Code Analysis (Phase 2)](#1-semantic-code-analysis-phase-2)
  - [2. Test Coverage Integration (Phase 3)](#2-test-coverage-integration-phase-3)
  - [3. Machine Learning Scoring (Phase 4)](#3-machine-learning-scoring-phase-4)
  - [4. Real-Time Gap Alerts (Phase 5)](#4-real-time-gap-alerts-phase-5)
- [Related Documentation](#related-documentation)
- [Changelog](#changelog)
  - [v1.0.0 (2026-02-11)](#v100-2026-02-11)

## Metadata
- **Category**: Feature
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.6
- **Last Updated**: 2026-02-11
- **Tags**: gap-detection, integration, prd-validation, retroactive-analysis, quality

## Overview

The Post-Completion Integration Gap Detector is a systematic quality assurance feature that runs automatically at SD completion to detect gaps between PRD requirements and actual deliverables. It helps catch integration issues early, creates corrective SDs for gaps found, and enables retroactive analysis of historical SDs.

**Purpose**: Ensure PRD scope matches implementation reality, reducing "we thought we built that" scenarios.

## Key Features

### 1. Automatic Gap Detection (Post-Completion Hook)
- **When**: Runs automatically when orchestrator completes all child SDs
- **Integration**: Hooks into `orchestrator-completion-hook.js`
- **Non-blocking**: Runs with 60-second timeout, logs failures without blocking workflow
- **Output**: Records results in `gap_analysis_results` table

### 2. Retroactive Analysis (CLI Tool)
- **Command**: `npm run gap:analyze --sd <SD-KEY>`
- **Batch Mode**: `npm run gap:analyze:batch --limit 10`
- **JSON Output**: `npm run gap:analyze --sd <SD-KEY> --json`
- **Verbose Mode**: `npm run gap:analyze:verbose`
- **Use Case**: Audit completed SDs to validate gap detection accuracy

### 3. Multi-Strategy Git Analysis
The deliverable analyzer uses multiple fallback strategies to find SD files:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| Branch Diff | `git diff main...branch` | Active branches |
| Commit Grep | `git log --grep="SD-KEY"` | Commits mentioning SD |
| Merge Commit Grep | `git log --merges --grep="SD-KEY"` | Squash-merged PRs |
| Branch Pattern | `git log --grep="feat/SD-*"` | Branch name patterns |
| Date Range | `git log --since --until` | Time-based fallback |

**Smart fallback**: Tries each strategy in order until files are found.

### 4. Keyword-Based Requirement Matching
- **Confidence Scoring**: 0.0-1.0 scale
  - `1.0`: Exact match (requirement keyword in file path)
  - `0.5-0.9`: Partial match (partial keyword match)
  - `0.0`: No match (keyword not found)
- **Gap Types**:
  - `not_implemented`: Confidence = 0.0
  - `partially_implemented`: Confidence < 0.3
  - `under_delivered`: Confidence < 0.7

### 5. Root Cause Classification
Automatically classifies gaps into 5 categories:

| Category | Trigger | Example |
|----------|---------|---------|
| `protocol_bypass` | Handoff bypassed | Direct DB insert |
| `scope_creep` | Changes after EXEC start | Post-approval additions |
| `technical_blocker` | Implementation rejected | Technical infeasibility |
| `dependency_gap` | Dependency never met | Blocked by unfinished work |
| `prd_omission` | Default | Requirement missed in PRD |

### 6. Automatic Corrective SD Creation
- **Threshold**: Critical/high severity gaps with confidence < 0.5
- **Duplicate Check**: Queries `strategic_directives_v2` for existing SDs covering same scope
- **Auto-creation**: Creates draft SDs with `sd_type: 'bugfix'`, `priority: 'critical'|'high'`

## Architecture

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. EXTRACT REQUIREMENTS (prd-requirement-extractor.js)     │
│    Query product_requirements_v2 → functional_requirements  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ANALYZE DELIVERABLES (deliverable-analyzer.js)          │
│    Git analysis → Find changed files → Categorize          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DETECT GAPS (gap-detection-engine.js)                   │
│    Match requirements → files → confidence scoring          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CLASSIFY ROOT CAUSES (root-cause-classifier.js)         │
│    Analyze handoff history → Determine why gap exists      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. CREATE CORRECTIVE SDs (corrective-sd-creator.js)        │
│    Critical/high gaps → Draft SDs                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. STORE RESULTS (index.js)                                │
│    Insert into gap_analysis_results table                  │
└─────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility | Key Function |
|--------|---------------|--------------|
| `prd-requirement-extractor.js` | Extract requirements from PRD | `extractRequirements(sdKey)` |
| `deliverable-analyzer.js` | Find SD files via git | `analyzeDeliverables(sdKey, options)` |
| `gap-detection-engine.js` | Match requirements to files | `detectGaps(requirements, deliverables)` |
| `root-cause-classifier.js` | Classify gap causes | `classifyRootCauses(gaps, sdKey)` |
| `corrective-sd-creator.js` | Auto-create fix SDs | `createCorrectiveSDs(gaps, parentSdKey)` |
| `index.js` | Pipeline orchestrator | `runGapAnalysis(sdKey, options)` |

### Database Schema

**Table**: `gap_analysis_results`

Key columns:
- `sd_key`: FK to `strategic_directives_v2.sd_key`
- `prd_id`: FK to `product_requirements_v2.id` (nullable)
- `analysis_type`: `'completion'`, `'retroactive'`, or `'manual'`
- `total_requirements`, `matched_requirements`: Counts
- `coverage_score`: Percentage (0-100) or NULL (no PRD)
- `gap_findings`: JSONB array of gap objects
- `corrective_sds_created`: TEXT[] array of created SD keys
- `analysis_metadata`: JSONB with timing, git_range, strategy, etc.

**Helper Functions**:
- `get_latest_gap_analysis(p_sd_key TEXT)`: Returns most recent analysis
- `get_gap_analysis_summary(p_analysis_type TEXT)`: Aggregated metrics
- `get_sds_with_critical_gaps()`: Lists SDs needing attention

## Usage Examples

### 1. Single SD Analysis

```bash
# Analyze a completed SD
npm run gap:analyze -- --sd SD-LEO-FEAT-001

# Output:
# ═══════════════════════════════════════════════════════════
#   Gap Analysis Report: SD-LEO-FEAT-001
# ═══════════════════════════════════════════════════════════
#   PRD Status:    approved
#   Requirements:  12
#   Matched:       10
#   Coverage:      83%
#   Gaps Found:    2
#   Duration:      1234ms
#   Files Analyzed: 45
#   Strategy:      commit_grep
#
#   ────────────────────────────────────────────────────────────
#   GAPS:
#   ────────────────────────────────────────────────────────────
#   🟠 [HIGH] FR-003: User authentication with 2FA
#      Type: partially_implemented | Root Cause: scope_creep
#      Confidence: 45%
#      Corrective SD: SD-GAP-FR003-ABC1
```

### 2. Batch Analysis

```bash
# Analyze last 5 completed SDs
npm run gap:analyze:batch -- --limit 5

# Output includes:
# - Individual SD summaries
# - Aggregated coverage metrics
# - Root cause distribution
# - Severity distribution
```

### 3. JSON Output (for automation)

```bash
npm run gap:analyze -- --sd SD-LEO-FEAT-001 --json > results.json

# Result structure:
{
  "sd_key": "SD-LEO-FEAT-001",
  "analysis_type": "retroactive",
  "total_requirements": 12,
  "matched_requirements": 10,
  "coverage_score": 83.33,
  "gap_findings": [
    {
      "requirement_id": "FR-003",
      "requirement": "User authentication with 2FA",
      "gap_type": "partially_implemented",
      "severity": "high",
      "confidence": 0.45,
      "root_cause_category": "scope_creep",
      "evidence": "Only basic auth implemented, 2FA missing",
      "corrective_sd_key": "SD-GAP-FR003-ABC1"
    }
  ],
  "corrective_sds_created": ["SD-GAP-FR003-ABC1"],
  "analysis_metadata": {
    "timing_ms": 1234,
    "files_analyzed": 45,
    "strategy": "commit_grep",
    "git_range": "grep:SD-LEO-FEAT-001"
  }
}
```

### 4. Automatic Post-Completion

No user action needed - runs automatically when orchestrator completes:

```javascript
// In orchestrator-completion-hook.js
if (allChildrenComplete) {
  try {
    const gapResult = await runGapAnalysis(orchestratorSdKey, {
      createCorrectiveSDs: true,
      verbose: false,
      analysisType: 'completion'
    });

    hookDetails.gapAnalysis = {
      coverage: gapResult.coverage_score,
      gapsFound: gapResult.gap_findings.length,
      correctiveSdsCreated: gapResult.corrective_sds_created
    };
  } catch (err) {
    // Non-blocking: logs error, continues
  }
}
```

## Configuration

### Environment Variables
- `SUPABASE_URL`: Required for database access
- `SUPABASE_SERVICE_ROLE_KEY`: Required for DB writes

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--sd <SD-KEY>` | Analyze specific SD | Required (single mode) |
| `--all` | Batch mode (all completed SDs) | false |
| `--limit <N>` | Limit batch size | 10 |
| `--json` | JSON output | false |
| `--verbose` | Detailed output | false |
| `--create-sds` | Auto-create corrective SDs | false |

### Analysis Options (Programmatic)

```javascript
await runGapAnalysis(sdKey, {
  createCorrectiveSDs: true,    // Create fix SDs for critical gaps
  verbose: true,                 // Detailed logging
  analysisType: 'retroactive',   // 'completion', 'retroactive', 'manual'
  branch: 'feat/SD-XXX-001'      // Override branch (optional)
});
```

## Coverage Score Calculation

```
coverage_score = (matched_requirements / total_requirements) * 100

Where:
- matched_requirements = Requirements with confidence >= 0.7
- total_requirements = All functional requirements in PRD
- coverage_score = NULL if no PRD exists
```

**Severity Assignment**:
- **Critical**: CRITICAL priority requirement with confidence < 0.3
- **High**: HIGH priority requirement with confidence < 0.5
- **Medium**: MEDIUM priority requirement with confidence < 0.7
- **Low**: LOW priority requirement or confidence >= 0.7

## Integration Points

### 1. Orchestrator Completion Hook
**File**: `scripts/modules/handoff/orchestrator-completion-hook.js`

Integration runs after all children complete:
- Non-blocking (try/catch wrapper)
- 60-second timeout
- Logs results to `hookDetails.gapAnalysis`
- Creates corrective SDs if enabled

### 2. Database Tables
**Primary**: `gap_analysis_results` (stores all analysis results)
**References**:
- `strategic_directives_v2.sd_key` (SD being analyzed)
- `product_requirements_v2.id` (PRD reference)

### 3. Git Analysis
**Commands used**:
- `git diff main...branch` (branch diff)
- `git log main --grep="SD-KEY"` (commit grep)
- `git log main --merges --grep="SD-KEY"` (merge commits)
- `git log main --since --until` (date range)

## Limitations & Known Issues

### 1. Keyword Matching Only
**Limitation**: Gap detection relies on keyword matching between requirement text and file paths.

**Impact**: May miss gaps where:
- Implementation file names don't contain requirement keywords
- Requirement keywords are too generic ("user", "data", "system")
- Implementation exists but is poorly named

**Mitigation**: Use descriptive file names that match PRD terminology.

### 2. No Semantic Analysis
**Limitation**: Doesn't analyze code content, only file paths.

**Impact**: Cannot detect:
- Incorrect implementations (file exists but logic is wrong)
- Incomplete implementations (file exists but missing features)
- Performance issues (works but too slow)

**Mitigation**: UAT testing catches these issues.

### 3. Requires PRD
**Limitation**: SDs without PRDs get `coverage_score = NULL`.

**Impact**: Cannot analyze gap coverage for:
- Quick fixes (no PRD required)
- Documentation SDs
- Refactors without formal requirements

**Mitigation**: This is by design - gap detection only applies where formal requirements exist.

### 4. Merged Branch Detection
**Limitation**: Branch-based analysis fails if branch was deleted after merge.

**Impact**: Must fall back to commit grep or date-range analysis.

**Mitigation**: Multi-strategy fallback ensures files are still found.

## Success Metrics

**Target KPIs** (after 6 months):
- **Coverage**: 90% of feature SDs achieve ≥85% coverage score
- **False Positive Rate**: <10% of detected gaps are actually implemented
- **Corrective SD Rate**: ≥70% of critical gaps result in corrective SDs being created
- **Retroactive Value**: ≥20 historical SDs audited, ≥5 real gaps discovered

## Troubleshooting

### Issue: 0 files analyzed

**Symptom**: `files_analyzed: 0` in output

**Causes**:
1. Branch was deleted after merge
2. SD key not in commit messages
3. Date range doesn't cover SD work

**Solution**: Check git history manually:
```bash
git log --oneline --all --grep="SD-KEY"
```

### Issue: Null coverage score

**Symptom**: `coverage_score: null`

**Causes**:
1. No PRD exists for this SD
2. PRD exists but has no functional requirements

**Solution**: This is expected for SDs without formal requirements (quick fixes, docs, etc.).

### Issue: High false positive rate

**Symptom**: Many gaps detected that are actually implemented

**Causes**:
1. File names don't match requirement keywords
2. Generic requirement language ("user can...")

**Solution**:
- Use descriptive file names matching PRD terminology
- Refine requirement keywords in PRD

## Future Enhancements

### 1. Semantic Code Analysis (Phase 2)
- Parse actual code AST
- Detect implemented functions/classes
- Match against requirement verbs ("create", "delete", "update")

### 2. Test Coverage Integration (Phase 3)
- Cross-reference with test files
- Ensure requirements have test coverage
- Flag requirements with no tests

### 3. Machine Learning Scoring (Phase 4)
- Train model on historical gap analysis results
- Improve confidence scoring accuracy
- Predict gap likelihood before implementation

### 4. Real-Time Gap Alerts (Phase 5)
- Monitor implementation progress during EXEC
- Alert when requirements are unaddressed for >7 days
- Suggest corrective actions mid-implementation

## Related Documentation

- **[LEO Protocol](../../CLAUDE.md)** - Context for SD workflow
- **[Database Schema](../../database/migrations/20260211_gap_analysis_results.sql)** - Table structure
- **[Orchestrator Hooks](../reference/orchestrator-completion-hooks.md)** - Post-completion integration
- **[PRD Creation](../guides/prd-creation.md)** - How to write analyzable requirements

## Changelog

### v1.0.0 (2026-02-11)
- Initial release
- Multi-strategy git analysis
- Keyword-based requirement matching
- Root cause classification
- Automatic corrective SD creation
- Orchestrator completion hook integration
- CLI tool with batch/JSON modes
- Database schema with helper functions

---

**SD**: SD-LEO-FEAT-INTEGRATION-GAP-DETECTOR-001
**Status**: Completed
**Created**: 2026-02-11
**Author**: Claude Opus 4.6
