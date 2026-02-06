# leo_interfaces Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T15:09:28.771Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| kind | `text` | **NO** | - | - |
| spec | `jsonb` | **NO** | - | - |
| version | `text` | **NO** | - | - |
| validation_status | `text` | YES | - | - |
| validation_errors | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_interfaces_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_interfaces_kind_check`: CHECK ((kind = ANY (ARRAY['openapi'::text, 'asyncapi'::text, 'graphql'::text, 'grpc'::text, 'typescript'::text, 'jsonschema'::text])))
- `leo_interfaces_validation_status_check`: CHECK ((validation_status = ANY (ARRAY['valid'::text, 'invalid'::text, 'pending'::text])))

## Indexes

- `idx_leo_interfaces_prd_name`
  ```sql
  CREATE INDEX idx_leo_interfaces_prd_name ON public.leo_interfaces USING btree (prd_id, name)
  ```
- `leo_interfaces_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_interfaces_pkey ON public.leo_interfaces USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_interfaces (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_interfaces (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
