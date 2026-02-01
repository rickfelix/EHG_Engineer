# agent_departments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:08:38.305Z
**Rows**: 12
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| department_name | `text` | YES | - | - |
| department_head_id | `text` | YES | - | - |
| parent_department_id | `text` | YES | - | - |
| description | `text` | YES | - | - |
| status | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `agent_departments_pkey`: PRIMARY KEY (id)

## Indexes

- `agent_departments_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_departments_pkey ON public.agent_departments USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_agent_departments (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_departments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
