# sd_backlog_map Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T16:28:26.191Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (33 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| sd_id | `character varying(100)` | **NO** | - | - |
| backlog_id | `character varying(100)` | **NO** | - | - |
| backlog_title | `character varying(500)` | YES | - | - |
| description_raw | `text` | YES | - | - |
| item_description | `text` | YES | - | - |
| my_comments | `text` | YES | - | - |
| priority | `character varying(20)` | YES | - | - |
| stage_number | `integer(32)` | YES | - | - |
| phase | `character varying(50)` | YES | - | - |
| new_module | `boolean` | YES | `false` | - |
| extras | `jsonb` | YES | `'{}'::jsonb` | - |
| import_run_id | `uuid` | YES | - | - |
| present_in_latest_import | `boolean` | YES | `false` | - |
| item_type | `text` | YES | `'story'::text` | - |
| parent_id | `text` | YES | - | - |
| sequence_no | `integer(32)` | YES | - | - |
| story_key | `text` | YES | - | - |
| story_title | `text` | YES | - | - |
| story_description | `text` | YES | - | - |
| verification_status | `text` | YES | `'not_run'::text` | - |
| verification_source | `jsonb` | YES | - | - |
| last_verified_at | `timestamp with time zone` | YES | - | - |
| coverage_pct | `integer(32)` | YES | - | - |
| test_file_path | `text` | YES | - | - |
| acceptance_criteria | `jsonb` | YES | - | - |
| story_import_run_id | `uuid` | YES | `gen_random_uuid()` | - |
| completion_status | `text` | YES | `'NOT_STARTED'::text` | - |
| completed_by_sd | `text` | YES | - | - |
| completed_by_prd | `text` | YES | - | - |
| completion_date | `timestamp without time zone` | YES | - | - |
| completion_reference | `text` | YES | - | - |
| utilized_from_sd | `text` | YES | - | - |
| completion_notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `sd_backlog_map_pkey`: PRIMARY KEY (sd_id, backlog_id)

### Foreign Keys
- `sd_backlog_map_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_backlog_map_unique_sd_backlog`: UNIQUE (sd_id, backlog_id)

### Check Constraints
- `sd_backlog_map_completion_status_check`: CHECK ((completion_status = ANY (ARRAY['NOT_STARTED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'UTILIZED_ELSEWHERE'::text, 'DEFERRED'::text, 'CANCELLED'::text])))
- `sd_backlog_map_coverage_pct_check`: CHECK (((coverage_pct >= 0) AND (coverage_pct <= 100)))
- `sd_backlog_map_item_type_check`: CHECK ((item_type = ANY (ARRAY['epic'::text, 'story'::text, 'task'::text])))
- `sd_backlog_map_verification_status_check`: CHECK ((verification_status = ANY (ARRAY['not_run'::text, 'failing'::text, 'passing'::text])))

## Indexes

- `idx_backlog_completed_by`
  ```sql
  CREATE INDEX idx_backlog_completed_by ON public.sd_backlog_map USING btree (completed_by_sd)
  ```
- `idx_backlog_completion_status`
  ```sql
  CREATE INDEX idx_backlog_completion_status ON public.sd_backlog_map USING btree (completion_status)
  ```
- `idx_sd_backlog_map_completion`
  ```sql
  CREATE INDEX idx_sd_backlog_map_completion ON public.sd_backlog_map USING btree (completion_status)
  ```
- `idx_sd_backlog_map_priority`
  ```sql
  CREATE INDEX idx_sd_backlog_map_priority ON public.sd_backlog_map USING btree (priority)
  ```
- `idx_sd_backlog_map_sd_id`
  ```sql
  CREATE INDEX idx_sd_backlog_map_sd_id ON public.sd_backlog_map USING btree (sd_id)
  ```
- `idx_sd_backlog_story_key`
  ```sql
  CREATE INDEX idx_sd_backlog_story_key ON public.sd_backlog_map USING btree (story_key)
  ```
- `idx_sd_backlog_verification`
  ```sql
  CREATE INDEX idx_sd_backlog_verification ON public.sd_backlog_map USING btree (sd_id, verification_status) WHERE (story_key IS NOT NULL)
  ```
- `idx_sd_map_import`
  ```sql
  CREATE INDEX idx_sd_map_import ON public.sd_backlog_map USING btree (import_run_id)
  ```
- `idx_sd_map_import_run`
  ```sql
  CREATE INDEX idx_sd_map_import_run ON public.sd_backlog_map USING btree (import_run_id)
  ```
- `idx_sd_map_latest`
  ```sql
  CREATE INDEX idx_sd_map_latest ON public.sd_backlog_map USING btree (present_in_latest_import)
  ```
- `idx_sd_map_sd`
  ```sql
  CREATE INDEX idx_sd_map_sd ON public.sd_backlog_map USING btree (sd_id)
  ```
- `sd_backlog_map_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_backlog_map_pkey ON public.sd_backlog_map USING btree (sd_id, backlog_id)
  ```
- `sd_backlog_map_unique_sd_backlog`
  ```sql
  CREATE UNIQUE INDEX sd_backlog_map_unique_sd_backlog ON public.sd_backlog_map USING btree (sd_id, backlog_id)
  ```

## RLS Policies

### 1. authenticated_read_sd_backlog_map (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_backlog_map (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
