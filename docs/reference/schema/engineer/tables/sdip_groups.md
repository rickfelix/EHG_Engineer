# sdip_groups Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| group_name | `text` | **NO** | - | - |
| submission_ids | `ARRAY` | **NO** | - | - |
| combined_intent_summary | `text` | YES | - | - |
| combined_synthesis | `jsonb` | YES | - | - |
| combined_client_summary | `text` | YES | - | - |
| validation_complete | `boolean` | YES | `false` | - |
| all_gates_passed | `boolean` | YES | `false` | - |
| final_sd_id | `text` | YES | - | - |
| created_by | `uuid` | **NO** | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sdip_groups_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_groups_created_by`
  ```sql
  CREATE INDEX idx_groups_created_by ON public.sdip_groups USING btree (created_by)
  ```
- `idx_groups_sd_id`
  ```sql
  CREATE INDEX idx_groups_sd_id ON public.sdip_groups USING btree (final_sd_id) WHERE (final_sd_id IS NOT NULL)
  ```
- `idx_sdip_groups_user`
  ```sql
  CREATE INDEX idx_sdip_groups_user ON public.sdip_groups USING btree (created_by)
  ```
- `sdip_groups_pkey`
  ```sql
  CREATE UNIQUE INDEX sdip_groups_pkey ON public.sdip_groups USING btree (id)
  ```

## RLS Policies

### 1. groups_delete_policy (DELETE)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

### 2. groups_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = created_by)`

### 3. groups_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `((auth.uid() = created_by) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'validator'::text, 'system'::text])))`

### 4. groups_update_policy (UPDATE)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = ANY (ARRAY['admin'::text, 'validator'::text]))`

## Triggers

### update_sdip_groups_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
