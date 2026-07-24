# coverage_matrix Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 918
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| surface_class | `text` | **NO** | - | - |
| surface_key | `text` | **NO** | - | - |
| checker_ids | `jsonb` | **NO** | `'[]'::jsonb` | - |
| status | `text` | **NO** | `'unchecked'::text` | - |
| is_active | `boolean` | **NO** | `true` | - |
| first_seen_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_verified_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `coverage_matrix_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `coverage_matrix_surface_class_surface_key_key`: UNIQUE (surface_class, surface_key)

### Check Constraints
- `coverage_matrix_status_check`: CHECK ((status = ANY (ARRAY['unchecked'::text, 'covered'::text, 'stale'::text, 'pending_dependency'::text])))
- `coverage_matrix_surface_class_check`: CHECK ((surface_class = ANY (ARRAY['db_table'::text, 'message_lane'::text, 'application'::text, 'work_item_type'::text, 'institutional_memory'::text, 'periodic_process'::text, 'external_channel'::text])))

## Indexes

- `coverage_matrix_pkey`
  ```sql
  CREATE UNIQUE INDEX coverage_matrix_pkey ON public.coverage_matrix USING btree (id)
  ```
- `coverage_matrix_surface_class_surface_key_key`
  ```sql
  CREATE UNIQUE INDEX coverage_matrix_surface_class_surface_key_key ON public.coverage_matrix USING btree (surface_class, surface_key)
  ```
- `idx_coverage_matrix_status`
  ```sql
  CREATE INDEX idx_coverage_matrix_status ON public.coverage_matrix USING btree (status)
  ```
- `idx_coverage_matrix_surface_class`
  ```sql
  CREATE INDEX idx_coverage_matrix_surface_class ON public.coverage_matrix USING btree (surface_class)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
