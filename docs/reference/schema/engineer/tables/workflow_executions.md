# workflow_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T20:12:20.676Z
**Rows**: 579
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| workflow_template_id | `text` | YES | - | - |
| current_stage | `integer(32)` | YES | - | - |
| status | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| current_stage_started_at | `timestamp with time zone` | YES | - | - |
| estimated_completion | `text` | YES | - | - |
| actual_completion | `text` | YES | - | - |
| current_stage_data | `jsonb` | YES | - | - |
| next_stage_data | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `workflow_executions_pkey`: PRIMARY KEY (id)

## Indexes

- `workflow_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX workflow_executions_pkey ON public.workflow_executions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_workflow_executions (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. service_role_all_workflow_executions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
