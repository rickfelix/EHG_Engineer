# Migration Summary: LLM Triage Columns

**Migration File**: `20260207_feedback_llm_triage_columns.sql`
**Date**: 2026-02-07
**SD**: SD-LEO-ENH-EVOLVE-LEO-ASSIST-001
**User Story**: US-003 (Cloud LLM triage with confidence scoring)

## Objective

Add structured columns to the `feedback` table to store AI classification results from LLM-based triage, enabling confidence scoring and source tracking.

## Changes Applied

### 1. New Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `ai_triage_confidence` | INTEGER | YES | Confidence score (0-100) from AI triage classification |
| `ai_triage_classification` | VARCHAR(50) | YES | AI-determined classification: bug, enhancement, question, duplicate, invalid |
| `ai_triage_source` | VARCHAR(20) | YES | Source of triage: 'llm' (cloud/local) or 'rules' (fallback) |

### 2. Constraints

| Constraint | Rule |
|------------|------|
| `chk_ai_triage_confidence_range` | Confidence must be NULL or 0-100 |
| `chk_ai_triage_source_valid` | Source must be NULL, 'llm', or 'rules' |

### 3. Index

- **Index**: `idx_feedback_ai_triage_confidence`
- **Purpose**: Optimize analytics queries filtering by confidence score
- **Type**: Partial index (only non-NULL values)

## Verification

✅ **Columns added**: All 3 columns created successfully
✅ **Constraints applied**: Both CHECK constraints active
✅ **Index created**: idx_feedback_ai_triage_confidence exists

## Migration Execution

**Method**: Direct pg client connection via `SUPABASE_POOLER_URL`
**Status**: ✅ SUCCESS
**Execution Time**: < 1 second

## Usage Example

```sql
-- Example: Insert feedback with LLM triage results
INSERT INTO feedback (
  session_id,
  feedback_type,
  feedback_text,
  ai_triage_confidence,
  ai_triage_classification,
  ai_triage_source
) VALUES (
  'session-123',
  'bug',
  'Login button not working',
  95,
  'bug',
  'llm'
);

-- Query: Find high-confidence bug reports
SELECT *
FROM feedback
WHERE ai_triage_classification = 'bug'
  AND ai_triage_confidence >= 80
ORDER BY ai_triage_confidence DESC;
```

## Rollback Plan

```sql
-- If rollback needed:
ALTER TABLE feedback DROP COLUMN IF EXISTS ai_triage_confidence;
ALTER TABLE feedback DROP COLUMN IF EXISTS ai_triage_classification;
ALTER TABLE feedback DROP COLUMN IF EXISTS ai_triage_source;
DROP INDEX IF EXISTS idx_feedback_ai_triage_confidence;
```

## Related Files

- Migration: `database/migrations/20260207_feedback_llm_triage_columns.sql`
- Schema docs: Will be auto-updated on next `npm run schema:docs:engineer`
