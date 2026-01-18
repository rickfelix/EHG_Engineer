# ehg_design_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T22:37:12.871Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

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

### 2. Allow authenticated users to delete ehg_design_decisions (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. Allow authenticated users to update ehg_design_decisions (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 4. Allow read access to design decisions (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
