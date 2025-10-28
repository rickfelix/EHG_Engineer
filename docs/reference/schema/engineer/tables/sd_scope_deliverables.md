# sd_scope_deliverables Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| deliverable_type | `character varying(50)` | YES | - | Classification of deliverable for filtering and reporting |
| deliverable_name | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| extracted_from | `text` | YES | - | Source location in scope document for traceability |
| priority | `character varying(20)` | YES | `'required'::character varying` | Required deliverables block SD completion, optional do not |
| completion_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| completion_evidence | `text` | YES | - | Link to proof of completion (commit hash, file path, URL, screenshot) |
| completion_notes | `text` | YES | - | - |
| verified_by | `character varying(20)` | YES | - | Agent or sub-agent that verified the deliverable completion |
| verified_at | `timestamp with time zone` | YES | - | - |
| verification_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | `'SYSTEM'::character varying` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sd_scope_deliverables_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_scope_deliverables_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_scope_deliverables_completion_status_check`: CHECK (((completion_status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'skipped'::character varying, 'blocked'::character varying])::text[])))
- `sd_scope_deliverables_deliverable_type_check`: CHECK (((deliverable_type)::text = ANY ((ARRAY['database'::character varying, 'ui_feature'::character varying, 'api'::character varying, 'documentation'::character varying, 'configuration'::character varying, 'test'::character varying, 'migration'::character varying, 'integration'::character varying, 'other'::character varying])::text[])))
- `sd_scope_deliverables_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['required'::character varying, 'optional'::character varying, 'nice_to_have'::character varying])::text[])))
- `sd_scope_deliverables_verified_by_check`: CHECK (((verified_by)::text = ANY ((ARRAY['EXEC'::character varying, 'PLAN'::character varying, 'LEAD'::character varying, 'QA_DIRECTOR'::character varying, 'DATABASE_ARCHITECT'::character varying, 'DESIGN_AGENT'::character varying])::text[])))

## Indexes

- `idx_scope_deliverables_sd`
  ```sql
  CREATE INDEX idx_scope_deliverables_sd ON public.sd_scope_deliverables USING btree (sd_id)
  ```
- `idx_scope_deliverables_status`
  ```sql
  CREATE INDEX idx_scope_deliverables_status ON public.sd_scope_deliverables USING btree (completion_status)
  ```
- `idx_scope_deliverables_type`
  ```sql
  CREATE INDEX idx_scope_deliverables_type ON public.sd_scope_deliverables USING btree (deliverable_type)
  ```
- `idx_scope_deliverables_verified`
  ```sql
  CREATE INDEX idx_scope_deliverables_verified ON public.sd_scope_deliverables USING btree (verified_by, verified_at)
  ```
- `sd_scope_deliverables_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_scope_deliverables_pkey ON public.sd_scope_deliverables USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_scope_deliverables (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_scope_deliverables (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_sd_scope_deliverables_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_deliverables_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
