# ehg_design_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_context | `text` | **NO** | - | - |
| options_considered | `jsonb` | YES | - | - |
| chosen_solution | `text` | **NO** | - | - |
| rationale | `text` | YES | - | - |
| feature_area_id | `uuid` | YES | - | - |
| route_id | `uuid` | YES | - | - |
| related_sd_key | `text` | YES | - | - |
| outcome_notes | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_design_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ehg_design_decisions_feature_area_id_fkey`: feature_area_id → ehg_feature_areas(id)
- `ehg_design_decisions_route_id_fkey`: route_id → ehg_page_routes(id)

## Indexes

- `ehg_design_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_design_decisions_pkey ON public.ehg_design_decisions USING btree (id)
  ```
- `idx_design_decisions_feature`
  ```sql
  CREATE INDEX idx_design_decisions_feature ON public.ehg_design_decisions USING btree (feature_area_id)
  ```

## RLS Policies

### 1. Allow authenticated insert to design decisions (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow read access to design decisions (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
