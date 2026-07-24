# venture_stage_work_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 6
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| lifecycle_stage | `integer(32)` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| stage_status | `character varying(20)` | YES | - | - |
| work_type | `character varying(30)` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| health_score | `character varying(10)` | YES | - | - |
| advisory_data | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
