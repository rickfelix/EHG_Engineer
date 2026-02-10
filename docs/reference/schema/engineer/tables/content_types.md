# content_types Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(100)` | **NO** | - | - |
| display_name | `character varying(255)` | YES | - | - |
| description | `text` | YES | - | - |
| creation_method | `jsonb` | YES | `'{}'::jsonb` | - |
| display_rules | `jsonb` | YES | `'{}'::jsonb` | - |
| validation_schema | `jsonb` | YES | `'{}'::jsonb` | - |
| transformation_logic | `jsonb` | YES | `'{}'::jsonb` | - |
| icon | `character varying(100)` | YES | - | - |
| color | `character varying(20)` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `content_types_pkey`: PRIMARY KEY (id)

## Indexes

- `content_types_pkey`
  ```sql
  CREATE UNIQUE INDEX content_types_pkey ON public.content_types USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to manage content_types (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read content_types (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
