# eva_automation_executions_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| rule_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| decision_id | `uuid` | YES | - | - |
| trigger_event | `jsonb` | YES | - | - |
| action_taken | `jsonb` | YES | - | - |
| status | `character varying(50)` | YES | - | - |
| blocked_reason | `text` | YES | - | - |
| result | `jsonb` | YES | - | - |
| executed_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
