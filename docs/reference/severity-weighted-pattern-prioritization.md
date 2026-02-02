# Severity-Weighted Pattern Prioritization

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5
- **Last Updated**: 2026-02-02
- **Tags**: learning, patterns, severity, prioritization, infrastructure

## Overview

The Severity-Weighted Pattern Prioritization system ensures critical and high-severity issues surface in the `/learn` process even with a single occurrence, bypassing the traditional 3+ occurrence threshold.

**Problem Solved**: Previously, a critical security vulnerability or production-breaking issue that occurred only once would be filtered out as "not yet a pattern." This meant serious issues could go unaddressed simply because they hadn't recurred.

**Solution**: Composite scoring formula that weighs severity significantly higher than frequency, ensuring serious issues are immediately actionable.

---

## Table of Contents

1. [Composite Scoring Formula](#composite-scoring-formula)
2. [Severity Weights](#severity-weights)
3. [Occurrence Thresholds](#occurrence-thresholds)
4. [Database Schema](#database-schema)
5. [Implementation Details](#implementation-details)
6. [Examples](#examples)
7. [Related Documentation](#related-documentation)

---

## Composite Scoring Formula

The composite score determines pattern ranking in `/learn` output:

```
composite_score = (severity_weight * 20) + (occurrence_count * 5) + actionability_bonus
```

### Components

| Component | Weight | Range | Purpose |
|-----------|--------|-------|---------|
| `severity_weight` | 20x | 20-200 | Ensures critical issues rank highest |
| `occurrence_count` | 5x | 5-∞ | Rewards patterns (3+ occurrences) |
| `actionability_bonus` | +15 | 0 or 15 | Prioritizes patterns with proven solutions |

### Weight Rationale

- **Severity at 20x**: A critical issue (weight=10) gets 200 points from severity alone, outranking even a low-severity issue seen 30+ times (150 points max from frequency)
- **Occurrence at 5x**: Still rewards true patterns (3+ occurrences = 15 points), but doesn't dominate score
- **Actionability bonus**: Fixed +15 points if `proven_solutions` array has entries

---

## Severity Weights

### Mapping Table

| Severity Level | Weight | Meaning |
|----------------|--------|---------|
| `critical` | 10 | System-breaking, security vulnerabilities, data loss |
| `high` | 5 | Major functionality broken, significant user impact |
| `medium` | 2 | Moderate issues, workarounds available |
| `low` | 1 | Minor issues, polish, nice-to-have improvements |
| `unknown` | 1 | Default for patterns without severity classification |

### Assignment Guidelines

**Critical (10)**:
- Security vulnerabilities (SQL injection, XSS, auth bypass)
- Data corruption or loss
- System crashes or unavailability
- Breaking production deployments

**High (5)**:
- Major feature failures
- Performance degradation (>50% slower)
- Blocking user workflows
- Database schema conflicts

**Medium (2)**:
- Non-blocking bugs with workarounds
- Moderate performance issues
- UI inconsistencies
- Test failures (non-critical)

**Low (1)**:
- Cosmetic issues
- Documentation gaps
- Code quality improvements
- Minor optimizations

---

## Occurrence Thresholds

Severity-aware thresholds determine when a pattern "qualifies" for `/learn` surfacing:

| Severity | Min Occurrences | Rationale |
|----------|----------------|-----------|
| `critical` | **1** | Surface immediately - even single critical issue must be addressed |
| `high` | **1** | Surface with 1-2 occurrences - high-severity issues need quick attention |
| `medium` | **3** | Require pattern confirmation - wait for 3+ occurrences |
| `low` | **3** | Require pattern confirmation - avoid noise from one-off low-severity items |
| `unknown` | **3** | Default behavior - unclassified patterns need confirmation |

### Bypass Logic

The `meets_threshold` flag in `v_patterns_with_decay` view encodes this logic:

```sql
CASE
  WHEN LOWER(COALESCE(p.severity, 'unknown')) IN ('critical', 'high') THEN true
  WHEN COALESCE(p.occurrence_count, 1) >= 3 THEN true
  ELSE false
END AS meets_threshold
```

**Result**: Critical and high severity patterns ALWAYS meet threshold, regardless of occurrence count.

---

## Database Schema

### View: `v_patterns_with_decay`

Enhanced view providing severity-weighted scoring:

```sql
CREATE OR REPLACE VIEW v_patterns_with_decay AS
SELECT
    p.*,
    EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) AS days_since_update,

    -- Severity weight calculation
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 10
        WHEN 'high' THEN 5
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 1
    END AS severity_weight,

    -- Composite score
    (
        CASE LOWER(COALESCE(p.severity, 'unknown'))
            WHEN 'critical' THEN 10
            WHEN 'high' THEN 5
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
        END * 20
        + (COALESCE(p.occurrence_count, 1) * 5)
        + CASE WHEN p.proven_solutions IS NOT NULL AND jsonb_array_length(p.proven_solutions) > 0 THEN 15 ELSE 0 END
    ) AS composite_score,

    -- Minimum occurrence threshold (severity-aware)
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 1
        ELSE 3
    END AS min_occurrence_threshold,

    -- Does this pattern meet its threshold?
    CASE
        WHEN LOWER(COALESCE(p.severity, 'unknown')) IN ('critical', 'high') THEN true
        WHEN COALESCE(p.occurrence_count, 1) >= 3 THEN true
        ELSE false
    END AS meets_threshold

FROM issue_patterns p
WHERE p.status = 'active';
```

### New Columns

| Column | Type | Purpose |
|--------|------|---------|
| `severity_weight` | INTEGER | Numeric weight (1-10) derived from severity string |
| `composite_score` | INTEGER | Final ranking score (severity*20 + occurrence*5 + bonus) |
| `min_occurrence_threshold` | INTEGER | Required occurrences for this severity level |
| `meets_threshold` | BOOLEAN | Does this pattern qualify for surfacing? |

### Query Usage

```javascript
// Query patterns sorted by composite score
const { data } = await supabase
  .from('v_patterns_with_decay')
  .select('pattern_id, severity, occurrence_count, composite_score, meets_threshold')
  .eq('meets_threshold', true)
  .order('composite_score', { ascending: false })
  .limit(10);
```

---

## Implementation Details

### Context Builder Changes

**File**: `scripts/modules/learning/context-builder.js`

**Key Changes**:

1. **Added FILTER_CONFIG severity mappings**:
```javascript
const FILTER_CONFIG = {
  MIN_OCCURRENCE_BY_SEVERITY: {
    critical: 1,
    high: 1,
    medium: 3,
    low: 3,
    unknown: 3,
  },
  SEVERITY_WEIGHTS: {
    critical: 10,
    high: 5,
    medium: 2,
    low: 1,
    unknown: 1,
  },
};
```

2. **Updated query to use composite_score**:
```javascript
// Old: Order by decay_adjusted_confidence
.order('decay_adjusted_confidence', { ascending: false })

// New: Order by composite_score
.order('composite_score', { ascending: false })
```

3. **Fallback scoring for base table**:
```javascript
const severityWeight = FILTER_CONFIG.SEVERITY_WEIGHTS[severityLower] || 1;
const compositeScore = (severityWeight * 20) + ((p.occurrence_count || 1) * 5) + actionabilityBonus;
```

### Migration

**File**: `database/migrations/20260202_severity_weighted_pattern_prioritization.sql`

**Changes**:
- Replaces existing `v_patterns_with_decay` view definition
- Adds `severity_weight`, `composite_score`, `min_occurrence_threshold`, `meets_threshold` columns
- Backward compatible - keeps `decay_adjusted_confidence` for legacy code

**Run Migration**:
```bash
# Via database-agent
node scripts/execute-subagent.js --code DATABASE --task "Execute migration: database/migrations/20260202_severity_weighted_pattern_prioritization.sql"

# Or via psql
psql -h <host> -U <user> -d <database> -f database/migrations/20260202_severity_weighted_pattern_prioritization.sql
```

---

## Examples

### Example 1: Critical Security Issue (Single Occurrence)

**Pattern**:
- `severity`: `critical`
- `occurrence_count`: 1
- `proven_solutions`: null

**Score Calculation**:
```
composite_score = (10 * 20) + (1 * 5) + 0
                = 200 + 5 + 0
                = 205
```

**Result**: Surfaces immediately in `/learn` top 5, outranking even high-frequency low-severity issues.

---

### Example 2: Low Severity Polish (10 Occurrences)

**Pattern**:
- `severity`: `low`
- `occurrence_count`: 10
- `proven_solutions`: ["Fix typo in error message"]

**Score Calculation**:
```
composite_score = (1 * 20) + (10 * 5) + 15
                = 20 + 50 + 15
                = 85
```

**Result**: Ranks lower than critical/high severity issues but still surfaces as a confirmed pattern with proven solution.

---

### Example 3: Medium Severity Pattern (2 Occurrences, No Solution)

**Pattern**:
- `severity`: `medium`
- `occurrence_count`: 2
- `proven_solutions`: null

**Score Calculation**:
```
composite_score = (2 * 20) + (2 * 5) + 0
                = 40 + 10 + 0
                = 50
```

**meets_threshold**: `false` (medium requires 3+ occurrences)

**Result**: Filtered out - not yet a confirmed pattern. Will surface after 3rd occurrence.

---

### Example 4: High Severity with Solution (Single Occurrence)

**Pattern**:
- `severity`: `high`
- `occurrence_count`: 1
- `proven_solutions`: ["Add rate limiting", "Implement circuit breaker"]

**Score Calculation**:
```
composite_score = (5 * 20) + (1 * 5) + 15
                = 100 + 5 + 15
                = 120
```

**meets_threshold**: `true` (high severity bypasses threshold)

**Result**: Surfaces in top 10, prioritized for action with proven solutions available.

---

### Score Comparison Table

| Pattern | Severity | Occurrences | Solutions? | Composite Score | Rank |
|---------|----------|-------------|------------|-----------------|------|
| SQL injection found | critical | 1 | No | 205 | #1 |
| API timeout spike | high | 1 | Yes | 120 | #2 |
| Performance lag | high | 5 | No | 130 | #3 |
| UI typo | low | 30 | Yes | 185 | #4 |
| Code smell | medium | 8 | No | 80 | #5 |
| Test flakiness | medium | 2 | No | 50 | Filtered (< threshold) |

**Key Insight**: Critical issue (1 occurrence) ranks #1, while low-severity issue (30 occurrences) ranks #4, demonstrating severity dominance.

---

## Related Documentation

### Database
- **Schema**: `database/schema/004_retrospectives_schema.sql` - `issue_patterns` table definition
- **Migration**: `database/migrations/20260202_severity_weighted_pattern_prioritization.sql`

### Learning System
- **Architecture**: `docs/01_architecture/learning-capture-architecture.md`
- **Pattern Lifecycle**: `docs/reference/pattern-lifecycle.md`

### Implementation
- **Context Builder**: `scripts/modules/learning/context-builder.js:201-268` - `getIssuePatterns()` function
- **Learn Command**: `.claude/skills/learn.md` - `/learn` skill documentation

### LEO Protocol
- **Self-Improvement**: `CLAUDE_CORE.md` - Section on `/learn` process
- **Pattern Management**: Database `issue_patterns` table operations

---

## Changelog

- **v1.0.0** (2026-02-02): Initial documentation
  - Documented composite scoring formula
  - Explained severity weights and thresholds
  - Provided implementation details and examples
  - Part of SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001
