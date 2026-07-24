# forecast_records Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| forecast_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| perspective_id | `uuid` | YES | - | - |
| forecast_text | `text` | **NO** | - | - |
| forecast_date | `date` | **NO** | `CURRENT_DATE` | - |
| forecast_target_date | `date` | YES | - | - |
| probability | `numeric(4,3)` | YES | - | - |
| measurable_condition | `text` | YES | - | - |
| source_id | `uuid` | YES | - | - |
| current_status | `text` | **NO** | `'open'::text` | - |
| outcome_score | `numeric` | YES | - | - |
| adjudication_notes | `text` | YES | - | - |
| venture_a | `uuid` | YES | - | - |
| venture_b | `uuid` | YES | - | - |
| capability_edge | `text` | YES | - | - |
| trigger | `text` | YES | - | - |
| review_at | `timestamp with time zone` | YES | - | - |
| decay_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `forecast_records_pkey`: PRIMARY KEY (forecast_id)

### Check Constraints
- `forecast_records_current_status_check`: CHECK ((current_status = ANY (ARRAY['open'::text, 'confirmed'::text, 'partially_confirmed'::text, 'premature'::text, 'contradicted'::text, 'unresolved'::text])))
- `forecast_records_probability_check`: CHECK (((probability IS NULL) OR ((probability >= (0)::numeric) AND (probability <= (1)::numeric))))

## Indexes

- `forecast_records_pkey`
  ```sql
  CREATE UNIQUE INDEX forecast_records_pkey ON public.forecast_records USING btree (forecast_id)
  ```

## RLS Policies

### 1. service_role_all_forecast_records (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
