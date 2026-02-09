# leo_planner_rankings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T03:03:13.715Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| correlation_id | `text` | **NO** | - | - |
| queue | `jsonb` | **NO** | `'[]'::jsonb` | Ordered list of ranked proposals (JSON array) |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| stability | `jsonb` | YES | - | Stability metrics comparing to previous ranking |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_planner_rankings_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_leo_planner_rankings_correlation_id`
  ```sql
  CREATE INDEX idx_leo_planner_rankings_correlation_id ON public.leo_planner_rankings USING btree (correlation_id)
  ```
- `idx_leo_planner_rankings_created_at`
  ```sql
  CREATE INDEX idx_leo_planner_rankings_created_at ON public.leo_planner_rankings USING btree (created_at DESC)
  ```
- `idx_leo_planner_rankings_queue_gin`
  ```sql
  CREATE INDEX idx_leo_planner_rankings_queue_gin ON public.leo_planner_rankings USING gin (queue)
  ```
- `leo_planner_rankings_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_planner_rankings_pkey ON public.leo_planner_rankings USING btree (id)
  ```

## RLS Policies

### 1. leo_planner_rankings_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_planner_rankings_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
