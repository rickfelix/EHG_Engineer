# Learning Module - Data Contracts

**Purpose**: Define explicit data contracts for learning items to prevent field name mismatches and schema violations across module boundaries.

**Created**: 2026-02-07 (RCA-LEARN-EMPTY-IMPROVEMENTS)
**Pattern Reference**: PAT-LEARN-FLD-001

---

## Learning Item Data Contracts

All learning items returned by `context-builder.js` must conform to these interfaces:

### Base Learning Item

```typescript
interface BaseLearningItem {
  id: string;                    // Primary identifier (ALWAYS REQUIRED)
  source_type: string;           // 'issue_pattern' | 'improvement' | 'sub_agent_*' | 'feedback*'
  content: string;               // Human-readable summary
  confidence: number;            // 0-100
}
```

### Issue Pattern

**Source**: `issue_patterns` table via `getIssuePatterns()`

```typescript
interface IssuePattern extends BaseLearningItem {
  source_type: 'issue_pattern';
  pattern_id: string;            // ⚠️ REQUIRED - Used by sd-builders.js to distinguish from improvements
  category: string;
  severity: string;              // 'critical' | 'high' | 'medium' | 'low'
  issue_summary: string;
  occurrence_count: number;
  proven_solutions?: Array<{
    solution: string;
    success_count: number;
  }>;
  prevention_checklist?: Array<string>;
  composite_score?: number;      // Severity-weighted ranking score
  severity_weight?: number;
  meets_threshold?: boolean;
}
```

**CRITICAL**: `pattern_id` field MUST be set. context-builder.js uses `id` for normalization, but sd-builders.js checks `pattern_id` to distinguish patterns from improvements.

### Protocol Improvement

**Source**: `protocol_improvement_queue` table via `getPendingImprovements()`

```typescript
interface Improvement extends BaseLearningItem {
  source_type: 'improvement';
  improvement_type: string;      // ⚠️ REQUIRED - e.g., 'gate', 'validation', 'protocol'
  description: string;           // ⚠️ REQUIRED - Detailed description of the improvement
  evidence_count: number;
  target_table: string;          // Database table to update
  target_operation: string;      // 'INSERT' | 'UPDATE' | 'DELETE'
  payload?: any;                 // JSONB data for the operation
}
```

### Sub-Agent Learning (SAL)

**Source**: `sub_agent_execution_results` table via `getSubAgentLearnings()`

```typescript
interface SubAgentLearning extends BaseLearningItem {
  source_type: 'sub_agent_recommendation' | 'sub_agent_issue' | 'sub_agent_performance';
  pattern_id: string;            // ⚠️ Set by sd-creation.js normalization (pattern_id: salItem.id)
  sub_agent_code: string;        // e.g., 'TESTING', 'STORIES', 'RISK'
  occurrence_count: number;
  metrics?: {
    pass_rate: number;
    execution_count: number;
    avg_confidence?: number;
  };
  items?: Array<{
    recommendation?: string;
    issue?: string;
    count: number;
  }>;
}
```

### Feedback Learning

**Source**: `feedback` table via `getResolvedFeedbackLearnings()`

```typescript
interface FeedbackLearning extends BaseLearningItem {
  source_type: 'feedback';
  pattern_id: string;            // ⚠️ Set by sd-creation.js normalization
  title: string;
  category?: string;
  priority?: string;             // 'P0' | 'P1' | 'P2' | 'P3'
  occurrence_count: number;
  resolution_sd_id?: string;
  resolved_at?: string;
}
```

---

## Module Responsibilities

### context-builder.js

**Produces** learning items conforming to above contracts.

**Key responsibilities**:
- Query learning sources (patterns, improvements, SAL, feedback)
- Apply intelligent filtering (severity-weighted, confidence threshold, staleness)
- Normalize field names:
  - ✅ `id` - Primary identifier (unified across all types)
  - ⚠️ **MUST** also set `pattern_id` for patterns (not just `id`)
  - ⚠️ **MUST** set `description` for improvements

**Example normalization** (lines 294-318):
```javascript
return {
  id: pattern.pattern_id,           // ← Primary key
  pattern_id: pattern.pattern_id,   // ← REQUIRED for sd-builders.js!
  source_type: 'issue_pattern',
  source_id: pattern.pattern_id,
  category: pattern.category,
  severity: pattern.severity,
  content: pattern.issue_summary,
  // ... other fields
};
```

### sd-builders.js

**Consumes** learning items and renders SD fields (description, title, metrics, etc.).

**Key responsibilities**:
- Distinguish patterns from improvements via `if (item.pattern_id)`
- Render pattern sections with category, severity, summary, occurrences
- Render improvement sections with type, description, evidence count, target table
- **Validate** items before rendering (validateLearningItem function)

**Validation** (lines 13-28):
```javascript
function validateLearningItem(item, index) {
  if (!item.id && !item.pattern_id) {
    throw new Error(`Learning item ${index} missing both 'id' and 'pattern_id' fields`);
  }

  // Warn if pattern-like item missing pattern_id
  if ((item.category || item.severity || item.occurrence_count) && !item.pattern_id) {
    console.warn(`⚠️  Pattern-like item ${item.id} missing 'pattern_id' field`);
  }

  // Warn if improvement-like item missing description
  if ((item.improvement_type || item.target_table) && !item.description) {
    console.warn(`⚠️  Improvement-like item ${item.id} missing 'description' field`);
  }
}
```

### sd-creation.js

**Orchestrates** SD creation workflow.

**Key responsibilities**:
- Collect approved items from all learning sources
- **Normalize** field names before passing to sd-builders.js
- Handle conflicts (items already assigned to other SDs)
- Tag source items with assigned SD ID

**Normalization** (line 211):
```javascript
approvedItems.push({
  ...pattern,
  pattern_id: pattern.id || pattern.pattern_id  // ← Ensure pattern_id is set
});
```

---

## Common Issues and Preventive Checks

### Issue: Empty improvements in SD descriptions

**Symptom**: SD description shows "### Improvement: General", "Description: No description", "Evidence Count: 0"

**Root Cause**: Pattern object missing `pattern_id` field, so sd-builders.js treats it as improvement

**Prevention**:
1. ✅ context-builder.js sets `pattern_id` when creating pattern objects
2. ✅ sd-creation.js normalizes field names before passing to sd-builders.js
3. ✅ sd-builders.js validates item shape and warns on mismatches

**Pattern Reference**: PAT-LEARN-FLD-001

### Issue: Missing description for improvements

**Symptom**: Improvement item has no actionable content

**Root Cause**: `protocol_improvement_queue` record missing `description` column data

**Prevention**:
1. ✅ Validate `description` is non-empty when inserting into queue
2. ✅ sd-builders.js validates and warns if missing

---

## Testing

### Unit Test: Pattern Field Normalization
```javascript
// Test that patterns have pattern_id after normalization
const pattern = { id: 'PAT-TEST-001', category: 'test', severity: 'low' };
const normalized = { ...pattern, pattern_id: pattern.id };
assert(normalized.pattern_id === 'PAT-TEST-001');
```

### Integration Test: Auto-Approve Rendering
```bash
# 1. Create test pattern
node -e "..." # Insert PAT-TEST-RCA-001

# 2. Run auto-approve
node scripts/modules/learning/index.js auto-approve --threshold=50

# 3. Verify rendering
# Expected: "### Pattern: PAT-TEST-RCA-001"
# NOT: "### Improvement: General"
```

---

## Version History

| Date | Change | RCA/Pattern |
|------|--------|-------------|
| 2026-02-07 | Created data contracts, added validateLearningItem() | PAT-LEARN-FLD-001, RCA-LEARN-EMPTY-IMPROVEMENTS |
| 2026-01-20 | Module refactor (extracted sd-builders, classification) | SD-LEO-REFACTOR-LEARN-001 |

---

## Related Documentation

- **RCA Analysis**: `RCA-LEARN-EMPTY-IMPROVEMENTS-ANALYSIS.md`
- **Pattern**: `PAT-LEARN-FLD-001` in `issue_patterns` table
- **SD**: SD-LEARN-FIX-ADDRESS-PATTERN-IMPROVEMENT-003 (affected SD)
