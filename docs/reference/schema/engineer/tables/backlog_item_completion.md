# backlog_item_completion Table

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

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| backlog_id | `text` | **NO** | - | - |
| source_sd_id | `text` | **NO** | - | - |
| completed_by_sd_id | `text` | **NO** | - | - |
| completed_by_prd_id | `text` | YES | - | - |
| completion_type | `text` | YES | - | - |
| completion_status | `text` | YES | `'IN_PROGRESS'::text` | - |
| completion_date | `timestamp without time zone` | YES | `now()` | - |
| implementation_details | `jsonb` | YES | `'{}'::jsonb` | - |
| code_location | `ARRAY` | YES | - | - |
| test_coverage_pct | `integer(32)` | YES | - | - |
| documentation_url | `text` | YES | - | - |
| verified | `boolean` | YES | `false` | - |
| verified_by | `text` | YES | - | - |
| verified_at | `timestamp without time zone` | YES | - | - |
| verification_notes | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'PLAN'::text` | - |

## Constraints

### Primary Key
- `backlog_item_completion_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_backlog_completion`: UNIQUE (backlog_id, completed_by_sd_id)

### Check Constraints
- `backlog_item_completion_completion_status_check`: CHECK ((completion_status = ANY (ARRAY['IN_PROGRESS'::text, 'COMPLETED'::text, 'VERIFIED'::text, 'FAILED'::text])))
- `backlog_item_completion_completion_type_check`: CHECK ((completion_type = ANY (ARRAY['DIRECT'::text, 'SHARED'::text, 'PARTIAL'::text, 'REFERENCE'::text, 'SUPERSEDED'::text])))

## Indexes

- `backlog_item_completion_pkey`
  ```sql
  CREATE UNIQUE INDEX backlog_item_completion_pkey ON public.backlog_item_completion USING btree (id)
  ```
- `idx_completion_backlog_id`
  ```sql
  CREATE INDEX idx_completion_backlog_id ON public.backlog_item_completion USING btree (backlog_id)
  ```
- `idx_completion_date`
  ```sql
  CREATE INDEX idx_completion_date ON public.backlog_item_completion USING btree (completion_date DESC)
  ```
- `idx_completion_sd_id`
  ```sql
  CREATE INDEX idx_completion_sd_id ON public.backlog_item_completion USING btree (completed_by_sd_id)
  ```
- `idx_completion_status`
  ```sql
  CREATE INDEX idx_completion_status ON public.backlog_item_completion USING btree (completion_status)
  ```
- `unique_backlog_completion`
  ```sql
  CREATE UNIQUE INDEX unique_backlog_completion ON public.backlog_item_completion USING btree (backlog_id, completed_by_sd_id)
  ```

## RLS Policies

### 1. authenticated_read_backlog_item_completion (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_backlog_item_completion (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
