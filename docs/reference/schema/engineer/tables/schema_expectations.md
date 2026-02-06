# schema_expectations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:09:28.771Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| table_name | `text` | **NO** | - | - |
| column_name | `text` | **NO** | - | - |
| expected_type | `text` | YES | - | - |
| is_required | `boolean` | YES | `true` | - |
| expected_constraints | `ARRAY` | YES | - | - |
| validation_query | `text` | YES | - | - |
| remediation_sql | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `schema_expectations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `schema_expectations_table_name_column_name_key`: UNIQUE (table_name, column_name)

## Indexes

- `schema_expectations_pkey`
  ```sql
  CREATE UNIQUE INDEX schema_expectations_pkey ON public.schema_expectations USING btree (id)
  ```
- `schema_expectations_table_name_column_name_key`
  ```sql
  CREATE UNIQUE INDEX schema_expectations_table_name_column_name_key ON public.schema_expectations USING btree (table_name, column_name)
  ```

## RLS Policies

### 1. authenticated_read_schema_expectations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_schema_expectations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
