# codebase_health_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-05T13:22:03.303Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| dimension | `text` | **NO** | - | - |
| score | `numeric(5,2)` | **NO** | - | - |
| trend_direction | `text` | YES | - | - |
| findings | `jsonb` | YES | `'[]'::jsonb` | - |
| finding_count | `integer(32)` | YES | `0` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| target_application | `text` | **NO** | `'EHG_Engineer'::text` | - |
| scanned_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `codebase_health_snapshots_pkey`: PRIMARY KEY (id)

### Check Constraints
- `codebase_health_snapshots_score_check`: CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
- `codebase_health_snapshots_trend_direction_check`: CHECK ((trend_direction = ANY (ARRAY['improving'::text, 'stable'::text, 'declining'::text, 'new'::text])))

## Indexes

- `codebase_health_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX codebase_health_snapshots_pkey ON public.codebase_health_snapshots USING btree (id)
  ```
- `idx_health_snapshots_dimension`
  ```sql
  CREATE INDEX idx_health_snapshots_dimension ON public.codebase_health_snapshots USING btree (dimension)
  ```
- `idx_health_snapshots_dimension_scanned`
  ```sql
  CREATE INDEX idx_health_snapshots_dimension_scanned ON public.codebase_health_snapshots USING btree (dimension, scanned_at DESC)
  ```
- `idx_health_snapshots_scanned_at`
  ```sql
  CREATE INDEX idx_health_snapshots_scanned_at ON public.codebase_health_snapshots USING btree (scanned_at DESC)
  ```

## RLS Policies

### 1. authenticated_read_snapshots (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_snapshots (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
