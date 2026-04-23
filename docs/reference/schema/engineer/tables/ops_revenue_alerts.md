# ops_revenue_alerts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T10:28:51.042Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| metric_type | `text` | **NO** | - | Which revenue metric triggered the alert |
| actual_value | `numeric(12,2)` | **NO** | - | - |
| target_value | `numeric(12,2)` | **NO** | - | - |
| deviation_pct | `numeric(6,2)` | **NO** | - | Percentage deviation from target (e.g. -15.50 = 15.5% below target) |
| severity | `text` | **NO** | - | Alert severity: warning (minor), critical (action needed), emergency (immediate) |
| status | `text` | **NO** | `'open'::text` | Alert lifecycle: open -> acknowledged -> resolved/dismissed |
| alert_date | `date` | **NO** | `CURRENT_DATE` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_revenue_alerts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_revenue_alerts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `ops_revenue_alerts_metric_type_check`: CHECK ((metric_type = ANY (ARRAY['mrr'::text, 'churn_rate'::text, 'expansion'::text, 'contraction'::text, 'failed_payments'::text, 'ltv_cac'::text])))
- `ops_revenue_alerts_severity_check`: CHECK ((severity = ANY (ARRAY['warning'::text, 'critical'::text, 'emergency'::text])))
- `ops_revenue_alerts_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])))

## Indexes

- `idx_ops_revenue_alerts_date`
  ```sql
  CREATE INDEX idx_ops_revenue_alerts_date ON public.ops_revenue_alerts USING btree (alert_date DESC)
  ```
- `idx_ops_revenue_alerts_venture_status`
  ```sql
  CREATE INDEX idx_ops_revenue_alerts_venture_status ON public.ops_revenue_alerts USING btree (venture_id, status) WHERE (status = ANY (ARRAY['open'::text, 'acknowledged'::text]))
  ```
- `ops_revenue_alerts_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_revenue_alerts_pkey ON public.ops_revenue_alerts USING btree (id)
  ```

## RLS Policies

### 1. ops_revenue_alerts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_revenue_alerts_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_revenue_alerts_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_revenue_alerts_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
