# leo_schema_constraints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T16:35:26.549Z
**Rows**: 16
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_schema_constraints_id_seq'::regclass)` | - |
| table_name | `character varying(100)` | **NO** | - | - |
| column_name | `character varying(100)` | **NO** | - | - |
| constraint_type | `character varying(50)` | **NO** | - | - |
| constraint_definition | `text` | **NO** | - | - |
| valid_values | `jsonb` | YES | - | - |
| error_pattern | `text` | YES | - | - |
| remediation_hint | `text` | YES | - | - |
| documentation | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_schema_constraints_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_schema_constraints_table_name_column_name_constraint_ty_key`: UNIQUE (table_name, column_name, constraint_type)

### Check Constraints
- `leo_schema_constraints_constraint_type_check`: CHECK (((constraint_type)::text = ANY ((ARRAY['check'::character varying, 'enum'::character varying, 'foreign_key'::character varying, 'not_null'::character varying, 'unique'::character varying])::text[])))

## Indexes

- `idx_leo_schema_constraints_table`
  ```sql
  CREATE INDEX idx_leo_schema_constraints_table ON public.leo_schema_constraints USING btree (table_name)
  ```
- `idx_leo_schema_constraints_type`
  ```sql
  CREATE INDEX idx_leo_schema_constraints_type ON public.leo_schema_constraints USING btree (constraint_type)
  ```
- `leo_schema_constraints_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_schema_constraints_pkey ON public.leo_schema_constraints USING btree (id)
  ```
- `leo_schema_constraints_table_name_column_name_constraint_ty_key`
  ```sql
  CREATE UNIQUE INDEX leo_schema_constraints_table_name_column_name_constraint_ty_key ON public.leo_schema_constraints USING btree (table_name, column_name, constraint_type)
  ```

## RLS Policies

### 1. Anon users can read schema_constraints (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. Authenticated users can read schema constraints (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. Service role has full access to schema constraints (ALL)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
