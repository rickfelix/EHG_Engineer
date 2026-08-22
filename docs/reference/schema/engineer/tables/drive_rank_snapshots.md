# drive_rank_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 2,020
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| ranked_at | `timestamp with time zone` | **NO** | - | - |
| rank | `integer(32)` | **NO** | - | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| sd_key | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `drive_rank_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `drive_rank_snapshots_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `drive_rank_snapshots_cohort_rank_uniq`: UNIQUE (ranked_at, rank)

### Check Constraints
- `drive_rank_snapshots_rank_check`: CHECK (((rank >= 1) AND (rank <= 5)))

## Indexes

- `drive_rank_snapshots_cohort_rank_uniq`
  ```sql
  CREATE UNIQUE INDEX drive_rank_snapshots_cohort_rank_uniq ON public.drive_rank_snapshots USING btree (ranked_at, rank)
  ```
- `drive_rank_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX drive_rank_snapshots_pkey ON public.drive_rank_snapshots USING btree (id)
  ```
- `drive_rank_snapshots_ranked_at_idx`
  ```sql
  CREATE INDEX drive_rank_snapshots_ranked_at_idx ON public.drive_rank_snapshots USING btree (ranked_at DESC)
  ```

## RLS Policies

### 1. drive_rank_snapshots_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### drive_rank_snapshots_guard_update_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION drive_rank_snapshots_guard_update()`

---

[← Back to Schema Overview](../database-schema-overview.md)
