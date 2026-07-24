# sd_baseline_items_purge_backup_20260609 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 12,932
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| baseline_id | `uuid` | YES | - | - |
| sd_id | `text` | YES | - | - |
| sequence_rank | `integer(32)` | YES | - | - |
| track | `text` | YES | - | - |
| track_name | `text` | YES | - | - |
| estimated_effort_hours | `numeric(6,2)` | YES | - | - |
| planned_start_date | `date` | YES | - | - |
| planned_end_date | `date` | YES | - | - |
| dependencies_snapshot | `jsonb` | YES | - | - |
| dependency_health_score | `numeric(3,2)` | YES | - | - |
| is_ready | `boolean` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| strategy_objective_id | `uuid` | YES | - | - |
| strategy_weight | `numeric` | YES | - | - |
| time_horizon | `text` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
