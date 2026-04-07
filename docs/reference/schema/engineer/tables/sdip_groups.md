# sdip_groups Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-07T23:47:56.225Z
**Rows**: 0
**RLS**: Enabled (2 policies)

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

### 1. service_role_insert_sdip_groups (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_sdip_groups (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### update_sdip_groups_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
