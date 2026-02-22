# monthly_ceo_reports Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T14:34:13.063Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | FK to ventures table - which venture this report covers |
| period | `character varying(7)` | **NO** | - | Report period in YYYY-MM format (e.g., 2026-02) |
| content | `jsonb` | **NO** | `'{}'::jsonb` | JSONB report content including metrics, narrative, highlights, blockers |
| generated_by | `character varying(100)` | YES | `'ceo_agent'::character varying` | Agent or system that generated this report (default: ceo_agent) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `monthly_ceo_reports_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `monthly_ceo_reports_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `monthly_ceo_reports_venture_period_unique`: UNIQUE (venture_id, period)

### Check Constraints
- `monthly_ceo_reports_period_format`: CHECK (((period)::text ~ '^\d{4}-\d{2}$'::text))

## Indexes

- `idx_monthly_ceo_reports_content`
  ```sql
  CREATE INDEX idx_monthly_ceo_reports_content ON public.monthly_ceo_reports USING gin (content)
  ```
- `idx_monthly_ceo_reports_period`
  ```sql
  CREATE INDEX idx_monthly_ceo_reports_period ON public.monthly_ceo_reports USING btree (period)
  ```
- `idx_monthly_ceo_reports_venture_id`
  ```sql
  CREATE INDEX idx_monthly_ceo_reports_venture_id ON public.monthly_ceo_reports USING btree (venture_id)
  ```
- `monthly_ceo_reports_pkey`
  ```sql
  CREATE UNIQUE INDEX monthly_ceo_reports_pkey ON public.monthly_ceo_reports USING btree (id)
  ```
- `monthly_ceo_reports_venture_period_unique`
  ```sql
  CREATE UNIQUE INDEX monthly_ceo_reports_venture_period_unique ON public.monthly_ceo_reports USING btree (venture_id, period)
  ```

## RLS Policies

### 1. chairman_full_access_monthly_ceo_reports (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. service_role_all_monthly_ceo_reports (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
