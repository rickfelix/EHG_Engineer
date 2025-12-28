# workflow_checkpoints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-28T16:19:12.153Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | **NO** | - | - |
| workflow_id | `text` | **NO** | - | - |
| agent_code | `text` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| state | `jsonb` | **NO** | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `workflow_checkpoints_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_workflow_checkpoints_agent`
  ```sql
  CREATE INDEX idx_workflow_checkpoints_agent ON public.workflow_checkpoints USING btree (agent_code)
  ```
- `idx_workflow_checkpoints_created`
  ```sql
  CREATE INDEX idx_workflow_checkpoints_created ON public.workflow_checkpoints USING btree (created_at DESC)
  ```
- `idx_workflow_checkpoints_phase`
  ```sql
  CREATE INDEX idx_workflow_checkpoints_phase ON public.workflow_checkpoints USING btree (phase)
  ```
- `idx_workflow_checkpoints_workflow`
  ```sql
  CREATE INDEX idx_workflow_checkpoints_workflow ON public.workflow_checkpoints USING btree (workflow_id)
  ```
- `workflow_checkpoints_pkey`
  ```sql
  CREATE UNIQUE INDEX workflow_checkpoints_pkey ON public.workflow_checkpoints USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_workflow_checkpoints (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_workflow_checkpoints (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
