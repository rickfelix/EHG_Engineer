# leo_test_plans Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T04:52:34.874Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| coverage_target | `numeric(5,2)` | **NO** | - | - |
| matrices | `jsonb` | **NO** | `'{}'::jsonb` | - |
| test_scenarios | `jsonb` | **NO** | `'[]'::jsonb` | - |
| regression_suite | `jsonb` | YES | `'[]'::jsonb` | - |
| smoke_tests | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_test_plans_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_test_plans_coverage_target_check`: CHECK (((coverage_target >= (0)::numeric) AND (coverage_target <= (100)::numeric)))
- `valid_matrices`: CHECK (((jsonb_typeof(matrices) = 'object'::text) AND (matrices ? 'unit'::text) AND (matrices ? 'integration'::text) AND (matrices ? 'e2e'::text) AND (matrices ? 'a11y'::text) AND (matrices ? 'perf'::text)))
- `valid_test_scenarios`: CHECK ((jsonb_typeof(test_scenarios) = 'array'::text))

## Indexes

- `leo_test_plans_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_test_plans_pkey ON public.leo_test_plans USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_test_plans (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_test_plans (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
