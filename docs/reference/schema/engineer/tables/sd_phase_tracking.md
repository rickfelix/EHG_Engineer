# sd_phase_tracking Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T15:11:07.799Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| phase_name | `text` | **NO** | - | - |
| progress | `integer(32)` | YES | `0` | - |
| is_complete | `boolean` | YES | `false` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_phase_tracking_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_phase_tracking_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_phase_tracking_sd_id_phase_name_key`: UNIQUE (sd_id, phase_name)

### Check Constraints
- `sd_phase_tracking_phase_name_check`: CHECK ((phase_name = ANY (ARRAY['LEAD_APPROVAL'::text, 'PLAN_DESIGN'::text, 'EXEC_IMPLEMENTATION'::text, 'PLAN_VERIFICATION'::text, 'LEAD_FINAL_APPROVAL'::text])))
- `sd_phase_tracking_progress_check`: CHECK (((progress >= 0) AND (progress <= 100)))

## Indexes

- `idx_sd_phase_tracking_is_complete`
  ```sql
  CREATE INDEX idx_sd_phase_tracking_is_complete ON public.sd_phase_tracking USING btree (is_complete)
  ```
- `idx_sd_phase_tracking_phase_name`
  ```sql
  CREATE INDEX idx_sd_phase_tracking_phase_name ON public.sd_phase_tracking USING btree (phase_name)
  ```
- `idx_sd_phase_tracking_sd_id`
  ```sql
  CREATE INDEX idx_sd_phase_tracking_sd_id ON public.sd_phase_tracking USING btree (sd_id)
  ```
- `sd_phase_tracking_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_phase_tracking_pkey ON public.sd_phase_tracking USING btree (id)
  ```
- `sd_phase_tracking_sd_id_phase_name_key`
  ```sql
  CREATE UNIQUE INDEX sd_phase_tracking_sd_id_phase_name_key ON public.sd_phase_tracking USING btree (sd_id, phase_name)
  ```

## RLS Policies

### 1. authenticated_read_sd_phase_tracking (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_phase_tracking (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_sd_progress

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION update_sd_progress_from_phases()`

### trigger_update_sd_progress

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION update_sd_progress_from_phases()`

---

[← Back to Schema Overview](../database-schema-overview.md)
