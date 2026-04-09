# okr_generation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T15:59:50.388Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| generation_date | `date` | **NO** | - | - |
| period | `text` | **NO** | - | - |
| vision_id | `uuid` | YES | - | - |
| top_down_count | `integer(32)` | **NO** | `0` | - |
| bottom_up_count | `integer(32)` | **NO** | `0` | - |
| total_krs_generated | `integer(32)` | **NO** | `0` | - |
| top_down_ratio | `numeric(3,2)` | YES | `0.40` | - |
| bottom_up_ratio | `numeric(3,2)` | YES | `0.60` | - |
| source_breakdown | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | YES | `'completed'::text` | - |
| error_message | `text` | YES | - | - |
| created_by | `text` | YES | `'eva-scheduler'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `okr_generation_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `okr_generation_log_vision_id_fkey`: vision_id → strategic_vision(id)

### Check Constraints
- `okr_generation_log_status_check`: CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_okr_gen_log_date`
  ```sql
  CREATE INDEX idx_okr_gen_log_date ON public.okr_generation_log USING btree (generation_date)
  ```
- `idx_okr_gen_log_period`
  ```sql
  CREATE INDEX idx_okr_gen_log_period ON public.okr_generation_log USING btree (period)
  ```
- `okr_generation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX okr_generation_log_pkey ON public.okr_generation_log USING btree (id)
  ```

## RLS Policies

### 1. Authenticated read on okr_generation_log (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. service_role_insert_okr_generation_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. service_role_select_okr_generation_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
