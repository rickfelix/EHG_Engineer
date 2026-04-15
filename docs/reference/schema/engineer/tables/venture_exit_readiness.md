# venture_exit_readiness Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-15T15:49:47.783Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| dependency_inventory | `jsonb` | YES | - | - |
| data_export_status | `text` | YES | `'not_started'::text` | - |
| secret_rotation_status | `text` | YES | `'not_started'::text` | - |
| third_party_alternatives | `jsonb` | YES | - | - |
| separation_tested | `boolean` | YES | `false` | - |
| last_dry_run | `timestamp with time zone` | YES | - | - |
| estimated_separation_days | `integer(32)` | YES | - | - |
| notes | `text` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| separation_test_results | `jsonb` | YES | `'{}'::jsonb` | Structured per-dimension pass/fail separation test results with blocking items |
| target_arr | `numeric` | YES | - | Target Annual Recurring Revenue in USD |
| actual_arr | `numeric` | YES | - | Actual Annual Recurring Revenue in USD |
| target_customer_count | `integer(32)` | YES | - | Target number of customers for exit readiness |
| actual_customer_count | `integer(32)` | YES | - | Current actual number of customers |
| growth_rate_target | `numeric` | YES | - | Target growth rate as decimal (e.g., 0.20 = 20%) |
| growth_rate_actual | `numeric` | YES | - | Actual growth rate as decimal (e.g., 0.15 = 15%) |
| market_multiple_current | `numeric` | YES | - | Current market revenue multiple for the venture sector |
| readiness_score | `numeric` | YES | `0` | Computed business readiness score (0-100) |
| readiness_threshold | `numeric` | YES | `70` | Score threshold that triggers chairman review escalation |
| chairman_review_triggered | `boolean` | YES | `false` | Set true when readiness_score exceeds threshold for 2+ consecutive periods |

## Constraints

### Primary Key
- `venture_exit_readiness_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_exit_readiness_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_exit_readiness_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `ver_export_status_check`: CHECK ((data_export_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))
- `ver_secret_status_check`: CHECK ((secret_rotation_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `venture_exit_readiness_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_exit_readiness_pkey ON public.venture_exit_readiness USING btree (id)
  ```
- `venture_exit_readiness_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_exit_readiness_venture_id_key ON public.venture_exit_readiness USING btree (venture_id)
  ```

## RLS Policies

### 1. exit_readiness_venture_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. ver_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. ver_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_venture_exit_readiness

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

### venture_exit_readiness_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
