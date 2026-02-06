# sd_corrections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:09:28.771Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| wall_name | `text` | **NO** | - | - |
| new_wall_name | `text` | **NO** | - | - |
| correction_type | `text` | **NO** | - | - |
| reason | `text` | **NO** | - | - |
| from_phase | `text` | **NO** | - | - |
| to_phase | `text` | **NO** | - | - |
| paused_tasks | `ARRAY` | YES | `'{}'::text[]` | - |
| status | `text` | YES | `'in_progress'::text` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_corrections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_corrections_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

### Check Constraints
- `sd_corrections_correction_type_check`: CHECK ((correction_type = ANY (ARRAY['prd_scope_change'::text, 'implementation_rework'::text, 'design_revision'::text, 'requirements_change'::text, 'architecture_update'::text])))
- `sd_corrections_status_check`: CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])))

## Indexes

- `idx_corrections_sd_id`
  ```sql
  CREATE INDEX idx_corrections_sd_id ON public.sd_corrections USING btree (sd_id)
  ```
- `idx_corrections_status`
  ```sql
  CREATE INDEX idx_corrections_status ON public.sd_corrections USING btree (status)
  ```
- `sd_corrections_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_corrections_pkey ON public.sd_corrections USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to sd_corrections (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
