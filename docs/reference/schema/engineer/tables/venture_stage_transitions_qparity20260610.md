# venture_stage_transitions_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 4
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| from_stage | `integer(32)` | YES | - | - |
| to_stage | `integer(32)` | YES | - | - |
| transition_type | `text` | YES | - | - |
| approved_by | `text` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| handoff_data | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| idempotency_key | `uuid` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
