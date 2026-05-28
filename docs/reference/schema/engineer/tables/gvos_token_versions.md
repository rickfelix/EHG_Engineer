# gvos_token_versions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-28T13:36:48.100Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| token_id | `uuid` | **NO** | - | - |
| version_major | `integer(32)` | **NO** | - | - |
| version_minor | `integer(32)` | **NO** | - | - |
| version_patch | `integer(32)` | **NO** | - | - |
| snapshot | `jsonb` | **NO** | - | Full JSONB snapshot of the gvos_tokens row at the time of the version change. Used by locked_prompt_snapshot composer reads to reproduce historical token state. |
| changed_at | `timestamp with time zone` | **NO** | `now()` | - |
| changed_by | `text` | **NO** | `'system'::text` | Free-text identifier of the writer (service-role caller or chairman email). Default 'system' for migration-time seed inserts. |
| change_summary | `text` | YES | - | - |

## Constraints

### Primary Key
- `gvos_token_versions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `gvos_token_versions_token_id_fkey`: token_id → gvos_tokens(id)

### Unique Constraints
- `gvos_token_versions_token_id_version_major_version_minor_ve_key`: UNIQUE (token_id, version_major, version_minor, version_patch)

### Check Constraints
- `gvos_token_versions_version_major_check`: CHECK ((version_major >= 0))
- `gvos_token_versions_version_minor_check`: CHECK ((version_minor >= 0))
- `gvos_token_versions_version_patch_check`: CHECK ((version_patch >= 0))

## Indexes

- `gvos_token_versions_pkey`
  ```sql
  CREATE UNIQUE INDEX gvos_token_versions_pkey ON public.gvos_token_versions USING btree (id)
  ```
- `gvos_token_versions_token_id_version_major_version_minor_ve_key`
  ```sql
  CREATE UNIQUE INDEX gvos_token_versions_token_id_version_major_version_minor_ve_key ON public.gvos_token_versions USING btree (token_id, version_major, version_minor, version_patch)
  ```
- `idx_gvos_token_versions_changed_at`
  ```sql
  CREATE INDEX idx_gvos_token_versions_changed_at ON public.gvos_token_versions USING btree (changed_at DESC)
  ```
- `idx_gvos_token_versions_token_id`
  ```sql
  CREATE INDEX idx_gvos_token_versions_token_id ON public.gvos_token_versions USING btree (token_id)
  ```

## RLS Policies

### 1. gvos_token_versions_insert_admin (INSERT)

- **Roles**: {authenticated,service_role}
- **With Check**: `is_leo_admin()`

### 2. gvos_token_versions_select_service_role (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### gvos_token_versions_block_delete_trigger

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION gvos_token_versions_block_mutation()`

### gvos_token_versions_block_update_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION gvos_token_versions_block_mutation()`

---

[← Back to Schema Overview](../database-schema-overview.md)
