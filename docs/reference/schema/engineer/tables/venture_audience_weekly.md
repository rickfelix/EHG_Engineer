# venture_audience_weekly Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| week_start | `date` | **NO** | - | - |
| clicks | `integer(32)` | **NO** | `0` | - |
| impressions | `integer(32)` | **NO** | `0` | - |
| engagement_rate | `numeric(5,2)` | **NO** | `0` | - |
| post_count | `integer(32)` | **NO** | `0` | - |
| computed_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_audience_weekly_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_audience_weekly_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_audience_weekly_venture_id_week_start_key`: UNIQUE (venture_id, week_start)

## Indexes

- `idx_venture_audience_weekly_venture`
  ```sql
  CREATE INDEX idx_venture_audience_weekly_venture ON public.venture_audience_weekly USING btree (venture_id)
  ```
- `venture_audience_weekly_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_audience_weekly_pkey ON public.venture_audience_weekly USING btree (id)
  ```
- `venture_audience_weekly_venture_id_week_start_key`
  ```sql
  CREATE UNIQUE INDEX venture_audience_weekly_venture_id_week_start_key ON public.venture_audience_weekly USING btree (venture_id, week_start)
  ```

## RLS Policies

### 1. vaw_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. vaw_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
