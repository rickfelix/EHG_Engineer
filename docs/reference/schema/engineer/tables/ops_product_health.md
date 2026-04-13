# ops_product_health Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T18:24:13.364Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| metric_date | `date` | **NO** | - | - |
| uptime_pct | `numeric(5,2)` | YES | - | Percentage of successful requests (e.g. 99.50 = 99.5%) |
| p95_latency_ms | `numeric(10,2)` | YES | - | 95th percentile response latency in milliseconds |
| error_rate | `numeric(5,4)` | YES | - | Error rate as decimal (e.g. 0.0100 = 1%) |
| infra_cost_usd | `numeric(12,2)` | YES | - | Estimated infrastructure cost for the day |
| total_requests | `integer(32)` | YES | `0` | - |
| successful_requests | `integer(32)` | YES | `0` | - |
| error_requests | `integer(32)` | YES | `0` | - |
| computed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_product_health_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_product_health_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_product_health_venture_id_metric_date_key`: UNIQUE (venture_id, metric_date)

## Indexes

- `idx_ops_product_health_venture_date`
  ```sql
  CREATE INDEX idx_ops_product_health_venture_date ON public.ops_product_health USING btree (venture_id, metric_date DESC)
  ```
- `ops_product_health_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_product_health_pkey ON public.ops_product_health USING btree (id)
  ```
- `ops_product_health_venture_id_metric_date_key`
  ```sql
  CREATE UNIQUE INDEX ops_product_health_venture_id_metric_date_key ON public.ops_product_health USING btree (venture_id, metric_date)
  ```

## RLS Policies

### 1. ops_product_health_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_product_health_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_product_health_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_product_health_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
