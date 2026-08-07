# venture_operating_burn Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| source_application | `text` | **NO** | - | - |
| period_month | `date` | **NO** | - | - |
| infra_cost_usd | `numeric(14,2)` | YES | - | - |
| infra_cost_last_synced_at | `timestamp with time zone` | YES | - | - |
| ai_cost_usd | `numeric(14,2)` | YES | - | - |
| ai_cost_status | `text` | **NO** | `'unattested'::text` | - |
| ai_cost_last_synced_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_operating_burn_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_operating_burn_period_unique`: UNIQUE (venture_id, source_application, period_month)

### Check Constraints
- `venture_operating_burn_ai_cost_status_check`: CHECK ((ai_cost_status = ANY (ARRAY['unattested'::text, 'measured'::text])))
- `venture_operating_burn_first_of_month`: CHECK ((date_trunc('month'::text, (period_month)::timestamp with time zone) = period_month))

## Indexes

- `idx_venture_operating_burn_period`
  ```sql
  CREATE INDEX idx_venture_operating_burn_period ON public.venture_operating_burn USING btree (period_month DESC)
  ```
- `idx_venture_operating_burn_venture`
  ```sql
  CREATE INDEX idx_venture_operating_burn_venture ON public.venture_operating_burn USING btree (venture_id, source_application)
  ```
- `venture_operating_burn_period_unique`
  ```sql
  CREATE UNIQUE INDEX venture_operating_burn_period_unique ON public.venture_operating_burn USING btree (venture_id, source_application, period_month)
  ```
- `venture_operating_burn_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_operating_burn_pkey ON public.venture_operating_burn USING btree (id)
  ```

## RLS Policies

### 1. venture_operating_burn_auth_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. venture_operating_burn_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
