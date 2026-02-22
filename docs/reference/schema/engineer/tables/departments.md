# departments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:51:20.959Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| slug | `text` | **NO** | - | - |
| hierarchy_path | `USER-DEFINED` | **NO** | - | - |
| description | `text` | YES | - | - |
| parent_department_id | `uuid` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `departments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `departments_parent_department_id_fkey`: parent_department_id → departments(id)

### Unique Constraints
- `departments_name_key`: UNIQUE (name)
- `departments_slug_key`: UNIQUE (slug)

## Indexes

- `departments_name_key`
  ```sql
  CREATE UNIQUE INDEX departments_name_key ON public.departments USING btree (name)
  ```
- `departments_pkey`
  ```sql
  CREATE UNIQUE INDEX departments_pkey ON public.departments USING btree (id)
  ```
- `departments_slug_key`
  ```sql
  CREATE UNIQUE INDEX departments_slug_key ON public.departments USING btree (slug)
  ```
- `idx_departments_hierarchy_path`
  ```sql
  CREATE INDEX idx_departments_hierarchy_path ON public.departments USING gist (hierarchy_path)
  ```
- `idx_departments_parent`
  ```sql
  CREATE INDEX idx_departments_parent ON public.departments USING btree (parent_department_id)
  ```

## RLS Policies

### 1. departments_all_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. departments_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_departments_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_departments_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
