# eva_events_qparity20260610 Table

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

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| eva_venture_id | `uuid` | YES | - | - |
| event_type | `text` | YES | - | - |
| event_source | `text` | YES | - | - |
| event_data | `jsonb` | YES | - | - |
| processed | `boolean` | YES | - | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| trace_id | `uuid` | YES | - | - |
| retry_count | `integer(32)` | YES | - | - |
| idempotency_key | `text` | YES | - | - |
| last_error | `text` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
