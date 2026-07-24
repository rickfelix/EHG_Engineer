# factory_guardrail_state_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | YES | - | - |
| corrections_today | `integer(32)` | YES | - | - |
| kill_switch_active | `boolean` | YES | - | - |
| last_correction_at | `timestamp with time zone` | YES | - | - |
| canary_expires_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
