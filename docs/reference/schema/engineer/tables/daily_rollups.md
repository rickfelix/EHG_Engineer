# daily_rollups Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-19T23:26:50.288Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rollup_date | `date` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| platform | `text` | **NO** | - | - |
| content_id | `uuid` | YES | - | - |
| variant_id | `uuid` | YES | - | - |
| impressions | `integer(32)` | **NO** | `0` | - |
| engagements | `integer(32)` | **NO** | `0` | - |
| clicks | `integer(32)` | **NO** | `0` | - |
| conversions | `integer(32)` | **NO** | `0` | - |
| spend_cents | `integer(32)` | **NO** | `0` | - |
| engagement_rate | `numeric(8,6)` | YES | - | - |
| ctr | `numeric(8,6)` | YES | - | - |
| conversion_rate | `numeric(8,6)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `daily_rollups_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `daily_rollups_content_id_fkey`: content_id → marketing_content(id)
- `daily_rollups_variant_id_fkey`: variant_id → marketing_content_variants(id)
- `daily_rollups_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `daily_rollups_pkey`
  ```sql
  CREATE UNIQUE INDEX daily_rollups_pkey ON public.daily_rollups USING btree (id)
  ```
- `idx_daily_rollups_platform`
  ```sql
  CREATE INDEX idx_daily_rollups_platform ON public.daily_rollups USING btree (platform)
  ```
- `idx_daily_rollups_unique_key`
  ```sql
  CREATE UNIQUE INDEX idx_daily_rollups_unique_key ON public.daily_rollups USING btree (rollup_date, venture_id, platform, COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ```
- `idx_daily_rollups_venture_date`
  ```sql
  CREATE INDEX idx_daily_rollups_venture_date ON public.daily_rollups USING btree (venture_id, rollup_date)
  ```

## RLS Policies

### 1. service_role_all_daily_rollups (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_daily_rollups (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

---

[← Back to Schema Overview](../database-schema-overview.md)
