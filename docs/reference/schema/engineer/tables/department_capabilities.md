# department_capabilities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T14:20:42.746Z
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
| capability_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `department_capabilities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `department_capabilities_department_id_fkey`: department_id → departments(id)

### Unique Constraints
- `uq_department_capability`: UNIQUE (department_id, capability_name)

## Indexes

- `department_capabilities_pkey`
  ```sql
  CREATE UNIQUE INDEX department_capabilities_pkey ON public.department_capabilities USING btree (id)
  ```
- `idx_department_capabilities_name`
  ```sql
  CREATE INDEX idx_department_capabilities_name ON public.department_capabilities USING btree (capability_name)
  ```
- `uq_department_capability`
  ```sql
  CREATE UNIQUE INDEX uq_department_capability ON public.department_capabilities USING btree (department_id, capability_name)
  ```

## RLS Policies

### 1. department_capabilities_all_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. department_capabilities_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
