# LEO Protocol Learning Architecture Improvements

**SD Type**: Infrastructure
**Priority**: High
**Estimated Scope**: 3 migrations + 2 new modules + 2 file modifications

---

## Executive Summary

Based on triangulation consensus from ChatGPT (2 responses) and Gemini (AntiGravity), the learning architecture has a **critical gap**: the `feedback` table (raw intake) is disconnected from `issue_patterns` (curated knowledge). This plan implements the bridge.

**Unanimous Findings**:
- Overall assessment: "Needs improvement" (solid core, disconnected edge)
- Keep raw vs curated separation (formalize it)
- Add feedback → pattern promotion (MISSING)
- Add idempotency to prevent duplicate extraction
- Optional: unified learning_inbox table

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTAKE (Event Store)                        │
├─────────────────────────┬───────────────────────────────────────┤
│     retrospectives      │            feedback                   │
│   (SD completion)       │  (runtime + manual + UAT)             │
└───────────┬─────────────┴───────────────┬───────────────────────┘
            │                             │
            ↓                             ↓
┌───────────────────────┐    ┌────────────────────────────────────┐
│ Pattern Extractor     │    │ Feedback Clusterer (NEW)           │
│ + idempotency stamp   │    │ - Group by error_hash              │
│                       │    │ - Threshold: count ≥ 5 in 14 days  │
└───────────┬───────────┘    │ - Create draft patterns            │
            │                └──────────────┬─────────────────────┘
            ↓                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    issue_patterns                                │
│  + source: 'retrospective' | 'feedback_cluster' | 'manual'      │
│  + source_feedback_ids: JSONB[]                                  │
└─────────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    /learn command                                │
│  - Reads patterns, lessons, improvements, feedback               │
│  - Creates SDs from approved items                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema Changes

### Migration 1: Feedback-to-Pattern Bridge
**File**: `database/migrations/20260131_feedback_to_pattern_bridge.sql`

```sql
-- Add source tracking to issue_patterns
ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'retrospective'
  CHECK (source IN ('retrospective', 'feedback_cluster', 'manual'));

ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS source_feedback_ids JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_issue_patterns_source
ON issue_patterns(source) WHERE source = 'feedback_cluster';

-- Add clustering tracking to feedback
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS cluster_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedback_clustering
ON feedback(error_hash, created_at DESC)
WHERE status IN ('new', 'triaged') AND cluster_processed_at IS NULL;

COMMENT ON COLUMN issue_patterns.source IS
  'Origin of pattern: retrospective (default), feedback_cluster, or manual';
COMMENT ON COLUMN issue_patterns.source_feedback_ids IS
  'Array of feedback UUIDs that contributed to this pattern (for feedback_cluster source)';
```

### Migration 2: Retrospective Idempotency
**File**: `database/migrations/20260131_retrospective_idempotency.sql`

```sql
-- Prevent duplicate pattern extraction
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS learning_extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_retrospectives_unextracted
ON retrospectives(created_at DESC)
WHERE learning_extracted_at IS NULL AND quality_score >= 60;

COMMENT ON COLUMN retrospectives.learning_extracted_at IS
  'Timestamp when patterns were extracted. NULL = not yet processed.';
```

### Migration 3: Learning Inbox (Optional)
**File**: `database/migrations/20260131_learning_inbox.sql`

```sql
CREATE TABLE IF NOT EXISTS learning_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN (
    'issue_pattern', 'feedback_cluster', 'retrospective_lesson', 'protocol_improvement'
  )),
  source_id UUID NOT NULL,
  source_table VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  evidence_count INTEGER DEFAULT 1,
  confidence INTEGER DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'sd_created', 'archived'
  )),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_inbox_pending ON learning_inbox(confidence DESC)
  WHERE status = 'pending';
```

---

## Implementation Steps

### Step 1: Create Feedback Clusterer Module
**New File**: `lib/learning/feedback-clusterer.js`

```javascript
// Promotion thresholds (from triangulation consensus)
const THRESHOLDS = {
  MIN_OCCURRENCES: 5,
  TIME_WINDOW_DAYS: 14,
  CRITICAL_MIN_OCCURRENCES: 3
};

// Key functions:
// - findPromotableClusters() - Query feedback grouped by error_hash
// - evaluateForPromotion(cluster) - Check against thresholds
// - createDraftPattern(cluster) - Insert to issue_patterns with status='draft'
// - markProcessed(feedbackIds) - Update cluster_processed_at
// - runClusteringJob() - Main entry point
```

### Step 2: Add Idempotency to Pattern Extraction
**Modify**: `scripts/auto-extract-patterns-from-retro.js`

```javascript
// At function start:
if (retro.learning_extracted_at) {
  console.log(`  Already extracted at ${retro.learning_extracted_at}`);
  return { success: true, skipped: true };
}

// After successful extraction:
await supabase
  .from('retrospectives')
  .update({ learning_extracted_at: new Date().toISOString() })
  .eq('id', retroId);
```

### Step 3: Add createDraftPattern to IssueKnowledgeBase
**Modify**: `lib/learning/issue-knowledge-base.js`

```javascript
async createDraftPattern(data) {
  // Check for similar existing patterns first
  const similar = await this.search(data.issue_summary, { limit: 1 });
  if (similar[0]?.similarity > 0.5) {
    return { exists: true, pattern_id: similar[0].pattern_id };
  }

  return this.createPattern({
    ...data,
    status: 'draft',
    source: 'feedback_cluster'
  });
}
```

### Step 4: Run Migrations
```bash
# Apply in order
psql $DATABASE_URL -f database/migrations/20260131_feedback_to_pattern_bridge.sql
psql $DATABASE_URL -f database/migrations/20260131_retrospective_idempotency.sql
psql $DATABASE_URL -f database/migrations/20260131_learning_inbox.sql  # optional
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `lib/learning/feedback-clusterer.js` | **CREATE** | New module for feedback→pattern promotion |
| `lib/learning/issue-knowledge-base.js` | MODIFY | Add `createDraftPattern()` method |
| `scripts/auto-extract-patterns-from-retro.js` | MODIFY | Add idempotency check/stamp |
| `database/migrations/20260131_*.sql` | **CREATE** | 3 migration files |

---

## Promotion Thresholds (Triangulated)

| Condition | Threshold | Source |
|-----------|-----------|--------|
| Standard promotion | ≥ 5 occurrences in 14 days | ChatGPT avg |
| Critical severity | ≥ 3 occurrences (immediate) | All 3 AIs |
| Source diversity | ≥ 2 different SDs/sources | ChatGPT #1 |
| Time decay | Exponential after 30 days | ChatGPT #2 |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate patterns | Medium | Similarity check (>0.5) before creation |
| Performance impact | Low | Partial index on unprocessed feedback |
| Breaking /learn | Low | Additive changes only; fallback to direct queries |

---

## Testing Strategy

### Unit Tests
- `feedback-clusterer.test.js`: Threshold logic, similarity dedup
- `auto-extract-patterns-from-retro.test.js`: Idempotency skip

### Integration Tests
1. Insert 5 feedback with same error_hash → Run clustering → Verify pattern created
2. Run extraction twice on same retro → Verify only 1 pattern created

### Manual Verification
```bash
# Dry run clustering
node lib/learning/feedback-clusterer.js --dry-run

# Check draft patterns
SELECT pattern_id, source, status FROM issue_patterns WHERE source = 'feedback_cluster';
```

---

## Verification Checklist

- [ ] Migrations applied without errors
- [ ] `feedback-clusterer.js` creates draft patterns from high-occurrence feedback
- [ ] `auto-extract-patterns-from-retro.js` skips already-extracted retrospectives
- [ ] `/learn` command shows patterns from both sources
- [ ] No duplicate patterns created

---

## Related Files (Reference)

- `database/migrations/391_quality_lifecycle_schema.sql` - feedback table schema
- `database/migrations/create-issue-patterns-table.sql` - issue_patterns schema
- `scripts/modules/learning/context-builder.js` - /learn aggregation
- `lib/feedback-capture.js` - error hash deduplication
