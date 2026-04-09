# risk_forecasts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T19:20:23.701Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| forecast_date | `date` | **NO** | `CURRENT_DATE` | - |
| risk_category | `text` | **NO** | - | - |
| predicted_score | `numeric` | **NO** | - | - |
| confidence | `numeric` | **NO** | - | - |
| factors | `jsonb` | YES | `'[]'::jsonb` | - |
| model_version | `text` | YES | `'1.0'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `risk_forecasts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `risk_forecasts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `risk_forecasts_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))

## Indexes

- `idx_risk_forecasts_forecast_date`
  ```sql
  CREATE INDEX idx_risk_forecasts_forecast_date ON public.risk_forecasts USING btree (forecast_date)
  ```
- `idx_risk_forecasts_venture_id`
  ```sql
  CREATE INDEX idx_risk_forecasts_venture_id ON public.risk_forecasts USING btree (venture_id)
  ```
- `risk_forecasts_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_forecasts_pkey ON public.risk_forecasts USING btree (id)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
