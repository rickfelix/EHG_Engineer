# ops_revenue_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T19:41:40.179Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| metric_date | `date` | **NO** | - | - |
| mrr | `numeric(12,2)` | YES | `0` | Monthly Recurring Revenue in dollars |
| churn_rate | `numeric(5,4)` | YES | `0` | Customer churn rate as decimal (e.g. 0.0350 = 3.5%) |
| expansion_revenue | `numeric(12,2)` | YES | `0` | Revenue from upsells/cross-sells |
| contraction_revenue | `numeric(12,2)` | YES | `0` | Revenue lost from downgrades (positive number) |
| failed_payments | `integer(32)` | YES | `0` | - |
| ltv_cac | `numeric(6,2)` | YES | - | Lifetime Value to Customer Acquisition Cost ratio |
| target_mrr | `numeric(12,2)` | YES | - | - |
| target_churn_rate | `numeric(5,4)` | YES | - | - |
| computed_at | `timestamp with time zone` | YES | `now()` | When these metrics were last computed/refreshed |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_revenue_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_revenue_metrics_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_revenue_metrics_venture_id_metric_date_key`: UNIQUE (venture_id, metric_date)

## Indexes

- `idx_ops_revenue_metrics_venture_date`
  ```sql
  CREATE INDEX idx_ops_revenue_metrics_venture_date ON public.ops_revenue_metrics USING btree (venture_id, metric_date DESC)
  ```
- `ops_revenue_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_revenue_metrics_pkey ON public.ops_revenue_metrics USING btree (id)
  ```
- `ops_revenue_metrics_venture_id_metric_date_key`
  ```sql
  CREATE UNIQUE INDEX ops_revenue_metrics_venture_id_metric_date_key ON public.ops_revenue_metrics USING btree (venture_id, metric_date)
  ```

## RLS Policies

### 1. ops_revenue_metrics_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_revenue_metrics_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_revenue_metrics_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_revenue_metrics_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
