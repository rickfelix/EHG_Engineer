# ehg_page_routes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T20:53:11.137Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| route_path | `text` | **NO** | - | - |
| page_name | `text` | **NO** | - | - |
| feature_area_id | `uuid` | YES | - | - |
| purpose | `text` | **NO** | - | - |
| user_workflow | `text` | YES | - | - |
| component_file_path | `text` | YES | - | - |
| layout_type | `text` | YES | - | - |
| access_level | `text` | YES | - | - |
| related_routes | `ARRAY` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_page_routes_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ehg_page_routes_feature_area_id_fkey`: feature_area_id → ehg_feature_areas(id)

### Unique Constraints
- `ehg_page_routes_route_path_key`: UNIQUE (route_path)

## Indexes

- `ehg_page_routes_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_page_routes_pkey ON public.ehg_page_routes USING btree (id)
  ```
- `ehg_page_routes_route_path_key`
  ```sql
  CREATE UNIQUE INDEX ehg_page_routes_route_path_key ON public.ehg_page_routes USING btree (route_path)
  ```
- `idx_page_routes_feature`
  ```sql
  CREATE INDEX idx_page_routes_feature ON public.ehg_page_routes USING btree (feature_area_id)
  ```
- `idx_page_routes_path`
  ```sql
  CREATE INDEX idx_page_routes_path ON public.ehg_page_routes USING btree (route_path)
  ```

## RLS Policies

### 1. Allow read access to page routes (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Allow service_role to manage ehg_page_routes (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
