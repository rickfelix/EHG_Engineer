# ehg_feature_areas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 10
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| code | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| parent_area_id | `uuid` | YES | - | - |
| navigation_path | `text` | YES | - | - |
| primary_user_role | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_feature_areas_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ehg_feature_areas_parent_area_id_fkey`: parent_area_id → ehg_feature_areas(id)

### Unique Constraints
- `ehg_feature_areas_code_key`: UNIQUE (code)

## Indexes

- `ehg_feature_areas_code_key`
  ```sql
  CREATE UNIQUE INDEX ehg_feature_areas_code_key ON public.ehg_feature_areas USING btree (code)
  ```
- `ehg_feature_areas_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_feature_areas_pkey ON public.ehg_feature_areas USING btree (id)
  ```
- `idx_feature_areas_code`
  ```sql
  CREATE INDEX idx_feature_areas_code ON public.ehg_feature_areas USING btree (code)
  ```
- `idx_feature_areas_parent`
  ```sql
  CREATE INDEX idx_feature_areas_parent ON public.ehg_feature_areas USING btree (parent_area_id)
  ```

## RLS Policies

### 1. Allow read access to feature areas (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
