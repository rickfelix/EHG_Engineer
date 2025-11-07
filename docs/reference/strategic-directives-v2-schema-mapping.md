# Strategic Directives v2 Schema Mapping Reference

**Purpose**: Quick reference for mapping field names when creating Strategic Directives
**Use Case**: Prevents schema mismatch errors when writing SQL or scripts
**Last Updated**: 2025-11-03

---

## Critical Required Fields (NOT NULL)

These fields MUST be provided or have defaults:

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | varchar(50) | ✅ YES | - | **PRIMARY KEY** - Format: SD-{CATEGORY}-{NUMBER} |
| `sd_key` | text | ✅ YES | - | **UNIQUE** - Usually same as `id` |
| `title` | varchar(500) | ✅ YES | - | Brief descriptive title (max 500 chars) |
| `category` | varchar(50) | ✅ YES | - | e.g., 'feature', 'infrastructure', 'enhancement' |
| `priority` | varchar(20) | ✅ YES | - | **lowercase**: 'critical', 'high', 'medium', 'low' |
| `status` | varchar(50) | ✅ YES | - | **lowercase**: 'draft', 'active', 'in_progress', 'completed' |
| `description` | text | ✅ YES | - | Main body text explaining the directive |
| `rationale` | text | ✅ YES | - | Business case and justification |
| `scope` | text | ✅ YES | - | What's included/excluded |
| `version` | varchar(20) | ✅ YES | '1.0' | Semantic version (has default) |
| `sequence_rank` | integer | ✅ YES | auto | Auto-assigned by trigger |
| `sd_type` | varchar(50) | ✅ YES | 'feature' | Type classification (has default) |
| `uuid_id` | uuid | ✅ YES | gen_random_uuid() | Auto-generated UUID |

---

## Common Field Name Changes (v1 → v2)

⚠️ **These are the most common mistakes**:

| Old Name (v1) | New Name (v2) | Type Change | Notes |
|--------------|--------------|-------------|-------|
| `key` | `id` | - | `id` is PRIMARY KEY in v2 |
| - | `sd_key` | NEW FIELD | Required UNIQUE field (usually = `id`) |
| `outcomes` | `success_criteria` | JSONB array | Structure changed |
| `kpis` | `success_metrics` | JSONB object | Structure changed (nested) |
| `acceptance_criteria` | `success_criteria` | Same field | JSONB array format |
| `tags` | (removed) | - | Not in v2 schema |
| `target_release` | (removed) | - | Not in v2 schema |
| `progress` | `progress_percentage` | - | `progress` deprecated but kept |

---

## JSONB Field Structures

### success_criteria (JSONB Array)

**Type**: Array of objects
**Example**:
```json
[
  {
    "id": "SC-001",
    "criterion": "User completes wizard successfully",
    "measure": "E2E test verifies 100% completion rate",
    "priority": "CRITICAL"
  }
]
```

### risks (JSONB Array)

**Type**: Array of objects
**Example**:
```json
[
  {
    "risk": "Data migration failures",
    "severity": "high",
    "probability": "medium",
    "mitigation": "Comprehensive rollback plan",
    "owner": "DATABASE"
  }
]
```

### dependencies (JSONB Array)

**Type**: Array of objects
**Example**:
```json
[
  {
    "dependency": "Existing validation framework",
    "type": "technical",
    "status": "ready",
    "notes": "Available, needs extension"
  }
]
```

### success_metrics (JSONB Object - NESTED!)

**Type**: Object with nested structure
**Example**:
```json
{
  "implementation": {
    "target_completion": "8 weeks",
    "total_effort_hours": 144
  },
  "quality": {
    "test_coverage": "100%",
    "zero_data_loss": true
  },
  "business": {
    "roi": "Positive within 6 months"
  }
}
```

### stakeholders (JSONB Array)

**Type**: Array of objects
**Example**:
```json
[
  {
    "name": "Chairman",
    "role": "Executive Sponsor",
    "involvement": "Final sign-off",
    "contact": "Primary stakeholder"
  }
]
```

---

## CHECK Constraints (Enum Values)

⚠️ **Case-sensitive!** Use lowercase values.

### priority
```sql
CHECK ((priority)::text = ANY ((ARRAY[
  'critical',
  'high',
  'medium',
  'low'
])::text[]))
```

### status
```sql
CHECK ((status)::text = ANY ((ARRAY[
  'draft',
  'in_progress',
  'active',
  'pending_approval',
  'completed',
  'deferred',
  'cancelled'
])::text[]))
```

### sd_type
```sql
CHECK ((sd_type)::text = ANY ((ARRAY[
  'feature',
  'infrastructure',
  'database',
  'security',
  'documentation'
])::text[]))
```

### target_application
```sql
CHECK ((target_application)::text = ANY ((ARRAY[
  'EHG',
  'EHG_Engineer'
])::text[]))
```

---

## Optional But Recommended Fields

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `strategic_intent` | text | High-level business objective | Strategic alignment explanation |
| `key_changes` | jsonb | Array of major changes | `[{ change: "...", impact: "..." }]` |
| `strategic_objectives` | jsonb | Specific objectives | `[{ objective: "...", metric: "..." }]` |
| `key_principles` | jsonb | Guiding principles | `[{ principle: "...", description: "..." }]` |
| `implementation_guidelines` | jsonb | EXEC phase guidelines | `[{ guideline: "...", rationale: "..." }]` |
| `metadata` | jsonb | Custom fields | Flexible object structure |
| `target_application` | varchar(20) | Which app | 'EHG' or 'EHG_Engineer' (default: 'EHG') |
| `current_phase` | text | LEO Protocol phase | Default: 'LEAD_APPROVAL' |
| `created_by` | varchar(100) | Who created it | 'human:Chairman' or 'LEAD' |

---

## Workflow Fields (Auto-Managed)

These are typically set by the system:

| Column | Purpose | Initial Value |
|--------|---------|---------------|
| `current_phase` | LEO Protocol workflow phase | 'LEAD_APPROVAL' |
| `progress_percentage` | Overall completion (0-100) | 0 |
| `phase_progress` | Progress within current phase | 0 |
| `is_working_on` | Agent actively working flag | false |
| `confidence_score` | Quality score from sub-agents | NULL |
| `checkpoint_plan` | BMAD checkpoint breakdown | NULL |

---

## RLS Policies

| Policy | Roles | Operations | Notes |
|--------|-------|------------|-------|
| `service_role_all_strategic_directives_v2` | service_role | ALL | Full access with SERVICE_ROLE_KEY |
| `authenticated_read_strategic_directives_v2` | authenticated | SELECT | Read-only for authenticated users |

**For INSERT operations**: Use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Using `key` instead of `id`
```sql
-- WRONG
INSERT INTO strategic_directives_v2 (key, title, ...) VALUES (...);

-- CORRECT
INSERT INTO strategic_directives_v2 (id, sd_key, title, ...) VALUES (...);
```

### ❌ Mistake 2: Uppercase enum values
```sql
-- WRONG
priority: 'CRITICAL'

-- CORRECT
priority: 'critical'
```

### ❌ Mistake 3: Missing sd_key
```sql
-- WRONG
INSERT INTO strategic_directives_v2 (id, title, ...) VALUES (...);
-- ERROR: null value in column 'sd_key' violates not-null constraint

-- CORRECT
INSERT INTO strategic_directives_v2 (id, sd_key, title, ...) VALUES ('SD-XXX-001', 'SD-XXX-001', ...);
```

### ❌ Mistake 4: Wrong JSONB structure for success_metrics
```sql
-- WRONG (array)
success_metrics: [{ metric: "test_coverage", value: "100%" }]

-- CORRECT (nested object)
success_metrics: {
  quality: { test_coverage: "100%" },
  business: { roi: "Positive" }
}
```

### ❌ Mistake 5: Using removed fields
```sql
-- WRONG (fields don't exist in v2)
INSERT INTO strategic_directives_v2 (..., tags, target_release, ...) VALUES (...);

-- CORRECT (use metadata for custom fields)
INSERT INTO strategic_directives_v2 (..., metadata, ...) VALUES (
  ...,
  '{"tags": ["venture-workflow"], "target_release": "2025-Q1"}'::jsonb,
  ...
);
```

---

## Quick Reference SQL Template

```sql
INSERT INTO strategic_directives_v2 (
    id,                    -- PRIMARY KEY
    sd_key,                -- UNIQUE (same as id)
    title,                 -- Required
    category,              -- Required: 'feature', 'infrastructure', etc.
    priority,              -- Required: 'critical', 'high', 'medium', 'low' (lowercase!)
    status,                -- Required: 'draft', 'active', etc. (lowercase!)
    version,               -- Default '1.0'
    sd_type,               -- Default 'feature'
    description,           -- Required
    rationale,             -- Required
    scope,                 -- Required
    strategic_intent,      -- Optional but recommended
    success_criteria,      -- JSONB array
    risks,                 -- JSONB array
    dependencies,          -- JSONB array
    success_metrics,       -- JSONB object (nested!)
    stakeholders,          -- JSONB array
    metadata,              -- JSONB object (custom fields)
    target_application,    -- 'EHG' or 'EHG_Engineer'
    current_phase,         -- Default 'LEAD_APPROVAL'
    created_by             -- Who created it
) VALUES (
    'SD-EXAMPLE-001',      -- id
    'SD-EXAMPLE-001',      -- sd_key
    'Example Strategic Directive',
    'feature',
    'high',                -- lowercase!
    'draft',               -- lowercase!
    '1.0',
    'feature',
    'Description text',
    'Rationale text',
    'Scope text',
    'Strategic intent text',
    '[{"id":"SC-001","criterion":"...","measure":"...","priority":"CRITICAL"}]'::jsonb,
    '[{"risk":"...","severity":"high","probability":"medium","mitigation":"...","owner":"EXEC"}]'::jsonb,
    '[{"dependency":"...","type":"technical","status":"ready","notes":"..."}]'::jsonb,
    '{"implementation":{"target_completion":"8 weeks"},"quality":{"test_coverage":"100%"}}'::jsonb,
    '[{"name":"Chairman","role":"Executive Sponsor","involvement":"...","contact":"..."}]'::jsonb,
    '{}'::jsonb,
    'EHG',
    'LEAD_APPROVAL',
    'human:Chairman'
);
```

---

## Node.js Template (Recommended)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sdData = {
  id: 'SD-EXAMPLE-001',
  sd_key: 'SD-EXAMPLE-001',
  title: 'Example Strategic Directive',
  category: 'feature',
  priority: 'high',        // lowercase!
  status: 'draft',         // lowercase!
  version: '1.0',
  sd_type: 'feature',
  description: 'Description text',
  rationale: 'Rationale text',
  scope: 'Scope text',
  strategic_intent: 'Strategic intent text',
  success_criteria: [
    {
      id: 'SC-001',
      criterion: 'Success criterion',
      measure: 'How to measure',
      priority: 'CRITICAL'
    }
  ],
  risks: [
    {
      risk: 'Risk description',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Mitigation strategy',
      owner: 'EXEC'
    }
  ],
  dependencies: [
    {
      dependency: 'Dependency description',
      type: 'technical',
      status: 'ready',
      notes: 'Additional notes'
    }
  ],
  success_metrics: {
    implementation: {
      target_completion: '8 weeks'
    },
    quality: {
      test_coverage: '100%'
    }
  },
  stakeholders: [
    {
      name: 'Chairman',
      role: 'Executive Sponsor',
      involvement: 'Final sign-off',
      contact: 'Primary stakeholder'
    }
  ],
  metadata: {},
  target_application: 'EHG',
  current_phase: 'LEAD_APPROVAL',
  created_by: 'human:Chairman'
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert(sdData)
  .select();
```

---

## Schema Documentation Locations

**Auto-Generated Schema Docs**:
- Overview: `/docs/reference/schema/engineer/database-schema-overview.md`
- Detailed: `/docs/reference/schema/engineer/tables/strategic_directives_v2.md`

**Regenerate Schema Docs**:
```bash
npm run schema:docs:engineer
```

**Query Database Schema Directly**:
```sql
-- Column names and types
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
ORDER BY ordinal_position;

-- Constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'strategic_directives_v2';

-- CHECK constraint details
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'strategic_directives_v2'::regclass;
```

---

## Related Documentation

- **Database Agent Patterns**: `/docs/reference/database-agent-patterns.md`
- **Unified Handoff System**: `/docs/reference/unified-handoff-system.md`
- **LEO Protocol Workflow**: `/CLAUDE_CORE.md`

---

**Last Updated**: 2025-11-03
**Verified Against**: Supabase production schema (dedlbzhpgkmetvhbkyzq)
**Applies To**: EHG_Engineer database only (not EHG customer database)
