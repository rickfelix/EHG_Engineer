# department_agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:05:57.778Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| department_id | `uuid` | **NO** | - | - |
| agent_id | `uuid` | **NO** | - | - |
| role_in_department | `text` | **NO** | `'member'::text` | - |
| assigned_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `department_agents_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `department_agents_agent_id_fkey`: agent_id → agent_registry(id)
- `department_agents_department_id_fkey`: department_id → departments(id)

### Check Constraints
- `department_agents_role_in_department_check`: CHECK ((role_in_department = ANY (ARRAY['lead'::text, 'member'::text, 'advisor'::text])))

## Indexes

- `department_agents_pkey`
  ```sql
  CREATE UNIQUE INDEX department_agents_pkey ON public.department_agents USING btree (id)
  ```
- `idx_department_agents_agent`
  ```sql
  CREATE INDEX idx_department_agents_agent ON public.department_agents USING btree (agent_id)
  ```
- `idx_department_agents_unique`
  ```sql
  CREATE UNIQUE INDEX idx_department_agents_unique ON public.department_agents USING btree (department_id, agent_id)
  ```

## RLS Policies

### 1. department_agents_all_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. department_agents_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
