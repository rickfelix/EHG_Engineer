# eva_event_schemas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T17:59:03.922Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| version | `text` | **NO** | - | - |
| schema_definition | `jsonb` | **NO** | - | - |
| registered_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_event_schemas_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_event_schemas_event_version_unique`: UNIQUE (event_type, version)

## Indexes

- `eva_event_schemas_event_version_unique`
  ```sql
  CREATE UNIQUE INDEX eva_event_schemas_event_version_unique ON public.eva_event_schemas USING btree (event_type, version)
  ```
- `eva_event_schemas_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_event_schemas_pkey ON public.eva_event_schemas USING btree (id)
  ```
- `idx_eva_event_schemas_event_type`
  ```sql
  CREATE INDEX idx_eva_event_schemas_event_type ON public.eva_event_schemas USING btree (event_type)
  ```

## RLS Policies

### 1. eva_event_schemas_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_event_schemas_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
