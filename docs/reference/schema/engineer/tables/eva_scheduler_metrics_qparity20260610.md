# eva_scheduler_metrics_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 995
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| event_type | `text` | YES | - | - |
| occurred_at | `timestamp with time zone` | YES | - | - |
| scheduler_instance_id | `text` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| stage_name | `text` | YES | - | - |
| outcome | `text` | YES | - | - |
| failure_reason | `text` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| queue_depth | `integer(32)` | YES | - | - |
| dispatched_count | `integer(32)` | YES | - | - |
| paused | `boolean` | YES | - | - |
| pause_reason | `text` | YES | - | - |
| stages_dispatched | `integer(32)` | YES | - | - |
| stages_remaining | `integer(32)` | YES | - | - |
| max_stages_per_cycle | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
