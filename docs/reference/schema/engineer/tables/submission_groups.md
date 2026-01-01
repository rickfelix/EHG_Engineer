# submission_groups Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T22:19:40.872Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| group_id | `character varying(255)` | **NO** | - | - |
| group_name | `character varying(255)` | **NO** | - | - |
| group_description | `text` | YES | - | - |
| submission_ids | `jsonb` | YES | `'[]'::jsonb` | - |
| metadata | `jsonb` | YES | - | - |
| created_by | `character varying(255)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `submission_groups_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `submission_groups_group_id_key`: UNIQUE (group_id)

## Indexes

- `idx_groups_created`
  ```sql
  CREATE INDEX idx_groups_created ON public.submission_groups USING btree (created_at DESC)
  ```
- `submission_groups_group_id_key`
  ```sql
  CREATE UNIQUE INDEX submission_groups_group_id_key ON public.submission_groups USING btree (group_id)
  ```
- `submission_groups_pkey`
  ```sql
  CREATE UNIQUE INDEX submission_groups_pkey ON public.submission_groups USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_submission_groups (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_submission_groups (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
