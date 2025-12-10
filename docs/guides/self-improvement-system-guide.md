# LEO Protocol Self-Improvement System

**Migration**: `20251210_retrospective_self_improvement_system.sql`
**Status**: Ready for deployment
**Purpose**: Database-first protocol evolution through retrospective analysis

---

## Overview

The Self-Improvement System enables LEO Protocol to learn from retrospectives and automatically queue protocol improvements for review and application. This creates a continuous improvement loop where:

1. Retrospectives identify protocol gaps and improvements
2. Improvements are extracted and queued automatically
3. Evidence accumulates as patterns repeat
4. High-evidence improvements are prioritized
5. Applied improvements are tracked for effectiveness

## Key Features

### 1. Retrospective Type Classification

Retrospectives are now classified by when they occur:

| Type | Description | When Used |
|------|-------------|-----------|
| `LEAD_TO_PLAN` | Approval phase retrospective | After LEAD approves/rejects SD |
| `PLAN_TO_EXEC` | Validation phase retrospective | After PLAN validation completes |
| `SD_COMPLETION` | Full SD retrospective | After SD completes (all phases) |

**Why**: Different phases reveal different types of improvements. LEAD phase might reveal business validation gaps, while EXEC phase reveals implementation patterns.

### 2. Protocol Improvement Queue

Central queue for all proposed protocol improvements:

```sql
CREATE TABLE protocol_improvement_queue (
  id UUID PRIMARY KEY,
  source_retro_id UUID,           -- Which retrospective found this
  source_type TEXT,                -- LEAD_TO_PLAN, PLAN_TO_EXEC, SD_COMPLETION
  improvement_type TEXT,           -- VALIDATION_RULE, CHECKLIST_ITEM, etc.
  target_table TEXT NOT NULL,      -- Enforces database-first approach
  target_operation TEXT,           -- INSERT, UPDATE, UPSERT
  payload JSONB NOT NULL,          -- The actual data to apply
  description TEXT,                -- Human-readable description
  evidence_count INTEGER,          -- How many times observed
  status TEXT,                     -- PENDING, APPROVED, APPLIED, etc.
  effectiveness_score INTEGER      -- Post-application effectiveness (0-100)
);
```

**Database-First Enforcement**: Every improvement MUST specify `target_table` and `payload`, preventing vague "we should improve X" entries.

### 3. Automatic Extraction

Trigger automatically extracts improvements from retrospectives:

- **From `protocol_improvements` array**: Structured improvements identified during retrospective
- **From `failure_patterns` array**: Process issues that suggest protocol gaps
- **Consolidation**: Similar improvements are merged, incrementing `evidence_count`

### 4. Helper Views

#### `v_pending_improvements`
Shows pending improvements grouped by similarity and evidence count:

```sql
SELECT * FROM v_pending_improvements
ORDER BY evidence_count DESC
LIMIT 10;
```

Columns:
- `improvement_type`: Type of improvement
- `description`: What needs to change
- `evidence_count`: How many times observed
- `occurrence_count`: Number of queue entries (before consolidation)
- `seen_in_phases`: Which phase types observed this
- `queue_ids`: Array of queue IDs for this pattern

#### `v_improvement_effectiveness`
Tracks effectiveness of applied improvements:

```sql
SELECT * FROM v_improvement_effectiveness
WHERE effectiveness_score > 75
ORDER BY effectiveness_score DESC;
```

Useful for measuring ROI of protocol changes.

### 5. Helper Functions

#### `get_pre_handoff_warnings(handoff_type)`
Returns relevant warnings before a handoff:

```sql
SELECT * FROM get_pre_handoff_warnings('LEAD_TO_PLAN');
```

**Integration Point**: Add to handoff scripts to show known issues before phase transitions.

#### `apply_protocol_improvement(queue_id)`
Marks improvement as applied (manual changes required):

```sql
SELECT apply_protocol_improvement('550e8400-e29b-41d4-a716-446655440000');
```

Returns:
```json
{
  "success": true,
  "message": "Improvement marked as applied. Ensure manual database changes match payload.",
  "target_table": "leo_validation_rules",
  "payload": { ... }
}
```

**Important**: This function does NOT automatically modify target tables. You must manually apply changes using the payload. This maintains human oversight.

#### `consolidate_similar_improvements()`
Merges duplicate improvements:

```sql
SELECT * FROM consolidate_similar_improvements();
```

Returns consolidated improvements with new evidence counts. Run periodically to keep queue clean.

---

## Workflows

### Workflow 1: Creating a Retrospective with Improvements

When creating a retrospective, include protocol improvements in the `protocol_improvements` JSONB array:

```javascript
const retroData = {
  sd_id: 'SD-TEST-001',
  retro_type: 'SD_COMPLETION',
  retrospective_type: 'SD_COMPLETION',
  title: 'SD-TEST-001 Completion Retrospective',
  quality_score: 85,
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT',
  protocol_improvements: [
    {
      category: 'validation',
      improvement: 'Add validation for database schema changes before EXEC phase',
      evidence: 'Saw 3 schema mismatches in recent SDs',
      impact: 'HIGH',
      affected_phase: 'PLAN'
    },
    {
      category: 'checklist',
      improvement: 'Add checklist item: Verify Supabase RLS policies allow operation',
      evidence: 'RLS blocked operations in SD-GTM-INTEL-DISCOVERY-001',
      impact: 'MEDIUM',
      affected_phase: 'EXEC'
    }
  ]
};

await supabase.from('retrospectives').insert(retroData);
```

**Result**: Trigger automatically extracts improvements into `protocol_improvement_queue`.

### Workflow 2: Reviewing Pending Improvements

```sql
-- Query high-evidence improvements
SELECT
  improvement_type,
  description,
  evidence_count,
  target_table,
  target_phase
FROM v_pending_improvements
WHERE evidence_count >= 3  -- Observed 3+ times
ORDER BY evidence_count DESC;
```

**Decision Points**:
- **Evidence count ≥ 3**: Strong signal, prioritize review
- **Evidence count = 1-2**: Monitor, may be one-off issue
- **Multiple phases**: Cross-cutting concern, high priority

### Workflow 3: Approving an Improvement

```sql
-- Review improvement details
SELECT
  id,
  description,
  payload,
  target_table,
  target_operation
FROM protocol_improvement_queue
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Approve it
UPDATE protocol_improvement_queue
SET status = 'APPROVED',
    reviewed_at = NOW(),
    reviewed_by = 'claude'
WHERE id = '550e8400-e29b-41d4-a716-446655440000';
```

### Workflow 4: Applying an Improvement

```sql
-- Get payload details
SELECT
  target_table,
  target_operation,
  payload
FROM protocol_improvement_queue
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Example payload for validation rule:
-- {
--   "rule_id": "PLAN-VAL-006",
--   "rule_name": "Database Schema Validation",
--   "phase": "PLAN",
--   "validation_query": "..."
-- }

-- Manually execute the change (example):
INSERT INTO leo_validation_rules (rule_id, rule_name, phase, validation_query)
VALUES ('PLAN-VAL-006', 'Database Schema Validation', 'PLAN', '...');

-- Mark as applied
SELECT apply_protocol_improvement('550e8400-e29b-41d4-a716-446655440000');
```

### Workflow 5: Measuring Effectiveness

After applying an improvement, track its effectiveness:

```sql
-- Update effectiveness score (0-100)
UPDATE protocol_improvement_queue
SET effectiveness_score = 85  -- 85% reduction in related issues
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- View effectiveness report
SELECT * FROM v_improvement_effectiveness
ORDER BY effectiveness_score DESC;
```

**Effectiveness Calculation**:
- Count occurrences of related issue pattern before application
- Count occurrences after application
- Score = (1 - after/before) × 100

### Workflow 6: Pre-Handoff Warnings

Integrate into handoff scripts:

```javascript
// In handoff script (e.g., scripts/handoff.js)
async function showPreHandoffWarnings(handoffType) {
  const { data, error } = await supabase
    .rpc('get_pre_handoff_warnings', { handoff_type: handoffType });

  if (data && data.length > 0) {
    console.log('\n⚠️  Known Issues for this Handoff Type:');
    console.log('─'.repeat(60));
    data.forEach(warning => {
      console.log(`\n[${warning.improvement_type}] Evidence: ${warning.evidence_count}x`);
      console.log(`  ${warning.warning_text}`);
      console.log(`  Last seen: ${new Date(warning.last_seen).toLocaleDateString()}`);
    });
    console.log('\n' + '─'.repeat(60));
  }
}

// Call before handoff execution
await showPreHandoffWarnings('LEAD_TO_PLAN');
```

---

## Integration Points

### 1. Retrospective Generation Scripts

Update retrospective generation scripts to include `retrospective_type`:

```javascript
// scripts/generate-retrospective.js
const retrospectiveData = {
  // ... existing fields ...
  retrospective_type: determineRetrospectiveType(context)
};

function determineRetrospectiveType(context) {
  if (context.phase === 'LEAD' && context.transition === 'to_PLAN') {
    return 'LEAD_TO_PLAN';
  } else if (context.phase === 'PLAN' && context.transition === 'to_EXEC') {
    return 'PLAN_TO_EXEC';
  } else {
    return 'SD_COMPLETION';
  }
}
```

### 2. Handoff Scripts

Add pre-handoff warnings to `scripts/handoff.js`:

```javascript
// Before executing handoff
if (handoffType === 'LEAD_TO_PLAN' || handoffType === 'PLAN_TO_EXEC') {
  await showPreHandoffWarnings(handoffType);
}
```

### 3. CLAUDE.md Updates

Add to phase-specific CLAUDE files:

**CLAUDE_PLAN.md**:
```markdown
## Pre-Handoff Checklist

Before accepting LEAD→PLAN handoff:
1. Run: `SELECT * FROM get_pre_handoff_warnings('LEAD_TO_PLAN');`
2. Review warnings with evidence_count ≥ 3
3. Apply extra scrutiny to those areas
```

### 4. Dashboard UI (Future)

Create UI components for:
- Viewing pending improvements
- Approving/rejecting improvements
- Tracking effectiveness metrics
- Searching historical improvements

---

## Maintenance

### Daily Tasks

```sql
-- Consolidate similar improvements
SELECT * FROM consolidate_similar_improvements();

-- Review high-evidence improvements
SELECT * FROM v_pending_improvements
WHERE evidence_count >= 3
ORDER BY evidence_count DESC;
```

### Weekly Tasks

```sql
-- Update effectiveness scores for applied improvements
-- (Manual process: compare issue occurrence rates)

-- Review rejected improvements (are they still valid?)
SELECT id, description, reviewed_at
FROM protocol_improvement_queue
WHERE status = 'REJECTED'
  AND reviewed_at < NOW() - INTERVAL '30 days';
```

### Monthly Tasks

```sql
-- Generate effectiveness report
SELECT
  improvement_type,
  COUNT(*) as applied_count,
  AVG(effectiveness_score) as avg_effectiveness,
  COUNT(*) FILTER (WHERE effectiveness_score >= 75) as high_impact_count
FROM protocol_improvement_queue
WHERE status = 'APPLIED'
  AND applied_at >= NOW() - INTERVAL '30 days'
GROUP BY improvement_type
ORDER BY avg_effectiveness DESC;

-- Archive old superseded improvements
UPDATE protocol_improvement_queue
SET status = 'ARCHIVED'
WHERE status = 'SUPERSEDED'
  AND updated_at < NOW() - INTERVAL '90 days';
```

---

## Examples

### Example 1: High-Evidence Validation Rule

**Scenario**: Multiple retrospectives identify schema validation gaps.

```sql
-- Three retrospectives report schema issues
-- Trigger consolidates them:
SELECT * FROM protocol_improvement_queue
WHERE description LIKE '%schema validation%';

-- Result:
-- evidence_count: 3
-- improvement_type: VALIDATION_RULE
-- target_table: leo_validation_rules
-- status: PENDING
```

**Action**: Approve and apply validation rule to `leo_validation_rules` table.

### Example 2: Checklist Item Addition

**Scenario**: Retrospective identifies missing RLS verification step.

```sql
-- Retrospective contains:
protocol_improvements: [{
  category: 'checklist',
  improvement: 'Verify RLS policies allow operation before INSERT',
  affected_phase: 'EXEC'
}]

-- Extracted to queue:
INSERT INTO protocol_improvement_queue (
  improvement_type: 'CHECKLIST_ITEM',
  target_table: 'leo_protocol_sections',
  auto_applicable: true  -- Checklist items can be auto-applied
)
```

**Action**: Auto-apply to EXEC phase checklist in `leo_protocol_sections`.

### Example 3: Cross-Phase Pattern

**Scenario**: Issue appears in both LEAD→PLAN and PLAN→EXEC retrospectives.

```sql
-- Query shows:
SELECT * FROM v_pending_improvements
WHERE 'LEAD_TO_PLAN' = ANY(seen_in_phases)
  AND 'PLAN_TO_EXEC' = ANY(seen_in_phases);

-- Result:
-- target_phase: 'ALL'
-- evidence_count: 5
-- seen_in_phases: ['LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'SD_COMPLETION']
```

**Action**: High priority - affects multiple phases. Apply to ALL phases.

---

## Best Practices

### 1. Evidence Thresholds

- **Evidence = 1**: Monitor, may be one-off
- **Evidence = 2-3**: Review for pattern validity
- **Evidence ≥ 3**: Strong signal, prioritize
- **Evidence ≥ 5**: Critical pattern, immediate action

### 2. Improvement Types

| Type | Auto-Apply? | Review Required | Target Table |
|------|-------------|-----------------|--------------|
| VALIDATION_RULE | No | Yes (high impact) | leo_validation_rules |
| CHECKLIST_ITEM | Yes | Optional | leo_protocol_sections |
| SKILL_UPDATE | No | Yes (affects external) | leo_protocol_sections |
| PROTOCOL_SECTION | No | Yes (documentation) | leo_protocol_sections |
| SUB_AGENT_CONFIG | No | Yes (high impact) | leo_sub_agents |

### 3. Payload Structure

Always include:
- **What** to change (specific field/value)
- **Where** to change it (table, record key)
- **Why** change is needed (evidence)
- **Expected impact** (HIGH, MEDIUM, LOW)

Example:
```json
{
  "rule_id": "PLAN-VAL-006",
  "rule_name": "Database Schema Validation",
  "phase": "PLAN",
  "validation_query": "SELECT ...",
  "evidence": "SD-1A, SD-041C, SD-VWC-PRESETS-001",
  "impact": "HIGH"
}
```

### 4. Status Transitions

Valid transitions:
```
PENDING → APPROVED → APPLIED
PENDING → REJECTED
PENDING → SUPERSEDED
APPROVED → SUPERSEDED
```

Invalid transitions:
```
APPLIED → PENDING (use new entry instead)
REJECTED → APPROVED (use new entry instead)
```

---

## Troubleshooting

### Issue: Trigger Not Extracting Improvements

**Check**:
```sql
-- Verify trigger exists
SELECT * FROM information_schema.triggers
WHERE event_object_table = 'retrospectives'
  AND trigger_name = 'extract_improvements_trigger';

-- Test manually
SELECT extract_protocol_improvements_from_retro()
FROM retrospectives
WHERE id = '<retro_id>';
```

### Issue: Duplicate Improvements Not Consolidating

**Solution**:
```sql
-- Run consolidation manually
SELECT * FROM consolidate_similar_improvements();

-- Check for exact string matches
SELECT description, COUNT(*) as duplicates
FROM protocol_improvement_queue
WHERE status = 'PENDING'
GROUP BY description
HAVING COUNT(*) > 1;
```

### Issue: Pre-Handoff Warnings Not Showing

**Check**:
```sql
-- Verify function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_pre_handoff_warnings';

-- Test directly
SELECT * FROM get_pre_handoff_warnings('LEAD_TO_PLAN');
```

---

## Future Enhancements

### Phase 2: AI-Powered Suggestions

- Use OpenAI embeddings to match improvements to relevant protocol sections
- Auto-suggest similar historical improvements
- Predict effectiveness score based on historical data

### Phase 3: Automated Application

- For low-risk improvements (checklist items), auto-apply after approval
- Create database triggers that enforce new validation rules
- Generate pull requests for protocol documentation updates

### Phase 4: Dashboard Integration

- Visual workflow for reviewing/approving improvements
- Effectiveness dashboards with charts
- Real-time notifications for high-evidence patterns

---

## References

- **Migration File**: `database/migrations/20251210_retrospective_self_improvement_system.sql`
- **Verification Script**: `scripts/verify-self-improvement-migration.js`
- **Related Tables**: `retrospectives`, `issue_patterns`, `leo_validation_rules`
- **Related Scripts**: `scripts/handoff.js`, `scripts/generate-retrospective.js`

---

**Last Updated**: 2025-12-10
**Status**: Ready for deployment
**Next Review**: After 10 retrospectives processed
