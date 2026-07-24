# eva_ventures_qparity20260610 Table

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

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| name | `text` | YES | - | - |
| status | `text` | YES | - | - |
| health_status | `text` | YES | - | - |
| mrr | `numeric(12,2)` | YES | - | - |
| mrr_growth_rate | `numeric(5,2)` | YES | - | - |
| churn_rate | `numeric(5,2)` | YES | - | - |
| burn_rate | `numeric(12,2)` | YES | - | - |
| runway_months | `integer(32)` | YES | - | - |
| decision_class | `text` | YES | - | - |
| last_decision_at | `timestamp with time zone` | YES | - | - |
| pending_decisions | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| orchestrator_state | `text` | YES | - | - |
| orchestrator_lock_id | `uuid` | YES | - | - |
| orchestrator_lock_acquired_at | `timestamp with time zone` | YES | - | - |
| autonomy_level | `USER-DEFINED` | YES | - | - |
| current_lifecycle_stage | `integer(32)` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
