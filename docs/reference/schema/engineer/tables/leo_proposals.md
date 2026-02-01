# leo_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T11:57:53.424Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| owner_team | `text` | **NO** | `'ehg_engineer'::text` | - |
| title | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| motivation | `text` | **NO** | - | - |
| scope | `jsonb` | **NO** | `'[]'::jsonb` | - |
| affected_components | `jsonb` | **NO** | `'[]'::jsonb` | - |
| risk_level | `text` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| constitution_tags | `jsonb` | **NO** | `'[]'::jsonb` | - |
| aegis_compliance_notes | `text` | YES | - | - |
| rubric_version_id | `uuid` | YES | - | - |
| rubric_snapshot | `jsonb` | YES | - | - |
| prioritization_snapshot | `jsonb` | YES | - | - |
| audit_snapshot | `jsonb` | YES | - | - |
| feature_flag_key | `text` | YES | - | - |
| decision_reason | `text` | YES | - | - |
| decision_by | `uuid` | YES | - | - |
| decision_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_proposals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_leo_proposals_rubric`: rubric_version_id → leo_vetting_rubrics(id)

### Check Constraints
- `leo_proposals_risk_level_check`: CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
- `leo_proposals_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'triaged'::text, 'vetting'::text, 'approved'::text, 'rejected'::text, 'scheduled'::text, 'in_progress'::text, 'completed'::text, 'rolled_back'::text, 'archived'::text])))

## Indexes

- `idx_leo_proposals_constitution_tags`
  ```sql
  CREATE INDEX idx_leo_proposals_constitution_tags ON public.leo_proposals USING gin (constitution_tags)
  ```
- `idx_leo_proposals_created_by`
  ```sql
  CREATE INDEX idx_leo_proposals_created_by ON public.leo_proposals USING btree (created_by, created_at DESC)
  ```
- `idx_leo_proposals_status_created`
  ```sql
  CREATE INDEX idx_leo_proposals_status_created ON public.leo_proposals USING btree (status, created_at DESC)
  ```
- `leo_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_proposals_pkey ON public.leo_proposals USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to leo_proposals (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_proposals_update_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_proposals_update_timestamp()`

### trg_leo_proposals_validate_transition

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_proposals_validate_transition()`

### trg_leo_proposals_validate_transition

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_proposals_validate_transition()`

---

[← Back to Schema Overview](../database-schema-overview.md)
