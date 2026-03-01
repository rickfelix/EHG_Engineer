# department_messages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
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
| sender_agent_id | `uuid` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `department_messages_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `department_messages_department_id_fkey`: department_id → departments(id)
- `department_messages_sender_agent_id_fkey`: sender_agent_id → agent_registry(id)

## Indexes

- `department_messages_pkey`
  ```sql
  CREATE UNIQUE INDEX department_messages_pkey ON public.department_messages USING btree (id)
  ```
- `idx_department_messages_dept`
  ```sql
  CREATE INDEX idx_department_messages_dept ON public.department_messages USING btree (department_id, created_at DESC)
  ```
- `idx_department_messages_sender`
  ```sql
  CREATE INDEX idx_department_messages_sender ON public.department_messages USING btree (sender_agent_id)
  ```

## RLS Policies

### 1. department_messages_all_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. department_messages_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
