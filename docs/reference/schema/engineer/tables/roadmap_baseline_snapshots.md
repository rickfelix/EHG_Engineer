# roadmap_baseline_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T09:53:49.951Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| roadmap_id | `uuid` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | Monotonically increasing version number per roadmap. UNIQUE per roadmap. |
| wave_sequence | `jsonb` | **NO** | - | Complete snapshot of wave ordering and items at time of baseline. JSONB NOT NULL. |
| change_rationale | `text` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| approved_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `roadmap_baseline_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `roadmap_baseline_snapshots_roadmap_id_fkey`: roadmap_id → strategic_roadmaps(id)

### Unique Constraints
- `roadmap_baseline_snapshots_roadmap_id_version_key`: UNIQUE (roadmap_id, version)

## Indexes

- `idx_baselines_roadmap_version`
  ```sql
  CREATE INDEX idx_baselines_roadmap_version ON public.roadmap_baseline_snapshots USING btree (roadmap_id, version)
  ```
- `roadmap_baseline_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX roadmap_baseline_snapshots_pkey ON public.roadmap_baseline_snapshots USING btree (id)
  ```
- `roadmap_baseline_snapshots_roadmap_id_version_key`
  ```sql
  CREATE UNIQUE INDEX roadmap_baseline_snapshots_roadmap_id_version_key ON public.roadmap_baseline_snapshots USING btree (roadmap_id, version)
  ```

## RLS Policies

### 1. roadmap_baseline_snapshots_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. roadmap_baseline_snapshots_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
