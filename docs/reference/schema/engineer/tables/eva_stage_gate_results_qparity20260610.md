# eva_stage_gate_results_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 12
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| stage_number | `integer(32)` | YES | - | - |
| gate_type | `text` | YES | - | - |
| overall_score | `numeric(5,2)` | YES | - | - |
| passed | `boolean` | YES | - | - |
| evaluated_at | `timestamp with time zone` | YES | - | - |
| evaluated_by | `text` | YES | - | - |
| gate_criteria | `jsonb` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
