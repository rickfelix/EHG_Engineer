# eva_scheduler_queue_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| last_blocking_decision_at | `timestamp with time zone` | YES | - | - |
| fifo_key | `timestamp with time zone` | YES | - | - |
| status | `text` | YES | - | - |
| max_stages_per_cycle | `integer(32)` | YES | - | - |
| last_dispatched_at | `timestamp with time zone` | YES | - | - |
| last_dispatch_outcome | `text` | YES | - | - |
| dispatch_count | `integer(32)` | YES | - | - |
| error_count | `integer(32)` | YES | - | - |
| last_error | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| blocking_decision_age_seconds | `numeric` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
