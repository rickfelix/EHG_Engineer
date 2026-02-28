---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Research Summary: EVA Intent-vs-Reality Analysis Model


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, schema, leo, sd

**SD Reference**: SD-RESEARCH-107 (EVA Intent-vs-Reality Analysis Model)
**Document**: EVA Intent-vs-Reality Analysis Model.pdf
**Pages**: 16
**Relevance**: Primary
**Reviewed**: 2025-11-29

## Executive Summary

Defines EVA's capability to compare planned intent (from governance/SD data) against actual reality (runtime progress, metrics) to detect drift, assess risk, and recommend interventions.

## Key Findings

### Core Database View: `v_intent_vs_reality`

```sql
CREATE VIEW v_intent_vs_reality AS
SELECT
  v.venture_id,
  g.planned_timeline,
  g.strategic_objectives,
  r.actual_progress,
  r.current_stage,
  r.blockers,
  -- Drift calculations
  (r.actual_end_date - g.planned_end_date) AS timeline_drift_days,
  -- Alignment scoring
  calculate_alignment_score(g.objectives, r.outcomes) AS alignment_score
FROM governance_schema.ventures g
JOIN runtime_schema.venture_progress r ON g.venture_id = r.venture_id
JOIN portfolio_schema.ventures v ON g.venture_id = v.id;
```

### Stage Alignment Heuristics (5 Checks)

1. **Timeline Alignment**: Actual vs planned dates within tolerance
2. **Deliverable Completion**: Required artifacts present and approved
3. **Quality Metrics**: KPIs meeting defined thresholds
4. **Dependency Resolution**: Blockers cleared before progression
5. **Stakeholder Sign-off**: Required approvals captured

### Drift Detection Algorithms

**Hybrid Approach**:
1. **Rule-Based Triggers**: Hard boundaries (e.g., >30 days late = critical)
2. **Statistical Anomaly Detection**: Z-score for metrics deviation

```typescript
interface DriftAnalysis {
  timeline_drift: 'on_track' | 'minor_delay' | 'major_delay' | 'critical';
  scope_drift: number; // 0-100 scale
  quality_drift: number;
  overall_risk_score: number;
  recommended_action: 'proceed' | 'review' | 'escalate' | 'halt';
}
```

### Risk Scoring Framework

Formula: `Risk Score = Likelihood × Impact` (0-100 scale)

| Score Range | RAG Status | Action |
|-------------|------------|--------|
| 0-25 | Green | Proceed |
| 26-50 | Amber | Monitor closely |
| 51-75 | Red | Intervention required |
| 76-100 | Critical | Escalate immediately |

### Confidence Thresholds by Autonomy Level

| EVA Level | Minimum Confidence for Auto-Action |
|-----------|-----------------------------------|
| L0 (Advisor) | N/A - advisory only |
| L1 (Human-Approved) | 0.7 to recommend |
| L2 (Autonomous+Notify) | 0.85 to auto-proceed |
| L3 (Guarded) | 0.9 to auto-proceed |
| L4 (Full Autonomy) | 0.95 to auto-proceed |

## Impact on SD-RESEARCH-107

This document **fully specifies** the intent-vs-reality analysis model:

| Requirement | Status | Reference |
|-------------|--------|-----------|
| Detection mechanism | Complete | v_intent_vs_reality view |
| Drift algorithms | Complete | Hybrid rule+statistical |
| Risk quantification | Complete | 0-100 scoring framework |
| EVA integration | Complete | Confidence thresholds |
| Stage alignment | Complete | 5 heuristics defined |

## PRD Generation Notes

- Implement `v_intent_vs_reality` view as foundation
- Build drift detection service with configurable thresholds
- Create risk dashboard with RAG visualization
- Integrate with LEO v5.x stage gates
- Define alert/notification pathways for drift events

## Cross-References

- **Document 7** (EVA Autonomy L0-L4): Confidence thresholds per level
- **Document 8** (LEO v5.x): EVA triggers in stage transition model
