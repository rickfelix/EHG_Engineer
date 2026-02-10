# sd_exec_file_operations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T05:38:09.001Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| operation_type | `character varying(20)` | **NO** | - | - |
| file_path | `text` | **NO** | - | - |
| commit_hash | `character varying(40)` | YES | - | - |
| commit_message | `text` | YES | - | - |
| deliverable_id | `uuid` | YES | - | - |
| user_story_id | `uuid` | YES | - | - |
| matched_by | `character varying(50)` | YES | - | How the file operation was matched to a deliverable: manual, pattern matching, commit message parsing, or Claude hook |
| match_confidence | `integer(32)` | YES | `0` | Confidence score 0-100 for automatic matches |
| operation_timestamp | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sd_exec_file_operations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_exec_file_operations_deliverable_id_fkey`: deliverable_id → sd_scope_deliverables(id)
- `sd_exec_file_operations_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `sd_exec_file_operations_user_story_id_fkey`: user_story_id → user_stories(id)

### Check Constraints
- `sd_exec_file_operations_match_confidence_check`: CHECK (((match_confidence >= 0) AND (match_confidence <= 100)))
- `sd_exec_file_operations_matched_by_check`: CHECK (((matched_by)::text = ANY ((ARRAY['manual'::character varying, 'pattern'::character varying, 'commit_message'::character varying, 'hook'::character varying, 'unmatched'::character varying])::text[])))
- `sd_exec_file_operations_operation_type_check`: CHECK (((operation_type)::text = ANY ((ARRAY['create'::character varying, 'modify'::character varying, 'delete'::character varying, 'rename'::character varying])::text[])))

## Indexes

- `idx_exec_file_ops_commit`
  ```sql
  CREATE INDEX idx_exec_file_ops_commit ON public.sd_exec_file_operations USING btree (commit_hash)
  ```
- `idx_exec_file_ops_deliverable`
  ```sql
  CREATE INDEX idx_exec_file_ops_deliverable ON public.sd_exec_file_operations USING btree (deliverable_id)
  ```
- `idx_exec_file_ops_path`
  ```sql
  CREATE INDEX idx_exec_file_ops_path ON public.sd_exec_file_operations USING btree (file_path)
  ```
- `idx_exec_file_ops_sd`
  ```sql
  CREATE INDEX idx_exec_file_ops_sd ON public.sd_exec_file_operations USING btree (sd_id)
  ```
- `idx_exec_file_ops_story`
  ```sql
  CREATE INDEX idx_exec_file_ops_story ON public.sd_exec_file_operations USING btree (user_story_id)
  ```
- `sd_exec_file_operations_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_exec_file_operations_pkey ON public.sd_exec_file_operations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_insert_sd_exec_file_operations (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. authenticated_read_sd_exec_file_operations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. authenticated_update_sd_exec_file_operations (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. service_role_all_sd_exec_file_operations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
