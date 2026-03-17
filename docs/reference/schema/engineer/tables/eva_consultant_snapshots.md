# eva_consultant_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T13:52:41.484Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| snapshot_date | `date` | **NO** | - | Date of this snapshot - one per day, UNIQUE constraint enforced |
| source_counts | `jsonb` | **NO** | `'{}'::jsonb` | Items per source per week, e.g. {"todoist": 45, "youtube": 12} |
| top_aspects_by_app | `jsonb` | **NO** | `'{}'::jsonb` | Top aspects per application, e.g. {"ehg_engineer": {"leo_protocol": 15, "eva_pipeline": 8}} |
| top_intents | `jsonb` | **NO** | `'{}'::jsonb` | Intent distribution, e.g. {"idea": 30, "insight": 12, "reference": 8} |
| new_item_velocity | `jsonb` | **NO** | `'{}'::jsonb` | Items/week vs prior 4-week avg per app, e.g. {"ehg_engineer": {"current": 15, "avg_4wk": 10, "change_pct": 50}} |
| raw_cluster_data | `jsonb` | YES | - | Raw aggregate statistics for manual review (nullable) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_consultant_snapshots_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_consultant_snapshots_snapshot_date_key`: UNIQUE (snapshot_date)

## Indexes

- `eva_consultant_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_snapshots_pkey ON public.eva_consultant_snapshots USING btree (id)
  ```
- `eva_consultant_snapshots_snapshot_date_key`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_snapshots_snapshot_date_key ON public.eva_consultant_snapshots USING btree (snapshot_date)
  ```
- `idx_eva_consultant_snapshots_date`
  ```sql
  CREATE INDEX idx_eva_consultant_snapshots_date ON public.eva_consultant_snapshots USING btree (snapshot_date)
  ```

## RLS Policies

### 1. anon_select_eva_consultant_snapshots (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. service_role_all_eva_consultant_snapshots (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
