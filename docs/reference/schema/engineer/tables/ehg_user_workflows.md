# ehg_user_workflows Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| workflow_name | `text` | **NO** | - | - |
| workflow_code | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| user_persona | `text` | YES | - | - |
| entry_points | `ARRAY` | YES | - | - |
| workflow_steps | `jsonb` | YES | - | - |
| exit_points | `ARRAY` | YES | - | - |
| related_features | `ARRAY` | YES | - | - |
| ui_components_involved | `ARRAY` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_user_workflows_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `ehg_user_workflows_workflow_code_key`: UNIQUE (workflow_code)
- `ehg_user_workflows_workflow_name_key`: UNIQUE (workflow_name)

## Indexes

- `ehg_user_workflows_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_user_workflows_pkey ON public.ehg_user_workflows USING btree (id)
  ```
- `ehg_user_workflows_workflow_code_key`
  ```sql
  CREATE UNIQUE INDEX ehg_user_workflows_workflow_code_key ON public.ehg_user_workflows USING btree (workflow_code)
  ```
- `ehg_user_workflows_workflow_name_key`
  ```sql
  CREATE UNIQUE INDEX ehg_user_workflows_workflow_name_key ON public.ehg_user_workflows USING btree (workflow_name)
  ```
- `idx_user_workflows_code`
  ```sql
  CREATE INDEX idx_user_workflows_code ON public.ehg_user_workflows USING btree (workflow_code)
  ```

## RLS Policies

### 1. Allow read access to user workflows (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
