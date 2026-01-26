# Source Stage Metadata Field Documentation


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, protocol

**Created**: 2025-11-07
**Purpose**: Track which workflow stage (1-40) spawned a Strategic Directive
**Table**: `strategic_directives_v2`
**Field Location**: `metadata` JSONB column
**Field Name**: `source_stage`

---

## Overview

The `source_stage` metadata field enables bi-directional traceability between the 40 workflow stages and Strategic Directives spawned by Chairman-led stage reviews.

### Purpose

1. **Traceability**: Link SDs back to the stage that identified the gap
2. **Gap Tracking**: Identify which stages have spawned improvement work
3. **Audit Trail**: Maintain governance history of stage reviews
4. **Impact Analysis**: Understand which stages generate most work

---

## Field Specification

### Data Type
`INTEGER` (stored in JSONB metadata column)

### Field Name
`source_stage`

### Valid Values
- `NULL`: SD was not spawned by stage review (created via other means)
- `1-40`: SD was spawned by review of Stage [X]

### Optional Fields (Related)
When `source_stage` is set, the following metadata fields should also be populated:

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `source_stage` | INTEGER | Stage number (1-40) | `4` |
| `source_stage_name` | STRING | Human-readable stage name | `"Stage 4: Venture Research"` |
| `spawned_from_review` | BOOLEAN | Confirms SD came from stage review | `true` |
| `review_date` | STRING (ISO 8601) | Date stage review was completed | `"2025-11-07"` |
| `review_decision_file` | STRING | Path to decision record | `"/docs/workflow/stage_reviews/stage-04/04_decision_record.md"` |

---

## Usage Examples

### Setting Source Stage (When SD is Created from Stage Review)

```sql
-- Example: SD created from Stage 4 review
UPDATE strategic_directives_v2
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'source_stage', 4,
  'source_stage_name', 'Stage 4: Venture Research',
  'spawned_from_review', true,
  'review_date', '2025-11-07',
  'review_decision_file', '/docs/workflow/stage_reviews/stage-04/04_decision_record.md'
)
WHERE id = 'SD-VENTURE-RESEARCH-001';
```

### Querying SDs by Source Stage

```sql
-- Find all SDs spawned by Stage 4
SELECT
  id,
  title,
  priority,
  status,
  metadata->>'source_stage' as source_stage,
  metadata->>'review_date' as review_date
FROM strategic_directives_v2
WHERE metadata->>'source_stage' = '4'
ORDER BY created_at DESC;
```

### Finding Which Stage Spawned an SD

```sql
-- Reverse lookup: Which stage created this SD?
SELECT
  id,
  title,
  metadata->>'source_stage' as source_stage,
  metadata->>'source_stage_name' as stage_name,
  metadata->>'review_decision_file' as decision_file
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-RESEARCH-001';
```

### Counting SDs by Stage

```sql
-- Stage impact analysis: Which stages generate most SDs?
SELECT
  metadata->>'source_stage' as stage_number,
  metadata->>'source_stage_name' as stage_name,
  COUNT(*) as sd_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE priority = 'critical') as critical_count
FROM strategic_directives_v2
WHERE metadata->>'source_stage' IS NOT NULL
GROUP BY metadata->>'source_stage', metadata->>'source_stage_name'
ORDER BY stage_number::INTEGER;
```

### Finding Stages Without SDs

```sql
-- Identify stages that haven't spawned any SDs (may indicate completeness or lack of review)
WITH stage_numbers AS (
  SELECT generate_series(1, 40) as stage_num
),
sd_stages AS (
  SELECT DISTINCT (metadata->>'source_stage')::INTEGER as stage_num
  FROM strategic_directives_v2
  WHERE metadata->>'source_stage' IS NOT NULL
)
SELECT sn.stage_num as stage_without_sds
FROM stage_numbers sn
LEFT JOIN sd_stages ss ON sn.stage_num = ss.stage_num
WHERE ss.stage_num IS NULL
ORDER BY sn.stage_num;
```

---

## Integration with Stage Review Framework

### When to Set Source Stage

The `source_stage` field should be set **immediately after Chairman decision** in Step 4 of the stage review process, when a Strategic Directive is created.

**Workflow**:
1. Chairman reviews gap analysis (Step 3)
2. Chairman decides to create SD (Step 4)
3. SD is created in `strategic_directives_v2` table
4. `source_stage` metadata is set via UPDATE query
5. Decision record (04_decision_record.md) documents the SD linkage

### Automatic vs. Manual Setting

**Manual Setting** (Current Approach):
- `source_stage` is set via explicit SQL UPDATE after SD creation
- Documented in decision record file
- Verified in outcome log

**Future Enhancement** (Optional):
- Create script: `scripts/create-sd-from-stage-review.mjs`
- Script accepts: stage number, SD details, gap references
- Script automatically sets `source_stage` during SD creation
- Reduces manual SQL errors

---

## Governance Queries

### Stage Review Status Dashboard

```sql
-- Generate stage review dashboard
WITH stage_sds AS (
  SELECT
    (metadata->>'source_stage')::INTEGER as stage_num,
    COUNT(*) as total_sds,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_sds,
    COUNT(*) FILTER (WHERE status = 'active') as active_sds,
    MAX(metadata->>'review_date') as last_review_date
  FROM strategic_directives_v2
  WHERE metadata->>'source_stage' IS NOT NULL
  GROUP BY metadata->>'source_stage'
)
SELECT
  stage_num,
  total_sds,
  completed_sds,
  active_sds,
  last_review_date,
  CASE
    WHEN last_review_date IS NULL THEN '⏸️ Not Reviewed'
    WHEN active_sds > 0 THEN '🚧 SDs In Progress'
    WHEN completed_sds = total_sds THEN '✅ All SDs Complete'
    ELSE '⚠️ Some SDs Pending'
  END as stage_status
FROM stage_sds
ORDER BY stage_num;
```

### SD Completion Impact on Stages

```sql
-- For a given stage, show SD completion status
SELECT
  id,
  title,
  priority,
  status,
  progress,
  metadata->>'source_stage' as from_stage,
  created_at,
  updated_at
FROM strategic_directives_v2
WHERE metadata->>'source_stage' = '4'  -- Replace with target stage
ORDER BY
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  created_at DESC;
```

---

## Audit Trail Integration

### Stage Review Outcome Log

Every stage review outcome log (05_outcome_log.md) should include:

```markdown
### Database Records

**Strategic Directives Created** (if applicable):
- **SD ID**: SD-VENTURE-RESEARCH-001
- **Title**: Improve Venture Research Agent Accuracy
- **Status**: active
- **Metadata**: `source_stage` = 4

**Verification Query**:
```sql
SELECT id, title, priority, status, metadata->>'source_stage' as source_stage
FROM strategic_directives_v2
WHERE metadata->>'source_stage' = '4';
```
```

### Decision Record Reference

Every decision record (04_decision_record.md) that spawns an SD should include:

```markdown
### Database Link

```sql
UPDATE strategic_directives_v2
SET metadata = metadata || jsonb_build_object(
  'source_stage', 4,
  'source_stage_name', 'Stage 4: Venture Research',
  'spawned_from_review', true,
  'review_date', '2025-11-07',
  'review_decision_file', '/docs/workflow/stage_reviews/stage-04/04_decision_record.md'
)
WHERE id = 'SD-VENTURE-RESEARCH-001';
```
```

---

## Best Practices

### DO

✅ Set `source_stage` immediately after SD creation
✅ Include all related metadata fields (stage name, review date, decision file)
✅ Verify linkage with query in outcome log
✅ Reference SD in stage review documentation
✅ Use stage number (integer) not stage name (string) as primary identifier

### DON'T

❌ Set `source_stage` for SDs created outside stage review process
❌ Change `source_stage` after initial setting (immutable after creation)
❌ Use stage name instead of stage number as `source_stage` value
❌ Forget to document SD linkage in decision record
❌ Create SD without Chairman approval (even if gap is critical)

---

## Migration & Backward Compatibility

### Existing SDs

**No Migration Required**:
- Existing SDs without `source_stage` field remain valid
- `NULL` value indicates SD was not spawned by stage review
- No impact on existing LEO Protocol workflows

### Querying Mixed SDs

```sql
-- Query all SDs, showing source stage if available
SELECT
  id,
  title,
  priority,
  status,
  COALESCE(metadata->>'source_stage', 'N/A') as source_stage,
  CASE
    WHEN metadata->>'source_stage' IS NOT NULL THEN 'Stage Review'
    ELSE 'Other Source'
  END as creation_method
FROM strategic_directives_v2
ORDER BY created_at DESC;
```

---

## Future Enhancements

### Potential Additions

1. **Stage Review Iteration Tracking**:
   ```json
   {
     "source_stage": 4,
     "stage_review_iteration": 2,  // If stage reviewed multiple times
     "prior_review_dates": ["2025-01-15", "2025-11-07"]
   }
   ```

2. **Gap Reference**:
   ```json
   {
     "source_stage": 4,
     "gap_addressed": "3.1",  // Gap number from gap analysis
     "gap_priority": "critical"
   }
   ```

3. **Stage Completion Prerequisite**:
   ```json
   {
     "source_stage": 4,
     "stage_completion_blocker": true,  // Must complete before stage considered done
     "blocks_stage_acceptance": true
   }
   ```

---

## Schema Impact

### No Schema Migration Required

**Why**:
- `source_stage` is stored in existing `metadata` JSONB column
- JSONB supports dynamic fields without schema changes
- No ALTER TABLE required
- No downtime needed

### Performance Considerations

**Indexing** (Optional, if query performance becomes issue):
```sql
-- Create GIN index on metadata for faster source_stage queries
CREATE INDEX IF NOT EXISTS idx_sd_metadata_source_stage
ON strategic_directives_v2
USING GIN ((metadata->'source_stage'));
```

**Current Performance**: Acceptable without index (< 100 SDs expected)
**Index Recommended When**: > 500 SDs with source_stage queries becoming slow

---

## Related Documentation

- `/docs/workflow/review_process.md` - Stage Review Framework
- `/docs/workflow/review_templates/stage_review_template.md` - Review Template
- `/docs/workflow/critique/stage-XX.md` - Stage Dossiers (40 files)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-07 | Initial field documentation | Claude Code |

---

**Field Owner**: Chairman (Governance)
**Field Status**: Active
**Last Review**: 2025-11-07

---

<!-- Generated by Claude Code | Source Stage Metadata Field Documentation | 2025-11-07 -->
