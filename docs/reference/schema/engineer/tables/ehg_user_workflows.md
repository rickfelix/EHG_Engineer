# ehg_user_workflows Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

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

### 2. Allow service_role to manage ehg_user_workflows (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
