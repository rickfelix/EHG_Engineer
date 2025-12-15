# sd_dependency_graph Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-15T17:31:21.178Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_sd_id | `text` | **NO** | - | - |
| to_sd_id | `text` | **NO** | - | - |
| dependency_type | `text` | YES | - | - |
| dependency_strength | `text` | YES | - | - |
| detected_at | `timestamp without time zone` | YES | `now()` | - |
| detection_method | `text` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | `0.5` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sd_dependency_graph_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_dependency`: UNIQUE (from_sd_id, to_sd_id, dependency_type)

### Check Constraints
- `sd_dependency_graph_dependency_strength_check`: CHECK ((dependency_strength = ANY (ARRAY['HARD'::text, 'SOFT'::text, 'OPTIONAL'::text])))
- `sd_dependency_graph_dependency_type_check`: CHECK ((dependency_type = ANY (ARRAY['PREREQUISITE'::text, 'BLOCKS'::text, 'ENHANCES'::text, 'CONFLICTS'::text, 'SHARES_RESOURCES'::text, 'PARALLEL_OK'::text])))

## Indexes

- `idx_dependency_from`
  ```sql
  CREATE INDEX idx_dependency_from ON public.sd_dependency_graph USING btree (from_sd_id)
  ```
- `idx_dependency_to`
  ```sql
  CREATE INDEX idx_dependency_to ON public.sd_dependency_graph USING btree (to_sd_id)
  ```
- `idx_dependency_type`
  ```sql
  CREATE INDEX idx_dependency_type ON public.sd_dependency_graph USING btree (dependency_type)
  ```
- `sd_dependency_graph_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_dependency_graph_pkey ON public.sd_dependency_graph USING btree (id)
  ```
- `unique_dependency`
  ```sql
  CREATE UNIQUE INDEX unique_dependency ON public.sd_dependency_graph USING btree (from_sd_id, to_sd_id, dependency_type)
  ```

## RLS Policies

### 1. authenticated_read_sd_dependency_graph (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_dependency_graph (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
