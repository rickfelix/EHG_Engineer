# stitch_generation_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-18T11:37:59.183Z
**Rows**: 16
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| screen_name | `text` | **NO** | - | - |
| device_type | `text` | **NO** | - | - |
| prompt_char_count | `integer(32)` | YES | - | - |
| prompt_hash | `text` | YES | - | - |
| status | `text` | **NO** | - | - |
| attempt_count | `integer(32)` | **NO** | `1` | - |
| duration_ms | `integer(32)` | YES | - | - |
| error_category | `text` | YES | - | - |
| error_message | `text` | YES | - | - |
| sdk_version | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stitch_generation_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stitch_generation_metrics_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `stitch_generation_metrics_status_check`: CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'fired'::text, 'confirmed'::text])))

## Indexes

- `idx_stitch_gen_metrics_status`
  ```sql
  CREATE INDEX idx_stitch_gen_metrics_status ON public.stitch_generation_metrics USING btree (status, created_at DESC)
  ```
- `idx_stitch_gen_metrics_venture_created`
  ```sql
  CREATE INDEX idx_stitch_gen_metrics_venture_created ON public.stitch_generation_metrics USING btree (venture_id, created_at DESC)
  ```
- `stitch_generation_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX stitch_generation_metrics_pkey ON public.stitch_generation_metrics USING btree (id)
  ```

## RLS Policies

### 1. authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
