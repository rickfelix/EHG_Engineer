# Schema Mapping: leo_handoff_executions → sd_phase_handoffs

**Created**: 2025-10-19
**Purpose**: Document field mapping for data migration
**Source**: leo_handoff_executions (327 records)
**Target**: sd_phase_handoffs (51 records)
**Gap**: 276 records to migrate

---

## Field Mappings

### Direct Mappings (No Transformation)

| Legacy Field | Unified Field | Type | Notes |
|--------------|---------------|------|-------|
| `id` | `id` | UUID | Preserve original UUID |
| `sd_id` | `sd_id` | VARCHAR | Strategic Directive ID |
| `handoff_type` | `handoff_type` | VARCHAR | LEAD-to-PLAN, PLAN-to-EXEC, etc. |
| `status` | `status` | VARCHAR | accepted, rejected, pending |
| `executive_summary` | `executive_summary` | TEXT | Nullable, copy as-is |
| `action_items` | `action_items` | TEXT | JSON array → TEXT conversion |
| `rejection_reason` | `rejection_reason` | TEXT | Nullable, copy as-is |
| `created_at` | `created_at` | TIMESTAMPTZ | Preserve timestamp |
| `accepted_at` | `accepted_at` | TIMESTAMPTZ | Preserve timestamp |
| `created_by` | `created_by` | VARCHAR | Preserve creator |

### Transformations Required

| Legacy Field | Unified Field | Transformation |
|--------------|---------------|----------------|
| `from_agent` | `from_phase` | Direct mapping: LEAD→LEAD, PLAN→PLAN, EXEC→EXEC |
| `to_agent` | `to_phase` | Direct mapping: LEAD→LEAD, PLAN→PLAN, EXEC→EXEC |
| `deliverables_manifest` (JSONB[]) | `deliverables_manifest` (TEXT) | JSON stringify |
| `verification_results` (JSONB) | `completeness_report` (TEXT) | Extract verification details to text |
| `compliance_status` (JSONB) | `known_issues` (TEXT) | Extract compliance issues |
| `quality_metrics` (JSONB) | `resource_utilization` (TEXT) | Extract quality metrics |
| `recommendations` (JSONB[]) | `key_decisions` (TEXT) | Extract recommendations as decisions |

### New Fields (Default Values)

| Unified Field | Default Value | Notes |
|---------------|---------------|-------|
| `rejected_at` | NULL | Not tracked in legacy system |
| `metadata` | {} | Empty JSONB object |

### Deprecated Fields (Not Migrated)

| Legacy Field | Reason |
|--------------|--------|
| `file_path` | No longer used (database-first) |
| `initiated_at` | Redundant with created_at |
| `completed_at` | Redundant with accepted_at |
| `validation_passed` | Replaced by status field |
| `validation_details` | Replaced by completeness_report |
| `validation_score` | Replaced by metadata |
| `prd_id` | Not part of handoff schema |
| `template_id` | Not part of handoff schema |

---

## Data Transformation Examples

### Example 1: from_agent/to_agent → from_phase/to_phase

```sql
-- Legacy
from_agent = 'LEAD'
to_agent = 'PLAN'

-- Unified
from_phase = 'LEAD'
to_phase = 'PLAN'
```

### Example 2: deliverables_manifest (array → text)

```sql
-- Legacy (JSONB array)
deliverables_manifest = []

-- Unified (TEXT)
deliverables_manifest = ''
```

### Example 3: verification_results → completeness_report

```sql
-- Legacy
verification_results = {
  "result": {
    "sdId": "SD-XXX",
    "success": true,
    "qualityScore": 100
  },
  "verifier": "unified-handoff-system.js"
}

-- Unified
completeness_report = 'Verification: SUCCESS, Quality Score: 100, Verifier: unified-handoff-system.js'
```

### Example 4: recommendations → key_decisions

```sql
-- Legacy
recommendations = []

-- Unified
key_decisions = ''
```

---

## Migration Strategy

### Phase 1: Backup (CRITICAL)
```bash
# Backup legacy table
pg_dump -h [HOST] -U [USER] -d [DB] -t leo_handoff_executions > backup_leo_handoff_executions_$(date +%Y%m%d_%H%M%S).sql
```

### Phase 2: Data Migration
```sql
INSERT INTO sd_phase_handoffs (
  id, sd_id, from_phase, to_phase, handoff_type, status,
  executive_summary, deliverables_manifest, key_decisions,
  known_issues, resource_utilization, action_items,
  completeness_report, metadata, rejection_reason,
  created_at, accepted_at, rejected_at, created_by
)
SELECT
  id,
  sd_id,
  from_agent::VARCHAR AS from_phase,
  to_agent::VARCHAR AS to_phase,
  handoff_type,
  status,
  executive_summary,
  COALESCE(deliverables_manifest::TEXT, ''),
  COALESCE(recommendations::TEXT, ''),
  COALESCE(compliance_status::TEXT, ''),
  COALESCE(quality_metrics::TEXT, ''),
  COALESCE(action_items::TEXT, ''),
  COALESCE(verification_results::TEXT, ''),
  '{}'::JSONB AS metadata,
  rejection_reason,
  created_at,
  accepted_at,
  NULL AS rejected_at,
  created_by
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs);
```

### Phase 3: Verification
```sql
-- Count verification
SELECT
  'Legacy' AS source,
  COUNT(*) AS record_count
FROM leo_handoff_executions
UNION ALL
SELECT
  'Unified' AS source,
  COUNT(*) AS record_count
FROM sd_phase_handoffs;

-- Sample verification (10 random records)
SELECT
  l.id,
  l.sd_id,
  l.handoff_type,
  l.from_agent,
  u.from_phase,
  l.to_agent,
  u.to_phase
FROM leo_handoff_executions l
JOIN sd_phase_handoffs u ON l.id = u.id
ORDER BY RANDOM()
LIMIT 10;
```

---

## Rollback Plan

```sql
-- If migration fails, delete migrated records
DELETE FROM sd_phase_handoffs
WHERE created_at >= '[MIGRATION_START_TIME]'
AND id IN (
  SELECT id FROM leo_handoff_executions
);
```

---

## Post-Migration Tasks

1. **Update calculate_sd_progress function** (database/migrations/force_update_with_test.sql:73)
   - Change: `FROM leo_handoff_executions` → `FROM sd_phase_handoffs`

2. **Update scripts** (46 files identified):
   - scripts/unified-handoff-system.js
   - scripts/leo-protocol-orchestrator.js
   - scripts/get-sd-details.js
   - scripts/check-handoff-executions.js
   - scripts/validate-system-consistency.js
   - (See complete list in audit results)

3. **Deprecate legacy table**:
   - Rename: `leo_handoff_executions` → `_deprecated_leo_handoff_executions`
   - Add RLS policy: READ-ONLY access for reference

---

**Migration Author**: EXEC Agent
**SD Reference**: SD-DATA-INTEGRITY-001
**User Story**: SD-DATA-INTEGRITY-001:US-001
