---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Central Planner Reference


## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Usage](#usage)
  - [CLI](#cli)
  - [Programmatic](#programmatic)
- [Source Integration](#source-integration)
- [Scoring Model](#scoring-model)
  - [Weights (v1.0.0)](#weights-v100)
  - [Urgency Bands](#urgency-bands)
- [Deduplication](#deduplication)
- [Stability Checks](#stability-checks)
- [Output Schema](#output-schema)
- [Integration with /leo assist](#integration-with-leo-assist)
- [Success Metrics](#success-metrics)
- [Database Tables](#database-tables)
  - [leo_planner_rankings](#leo_planner_rankings)
  - [leo_sub_agents (Registration)](#leo_sub_agents-registration)
- [Trigger Keywords](#trigger-keywords)
- [Related Files](#related-files)
- [Troubleshooting](#troubleshooting)
  - ["No proposals found"](#no-proposals-found)
  - [Low stability score](#low-stability-score)
  - [Deduplication not working](#deduplication-not-working)

**SD**: SD-LEO-SELF-IMPROVE-001H (Phase 3b: Central Planner Orchestration)

## Overview

The Central Planner is the coordination layer that aggregates proposals from multiple sources, clusters by theme, deduplicates similar items, and ranks with stability checks. It produces deterministic queue orderings with reasoning.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CENTRAL PLANNER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Feedback   │  │   Issue     │  │ Retrospective│  │  Protocol   │     │
│  │   Items     │  │  Patterns   │  │  Learnings   │  │Improvements │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘     │
│         │                │                │                 │            │
│         └────────────────┴────────┬───────┴─────────────────┘            │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │   AGGREGATION   │                             │
│                          │   (Normalize)   │                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │   CLUSTERING    │                             │
│                          │  (By Theme)     │                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │  DEDUPLICATION  │                             │
│                          │  (Similarity)   │                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │     SCORING     │                             │
│                          │ (Multi-factor)  │                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │    RANKING      │                             │
│                          │(Stability Check)│                             │
│                          └────────┬────────┘                             │
│                                   │                                      │
│                          ┌────────▼────────┐                             │
│                          │  JSON OUTPUT    │                             │
│                          │   (Schema)      │                             │
│                          └─────────────────┘                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Usage

### CLI

```bash
# Run planning cycle
node lib/planner/central-planner.js

# Dry run (no persistence)
node lib/planner/central-planner.js --dry-run

# JSON output only
node lib/planner/central-planner.js --json

# Include completed items
node lib/planner/central-planner.js --include-completed
```

### Programmatic

```javascript
import { CentralPlanner } from './lib/planner/central-planner.js';

const planner = new CentralPlanner({
  correlationId: 'my-planning-run'
});

const output = await planner.plan({
  dryRun: false,
  includeCompleted: false
});

console.log(output.queue);       // Ranked proposals
console.log(output.clusters);    // Theme clusters
console.log(output.stability);   // Stability metrics
```

## Source Integration

The Central Planner aggregates from:

| Source | Table | Status Filter |
|--------|-------|---------------|
| Feedback | `feedback` | new, triaged, in_progress |
| Issue Patterns | `issue_patterns` | draft, active |
| Retrospective Learnings | `retrospectives` | All (extracts key_learnings) |
| Protocol Improvements | `protocol_improvement_queue` | PENDING |
| Quick Fix Clusters | `quick_fixes` | open, in_progress |

## Scoring Model

### Weights (v1.0.0)

| Factor | Weight | Description |
|--------|--------|-------------|
| Severity | 30% | Critical=100, High=75, Medium=50, Low=25 |
| Impact | 25% | Based on occurrence count (min 1, max 100) |
| Recurrence | 20% | Based on occurrence count × 25 |
| Recency | 15% | 100 - (days_since_created × 3) |
| Effort (inverse) | 10% | Quick fixes score higher |

### Urgency Bands

| Band | Score Range | Meaning |
|------|-------------|---------|
| P0 | 85-100 | Critical, immediate action |
| P1 | 65-84 | High priority, this sprint |
| P2 | 40-64 | Medium priority, schedule |
| P3 | 0-39 | Low priority, backlog |

## Deduplication

Duplicates are detected via:

1. **Title Similarity** (>80% Jaccard similarity)
2. **Error Hash Match** (exact match)

When duplicates are found:
- The proposal with higher occurrence_count becomes canonical
- Merged items' source_ids are combined
- occurrence_count is summed

## Stability Checks

The planner tracks ranking stability across runs:

| Metric | Target | Description |
|--------|--------|-------------|
| Consistency Score | ≥85% | Percentage of items in same position |
| Top 5 Unchanged | true | Whether top 5 positions are stable |
| Churn Rate | <15% | Percentage of items that moved |

Stability data is stored in `leo_planner_rankings` table for comparison.

## Output Schema

Output conforms to `docs/schemas/prioritization_planner_output.schema.json`.

Key fields:
- `version`: Schema version (1.0.0)
- `queue`: Array of ranked proposals
- `clusters`: Theme clusters
- `deduplication`: Summary of merges
- `stability`: Ranking consistency metrics
- `metadata`: Processing time, source counts

## Integration with /leo assist

The AssistEngine automatically uses the Central Planner:

```javascript
const engine = new AssistEngine({
  usePlanner: true  // Default
});

await engine.initialize();  // Runs Central Planner

// Prioritization now uses planner output
const prioritized = engine.prioritizeIssues(issues);
```

To disable:
```javascript
const engine = new AssistEngine({
  usePlanner: false
});
```

## Success Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Ranking Consistency | ≥85% | Same items in same positions across runs |
| Deduplication Reduction | ≥30% | Percentage of proposals merged |
| Human Alignment Rate | ≥70% | How often humans agree with ranking |

## Database Tables

### leo_planner_rankings

Stores planning outputs for stability tracking:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| correlation_id | TEXT | Unique planning run ID |
| queue | JSONB | Ranked proposals array |
| metadata | JSONB | Processing metadata |
| stability | JSONB | Stability metrics |
| created_at | TIMESTAMPTZ | When created |

Retention: 30 days (cleanup via `cleanup_old_planner_rankings()`)

### leo_sub_agents (Registration)

The PRIORITIZATION_PLANNER sub-agent is registered with:
- `code`: PRIORITIZATION_PLANNER
- `script_path`: lib/planner/central-planner.js
- `activation_type`: manual
- `trigger_keywords`: prioritization, ranking, cluster proposals, deduplicate feedback, etc.

## Trigger Keywords

The planner sub-agent is triggered by:
- prioritization
- ranking
- cluster proposals
- deduplicate feedback
- planning cycle
- queue ordering
- proposal ranking
- theme clustering
- stability check
- human alignment

## Related Files

- `lib/planner/central-planner.js` - Main implementation
- `docs/schemas/prioritization_planner_output.schema.json` - Output schema
- `lib/quality/assist-engine.js` - /leo assist integration
- `database/migrations/20260201_leo_planner_rankings.sql` - Database migration

## Troubleshooting

### "No proposals found"
- Check that source tables have data with correct status values
- Run with `--include-completed` to see all items

### Low stability score
- Normal for first few runs (no previous ranking to compare)
- High churn may indicate volatile scoring weights
- Check if many new items are being added

### Deduplication not working
- Similarity threshold may be too high (default 80%)
- Items may have different error_hash values
- Check title normalization is working
