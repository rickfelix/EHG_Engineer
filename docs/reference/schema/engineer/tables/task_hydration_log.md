# task_hydration_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T15:40:00.276Z
**Rows**: 1,817
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| track | `text` | **NO** | - | - |
| tasks_created | `integer(32)` | **NO** | `0` | - |
| task_ids | `ARRAY` | YES | `'{}'::text[]` | - |
| template_version | `text` | YES | `'1.0'::text` | - |
| variables_used | `jsonb` | YES | `'{}'::jsonb` | - |
| escalated | `boolean` | YES | `false` | - |
| escalation_reason | `text` | YES | - | - |
| hydrated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `task_hydration_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `task_hydration_log_sd_id_fkey`: sd_id → strategic_directives_v2(uuid_id)

## Indexes

- `idx_hydration_log_phase`
  ```sql
  CREATE INDEX idx_hydration_log_phase ON public.task_hydration_log USING btree (phase)
  ```
- `idx_hydration_log_sd_id`
  ```sql
  CREATE INDEX idx_hydration_log_sd_id ON public.task_hydration_log USING btree (sd_id)
  ```
- `task_hydration_log_pkey`
  ```sql
  CREATE UNIQUE INDEX task_hydration_log_pkey ON public.task_hydration_log USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_task_hydration_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_task_hydration_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
