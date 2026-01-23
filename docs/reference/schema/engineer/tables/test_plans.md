# test_plans Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T04:03:45.232Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| prd_id | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'TESTING'::text` | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| approved_by | `text` | YES | - | - |
| unit_test_strategy | `jsonb` | YES | - | Unit testing strategy: files to test, coverage targets, testing frameworks |
| e2e_test_strategy | `jsonb` | YES | - | E2E testing strategy: user flows, scenarios, test data requirements |
| integration_test_strategy | `jsonb` | YES | - | - |
| performance_test_strategy | `jsonb` | YES | - | - |
| test_data_requirements | `jsonb` | YES | `'[]'::jsonb` | - |
| mock_requirements | `jsonb` | YES | `'[]'::jsonb` | - |
| environment_requirements | `jsonb` | YES | `'[]'::jsonb` | - |
| estimated_unit_tests | `integer(32)` | YES | - | - |
| estimated_e2e_tests | `integer(32)` | YES | - | - |
| estimated_test_development_hours | `numeric(5,2)` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `test_plans_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `test_plans_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `test_plans_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_test_plans_prd_id`
  ```sql
  CREATE INDEX idx_test_plans_prd_id ON public.test_plans USING btree (prd_id)
  ```
- `idx_test_plans_sd_id`
  ```sql
  CREATE INDEX idx_test_plans_sd_id ON public.test_plans USING btree (sd_id)
  ```
- `test_plans_pkey`
  ```sql
  CREATE UNIQUE INDEX test_plans_pkey ON public.test_plans USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_test_plans (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_test_plans (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_test_plans_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_test_plans_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
